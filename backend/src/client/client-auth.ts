import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Db } from '../common/db';
import type { Request } from 'express';

export type ClientSession = {
  session_id: string;
  terminal_id: string;
  abonent_id: string|null;
  provider_id: number;
  device_uuid: string;
  auth_type: 'guest'|'local'|'external';
};
export type ClientRequest = Request & { client: ClientSession };
export const tokenHash = (s:string) => createHash('sha256').update(s).digest('hex');
export const issueToken = () => randomBytes(48).toString('base64url');
export const issueSecret = () => randomBytes(32).toString('base64url');
export function jsonObject(v:unknown):Record<string,unknown> {
  if(!v || typeof v!=='object' || Array.isArray(v))throw new BadRequestException('JSON object required');
  return v as Record<string,unknown>;
}
export function onlyKeys(v:Record<string,unknown>, keys:readonly string[]){
  const bad=Object.keys(v).filter(k=>!keys.includes(k));
  if(bad.length)throw new BadRequestException(`Unknown fields: ${bad.join(', ')}`);
}
export function textValue(v:unknown,field:string,max:number,optional=false):string|null {
  if((v===undefined || v===null) && optional)return null;
  if(typeof v!=='string'||!v.trim()||v.length>max)throw new BadRequestException(`Invalid ${field}`);
  return v.trim();
}
export function numId(v:unknown, field='id'):string {
  if(typeof v!=='string'&&typeof v!=='number')throw new BadRequestException(`Invalid ${field}`);
  const str=String(v);
  if(!/^[1-9][0-9]{0,18}$/.test(str)||BigInt(str)>9223372036854775807n)
    throw new BadRequestException(`Invalid ${field}`);
  return str;
}

@Injectable()
export class ClientGuard implements CanActivate {
  constructor(@Inject(Db) private readonly db:Db){}
  async canActivate(ctx:ExecutionContext):Promise<boolean> {
    const req=ctx.switchToHttp().getRequest<ClientRequest>();
    const raw=req.headers.authorization;
    if(!raw?.startsWith('Bearer '))throw new UnauthorizedException('Client session required');
    const token=raw.slice(7);
    if(!/^[A-Za-z0-9_-]{64}$/.test(token))throw new UnauthorizedException('Invalid client session');
    const session=await this.db.one<ClientSession>(`
      SELECT ts.id::text session_id,ts.terminal_id::text terminal_id,ts.abonent_id::text abonent_id,
        t.provider_id,t.device_uuid::text device_uuid,ts.auth_type
      FROM subscribers.terminal_sessions ts
      JOIN subscribers.terminals t ON t.id=ts.terminal_id
      JOIN core.providers p ON p.id=t.provider_id
      LEFT JOIN subscribers.abonents a ON a.id=ts.abonent_id
      WHERE ts.refresh_token_hash=$1 AND ts.revoked_at IS NULL AND ts.ended_at IS NULL
        AND ts.expires_at>now() AND t.enabled AND p.enabled
        AND (ts.abonent_id IS NULL OR (a.enabled AND a.provider_id=t.provider_id AND t.abonent_id=ts.abonent_id))
      LIMIT 1`,[tokenHash(token)]);
    if(!session)throw new UnauthorizedException('Client session expired or revoked');
    req.client=session;
    return true;
  }
}
