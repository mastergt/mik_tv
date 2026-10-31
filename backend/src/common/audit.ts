import { Injectable } from '@nestjs/common';
import type { DbClient } from './db';

@Injectable()
export class Audit {
  async write(c: DbClient, actorId: string, action: string, table: string, entityId: string, providerId: number | null, fields: string[] = []) {
    const [schema, name] = table.split('.');
    await c.query(`INSERT INTO audit.events(actor_user_id, action, entity_schema, entity_table, entity_id, provider_id, changed_fields)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [actorId, action, schema, name, entityId, providerId, fields]);
  }
}
