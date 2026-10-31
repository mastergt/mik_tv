import { ForbiddenException, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { Db, DbClient } from '../common/db';
export type Actor = { id: string; username: string | null; display_name: string };
export type AdminRequest = import('express').Request & { admin: Actor };
export type Scope = { global: boolean, providers: number[] };

@Injectable()
export class Authz {
  constructor(@Inject(Db) private readonly db: Db) {}
  async scope(actor: Actor, permission: string, c?: DbClient): Promise<Scope> {
    const assignments = await this.db.rows<{provider_id: number|null}>(`
      SELECT a.provider_id FROM auth.user_role_assignments a
      JOIN auth.roles r ON r.id=a.role_id
      JOIN auth.role_permissions rp ON rp.role_id=r.id
      JOIN auth.permissions p ON p.id=rp.permission_id
      WHERE a.user_id=$1 AND p.code=$2`, [actor.id, permission],c);
    return { global: assignments.some(x => x.provider_id === null), providers: [...new Set(assignments.filter(x => x.provider_id !== null).map(x => x.provider_id!))] };
  }
  async capabilities(actor: Actor): Promise<Record<string, Scope>> {
    const rows=await this.db.rows<{code:string,provider_id:number|null}>(`
      SELECT DISTINCT p.code,a.provider_id FROM auth.user_role_assignments a
      JOIN auth.role_permissions rp ON rp.role_id=a.role_id
      JOIN auth.permissions p ON p.id=rp.permission_id WHERE a.user_id=$1`,[actor.id]);
    const result:Record<string,Scope>={};
    for(const r of rows) {
      const bucket=result[r.code]??(result[r.code]={global:false,providers:[]});
      if(r.provider_id===null)bucket.global=true;
      else if(!bucket.providers.includes(r.provider_id))bucket.providers.push(r.provider_id);
    }
    return result;
  }
  async global(actor: Actor, permission: string, c?: DbClient): Promise<void> {
    if (!(await this.scope(actor, permission, c)).global) throw new ForbiddenException(`Global ${permission} permission required`);
  }
  async provider(actor: Actor, permission: string, id: number, c?: DbClient): Promise<void> {
    const s = await this.scope(actor, permission, c);
    if (!s.global && !s.providers.includes(id)) throw new ForbiddenException(`${permission} permission denied for provider ${id}`);
  }
  async listScope(actor: Actor, permission: string, pid?: number): Promise<Scope> {
    const s = await this.scope(actor, permission);
    if (pid !== undefined) {
      if (!s.global && !s.providers.includes(pid)) throw new ForbiddenException('Provider scope denied');
      return { global: false, providers: [pid] };
    }
    if (!s.global) throw new ForbiddenException('Specify providerId for provider-scoped access');
    return s;
  }
  async ensureStreamVisible(streamId: string, pid: number, c?: DbClient) {
    const r = await this.db.one<{ok:boolean}>('SELECT catalog.stream_visible_to_provider($1,$2) ok', [streamId,pid],c);
    if (!r?.ok) throw new ForbiddenException('Stream is not available to this provider');
  }
}
