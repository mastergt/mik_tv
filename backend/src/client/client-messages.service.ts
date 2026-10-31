import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../common/db';
import { ClientSession, jsonObject, numId, onlyKeys } from './client-auth';

@Injectable()
export class ClientMessagesService {
  constructor(@Inject(Db) private readonly db:Db){}
  async list(ctx:ClientSession){
    if(!ctx.abonent_id)return {items:[]};
    const rows=await this.db.rows<{image_key:string|null;[key:string]:unknown}>(`
      SELECT d.id::text delivery_id,d.status delivery_status,d.created_at,
        m.id::text message_id,m.title,m.body,m.display_type,m.priority,m.duration_seconds,
        m.ticker_speed,m.requires_ack,m.image_key
      FROM messaging.deliveries d
      JOIN messaging.dispatches ds ON ds.id=d.dispatch_id AND ds.status='completed'
      JOIN messaging.messages m ON m.id=ds.message_id
      WHERE d.status IN ('pending','sent','shown') AND m.enabled AND m.status='active'
        AND ((d.abonent_id=$1 AND d.terminal_id IS NULL) OR d.terminal_id=$2)
      ORDER BY m.priority DESC,d.id DESC LIMIT 100`,[ctx.abonent_id,ctx.terminal_id]);
    return {items:rows.map(({image_key,...r})=>({...r,image_url:image_key?`/api/v1/messages/images/${image_key}`:null}))};
  }
  async receipt(ctx:ClientSession,deliveryRaw:string,raw:unknown){
    if(!ctx.abonent_id)throw new ForbiddenException('Subscriber session required');
    const id=numId(deliveryRaw,'delivery_id');
    const d=jsonObject(raw);onlyKeys(d,['status']);
    if(d.status!=='shown'&&d.status!=='acknowledged')throw new BadRequestException('status must be shown or acknowledged');
    const r=await this.db.one(`UPDATE messaging.deliveries d
      SET status=CASE WHEN d.status='acknowledged' THEN 'acknowledged' ELSE $3 END,
        shown_at=COALESCE(d.shown_at,now()),
        acknowledged_at=CASE WHEN $3='acknowledged' THEN COALESCE(d.acknowledged_at,now()) ELSE d.acknowledged_at END
      WHERE d.id=$4 AND d.status IN ('pending','sent','shown','acknowledged')
        AND ((d.abonent_id=$1 AND d.terminal_id IS NULL) OR d.terminal_id=$2)
      RETURNING d.id::text delivery_id,d.status`,[ctx.abonent_id,ctx.terminal_id,d.status,id]);
    if(!r)throw new NotFoundException('Delivery not found');
    return r;
  }
}
