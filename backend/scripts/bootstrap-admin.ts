import * as argon2 from 'argon2';
import { Pool } from 'pg';

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  console.log('[bootstrap] Creating the first IPTV administrator');
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const database = process.env.DATABASE_URL;
  if (!database) throw new Error('DATABASE_URL is missing in .env');
  if (!username || username.length < 3)
    throw new Error('BOOTSTRAP_ADMIN_USERNAME must contain at least 3 characters');
  if (!password) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is empty or not exported');
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new Error(`Administrator password is too short: ${password.length} characters. Minimum: ${MIN_PASSWORD_LENGTH}. No user was created.`);
  try {
    const url = new URL(database);
    console.log(`[bootstrap] Target database: ${decodeURIComponent(url.pathname.slice(1))}`);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection URL');
  }
  const pool = new Pool({ connectionString: database, max: 1 });
  try {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(948320)');
      const count = await c.query<{ n: string }>('SELECT count(*) AS n FROM auth.users');
      if (Number(count.rows[0].n) !== 0)
        throw new Error('Bootstrap cancelled: auth.users is not empty. Use normal user management.');
      const role = await c.query<{ id: number }>("SELECT id FROM auth.roles WHERE code='superadmin'");
      if (!role.rows[0]) throw new Error('Superadmin role not found; apply migrations 0001-0006 first');
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await c.query<{ id: string }>(`INSERT INTO auth.users(username, display_name, password_hash, status)
        VALUES($1, $2, $3, 'active') RETURNING id::text`, [username, username, hash]);
      await c.query('INSERT INTO auth.user_role_assignments(user_id, role_id) VALUES($1, $2)', [user.rows[0].id, role.rows[0].id]);
      await c.query('COMMIT');
      console.log(`[bootstrap] SUCCESS: superadmin '${username}' created (ID ${user.rows[0].id}).`);
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  } finally {
    await pool.end();
  }
}

void main().catch(error => {
  console.error(`[bootstrap] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
