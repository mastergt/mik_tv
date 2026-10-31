import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { DbClient, Db } from './db';
import { DatabaseError } from 'pg';

export function intId(v: string | number, label = 'id'): string {
  const s = String(v);
  if (!/^[1-9][0-9]{0,18}$/.test(s) || BigInt(s) > 9223372036854775807n)
    throw new BadRequestException(`Invalid ${label}`);
  return s;
}
export function providerId(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) throw new BadRequestException('Invalid providerId');
  return n;
}
export function page(query: { limit?: string, offset?: string }) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0)
    throw new BadRequestException('Invalid pagination');
  return { limit, offset };
}
export async function existsOr404(db: Db, sql: string, args: unknown[], c?: DbClient): Promise<void> {
  if (!(await db.one(sql, args, c))) throw new NotFoundException('Resource not found');
}
export async function requireProviders(db: Db, ids: number[], c?: DbClient): Promise<void> {
  if (!ids.length) return;
  const rows = await db.rows('SELECT id FROM core.providers WHERE id = ANY($1::integer[])', [ids], c);
  if (rows.length !== ids.length) throw new BadRequestException('Unknown provider ID');
}
export function dbError(err: unknown): never {
  if (err instanceof DatabaseError) {
    if (['23505', '23503', '23514', '23P01'].includes(err.code ?? '')) throw new ConflictException('Database constraint violation');
    if (err.code === '22P02') throw new BadRequestException('Invalid query value');
  }
  throw err;
}
