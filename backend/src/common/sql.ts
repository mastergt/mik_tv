import { BadRequestException } from '@nestjs/common';
export function sqlInsert(table:string, data:Record<string,unknown>) {
  const keys=Object.keys(data).filter(k=>data[k]!==undefined);
  if(!keys.length) throw new BadRequestException('No values');
  return { sql:`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, values:keys.map(k=>data[k]) };
}
export function sqlUpdate(table:string, data:Record<string,unknown>,id:string,pk='id') {
  const keys=Object.keys(data).filter(k=>data[k]!==undefined);
  if(!keys.length) throw new BadRequestException('No values');
  return {sql:`UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE ${pk}=$${keys.length+1} RETURNING *`,values:[...keys.map(k=>data[k]),id]};
}
export function only<T extends object>(obj:T,keys:readonly string[]) {
  return Object.fromEntries(Object.entries(obj).filter(([k,v])=>keys.includes(k)&&v!==undefined));
}
