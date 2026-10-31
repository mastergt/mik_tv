import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../common/db';
import { Audit } from '../common/audit';
import { Authz, Actor } from '../auth/authz';
import { ProviderDto } from '../common/dto';
import { dto } from '../common/validate';
import { dbError, intId, page } from '../common/http';
import { only, sqlInsert, sqlUpdate } from '../common/sql';
const columns=['name','slug','enabled','timezone','default_terminal_limit','default_concurrent_stream_limit','playback_history_enabled','stream_monitoring_enabled'];
@Injectable()
export class ProvidersService {
  constructor(@Inject(Db) private readonly db:Db, @Inject(Audit) private readonly audit:Audit, @Inject(Authz) private readonly authz:Authz){}
  async list(actor:Actor,query:{limit?:string;offset?:string}) {
    const {limit,offset}=page(query); const s=await this.authz.scope(actor,'providers.read');
    if (!s.global && !s.providers.length) return [];
    return this.db.rows(`SELECT p.* FROM core.providers p WHERE ($1::boolean OR p.id=ANY($2::integer[]))
      ORDER BY p.id LIMIT $3 OFFSET $4`,[s.global,s.providers,limit,offset]);
  }
  async get(actor:Actor,id:string) {
    const pid=Number(intId(id)); await this.authz.provider(actor,'providers.read',pid);
    const row=await this.db.one('SELECT * FROM core.providers WHERE id=$1',[pid]);
    if(!row) throw new NotFoundException();return row;
  }
  async create(actor:Actor,raw:unknown) {
    await this.authz.global(actor,'providers.write');const v=dto(ProviderDto,raw);
    return this.db.tx(async c=>{
      try {
        const data={...only(v,columns),created_by:actor.id,updated_by:actor.id};
        const r=(await c.query(sqlInsert('core.providers',data).sql,sqlInsert('core.providers',data).values)).rows[0];
        await this.audit.write(c,actor.id,'providers.create','core.providers',String(r.id),r.id,columns.filter(x=>x in v));
        return r;
      } catch(e){dbError(e)}
    });
  }
  async update(actor:Actor,id:string,raw:unknown) {
    await this.authz.global(actor,'providers.write');const v=dto(ProviderDto,raw,true);const pid=intId(id);
    return this.db.tx(async c=>{
      try {
        const data={...only(v,columns),updated_by:actor.id};const q=sqlUpdate('core.providers',data,pid);
        const r=(await c.query(q.sql,q.values)).rows[0];if(!r)throw new NotFoundException();
        await this.audit.write(c,actor.id,'providers.update','core.providers',pid,r.id,Object.keys(v));return r;
      }catch(e){dbError(e)}
    });
  }
}
