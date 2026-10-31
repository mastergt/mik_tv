import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

export type DbClient = Pick<PoolClient, 'query'>;

@Injectable()
export class Db implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 15, application_name: 'iptv-admin-api' });
  }
  async rows<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], client?: DbClient): Promise<T[]> {
    const result = await (client ?? this.pool).query<T>(sql, params);
    return result.rows;
  }
  async one<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], client?: DbClient): Promise<T | null> {
    return (await this.rows<T>(sql, params, client))[0] ?? null;
  }
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally { c.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}
