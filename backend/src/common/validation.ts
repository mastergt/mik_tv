import { BadRequestException } from '@nestjs/common';
export function allowedFields(obj: Record<string, unknown>, allowed: string[]) {
  const bad = Object.keys(obj).filter(key => !allowed.includes(key));
  if (bad.length) throw new BadRequestException(`Unexpected fields: ${bad.join(', ')}`);
}
export function pickPatch(obj: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const data = Object.fromEntries(Object.entries(obj).filter(([k,v])=>allowed.includes(k) && v!==undefined));
  if (!Object.keys(data).length) throw new BadRequestException('Empty update');
  return data;
}
export function patchSql(table: string, idColumn: string, payload: Record<string,unknown>, start = 1) {
  // Callers pass whitelisted SQL identifiers only; never use arbitrary query keys.
  const keys = Object.keys(payload);
  return { sql: `UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+start}`).join(', ')} WHERE ${idColumn}=$${keys.length+start} RETURNING *`, values: Object.values(payload) };
}
