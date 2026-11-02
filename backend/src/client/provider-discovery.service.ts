import { isIP } from 'node:net';
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { Db } from '../common/db';

type Match = {id:number;slug:string;name:string;source:'network'|'default'};

/**
 * Never use untrusted X-Forwarded-For. nginx overwrites X-Real-IP and is the
 * only trusted hop (Node listens on 127.0.0.1). Direct requests use socket IP.
 */
export function requestClientIp(req: Pick<Request,'socket'|'headers'>): string {
  const socketIp = req.socket.remoteAddress || '';
  const local = socketIp==='127.0.0.1' || socketIp==='::1' || socketIp==='::ffff:127.0.0.1';
  const provided = local ? req.headers['x-real-ip'] : undefined;
  const candidate = (typeof provided==='string' && isIP(provided) ? provided : socketIp);
  if(!isIP(candidate)) throw new ServiceUnavailableException('Client IP unavailable');
  return candidate.startsWith('::ffff:') && isIP(candidate.slice(7))===4 ? candidate.slice(7) : candidate;
}

@Injectable()
export class ProviderDiscoveryService {
  constructor(@Inject(Db) private readonly db:Db){}

  async match(req: Request):Promise<Match> {
    const ip=requestClientIp(req);
    const row=await this.db.one<Match>(`
      SELECT p.id,p.slug,p.name,'network'::text AS source
      FROM core.provider_ip_ranges n
      JOIN core.providers p ON p.id=n.provider_id
      WHERE p.enabled AND $1::inet <<= n.network
      ORDER BY masklen(n.network) DESC, p.id ASC LIMIT 1
    `,[ip]);
    if(row)return row;
    const fallback=await this.db.one<Match>(`
      SELECT id,slug,name,'default'::text AS source FROM core.providers
      WHERE enabled AND is_default LIMIT 1
    `);
    if(fallback)return fallback;
    throw new NotFoundException({code:'PROVIDER_NOT_FOUND',message:'Provider not found for client IP'});
  }

  async discover(req:Request) {
    const provider=await this.match(req);
    const configured=process.env.CLIENT_PUBLIC_API_URL || 'https://start.iptv.artelmik.ru/api/v1';
    let url:URL;
    try{url=new URL(configured);}catch{throw new ServiceUnavailableException('CLIENT_PUBLIC_API_URL is invalid');}
    if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api/v1'))
      throw new ServiceUnavailableException('CLIENT_PUBLIC_API_URL must be a public HTTPS /api/v1 URL');
    return {
      api_version:1,
      api_base_url:url.toString().replace(/\/$/,''),
      provider:{id:provider.id,slug:provider.slug,name:provider.name},
      match:provider.source
    };
  }
}
