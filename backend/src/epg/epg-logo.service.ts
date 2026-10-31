import { BadRequestException, ForbiddenException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Db } from '../common/db';
import { Authz, Actor } from '../auth/authz';
import { Audit } from '../common/audit';
import { LoggerService } from '../logger/logger.service';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],
  ['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],
  ['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
] as [string, number][]) blocked.addSubnet(network,prefix,'ipv4');
// Do not block ::ffff:0:0/96: Node.js BlockList internally maps IPv4 to IPv6,
// so that rule would inadvertently reject every public IPv4 address.
// IPv4-mapped literals are handled by isPublicAddress() below.
for (const [network,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]] as [string,number][]) blocked.addSubnet(network,prefix,'ipv6');
function isPublicAddress(ip:string):boolean {
  if(ip.startsWith('::ffff:'))return isPublicAddress(ip.slice(7));
  const family=isIP(ip);
  return family!==0 && !blocked.check(ip,family===4?'ipv4':'ipv6');
}
const MAX_LOGO_BYTES=2*1024*1024;
const FILE_RE=/^[0-9a-f]{64}\.(png|jpg|gif|webp)$/;
const TYPE:Record<string,string>={png:'image/png',jpg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
function imageExtension(data:Buffer):string {
  if(data.length>=8 && data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'png';
  if(data.length>=3 && data.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return 'jpg';
  if(data.length>=6 && ['GIF89a','GIF87a'].includes(data.toString('ascii',0,6)))return 'gif';
  if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'webp';
  throw new BadRequestException('Формат логотипа не поддерживается (PNG, JPG, GIF, WebP). SVG запрещён для безопасности.');
}
function positiveInt(value:unknown,field:string){
  const n=Number(value);
  if(value===null||value===undefined||value===''||!Number.isSafeInteger(n)||n<=0)throw new BadRequestException(`Invalid ${field}`);
  return n;
}
async function downloadLogo(urlRaw:string, redirects=0):Promise<Buffer> {
  if(redirects>3)throw new BadRequestException('Слишком много перенаправлений при загрузке логотипа');
  let url:URL;
  try{url=new URL(urlRaw);}catch{throw new BadRequestException('Некорректный icon_url');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||
     (url.port && url.port!==(url.protocol==='https:'?'443':'80')))
    throw new BadRequestException('Логотип должен быть доступен по HTTP/HTTPS со стандартным портом');
  if(url.hostname.length>253)throw new BadRequestException('Неверное имя хоста');
  const ips=await lookup(url.hostname,{all:true});
  if(!ips.length||ips.some(ip=>!isPublicAddress(ip.address)))throw new BadRequestException('Логотип указывает на закрытый IP-адрес');
  const selected=ips[0];
  const response=await new Promise<IncomingMessage>((ok,fail)=>{
    const requestFn=url.protocol==='https:'?httpsRequest:httpRequest;
    const req=requestFn(url,{method:'GET',timeout:12000,headers:{'User-Agent':'IPTV-Control-Logo/0.5','Accept':'image/png,image/jpeg,image/webp,image/gif,*/*'},
      lookup:(_host, options, cb)=>{
        if(options.all)cb(null,ips);
        else cb(null,selected.address,selected.family);
      }},ok);
    req.on('timeout',()=>req.destroy(new Error('Тайм-аут загрузки логотипа')));
    req.on('error',fail);req.end();
  });
  if(response.statusCode && [301,302,303,307,308].includes(response.statusCode)){
    const next=response.headers.location;response.resume();
    if(!next)throw new BadRequestException('Redirect без Location');
    return downloadLogo(new URL(next,url).toString(),redirects+1);
  }
  if(response.statusCode!==200){response.resume();throw new BadRequestException(`Ошибка загрузки логотипа: HTTP ${response.statusCode}`);}
  const declared=Number(response.headers['content-length']??'0');
  if(declared>MAX_LOGO_BYTES){response.destroy();throw new BadRequestException('Логотип слишком большой');}
  const chunks:Buffer[]=[];let total=0;
  for await (const item of response){const chunk=Buffer.isBuffer(item)?item:Buffer.from(item);total+=chunk.length;
    if(total>MAX_LOGO_BYTES){response.destroy();throw new BadRequestException('Логотип превышает 2 МБ');}
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,total);
}

@Injectable()
export class EpgLogoService {
  private readonly directory=resolve(process.env.EPG_LOGO_DIR||'./storage/epg-logos');
  constructor(@Inject(Db) private readonly db:Db,@Inject(Authz) private readonly authz:Authz,
    @Inject(Audit) private readonly audit:Audit,@Inject(LoggerService) private readonly log:LoggerService){}
  private file(fileName:string){if(!FILE_RE.test(fileName))throw new NotFoundException('Логотип не найден');return join(this.directory,fileName);}
  async fileData(fileName:string){
    const type=TYPE[fileName.split('.').pop()||''];
    try{return {body:await readFile(this.file(fileName)),contentType:type};}
    catch(e){if(e instanceof NotFoundException)throw e;throw new NotFoundException('Логотип не найден');}
  }
  static urlForKey(key:string|null|undefined):string|null{
    if(!key||!key.startsWith('epg-logos/'))return null;
    const name=key.slice('epg-logos/'.length);
    return FILE_RE.test(name)?`/api/v1/epg/logos/${name}`:null;
  }
  async fromEpg(actor:Actor,streamRaw:string,raw:unknown){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Ожидается объект');
    const d=raw as Record<string,unknown>;
    if(Object.keys(d).some(x=>!['epg_channel_id','provider_id'].includes(x)))throw new BadRequestException('Неизвестное поле');
    const streamId=positiveInt(streamRaw,'streamId');
    const epgId=positiveInt(d.epg_channel_id,'epg_channel_id');
    const pid=d.provider_id===null||d.provider_id===undefined?null:positiveInt(d.provider_id,'provider_id');
    if(pid===null){await this.authz.global(actor,'epg.write');await this.authz.global(actor,'streams.write');}
    else {await this.authz.provider(actor,'epg.write',pid);await this.authz.provider(actor,'streams.write',pid);await this.authz.ensureStreamVisible(String(streamId),pid);}
    const row=await this.db.one<{icon_url:string|null;channel_name:string|null}>(`
      SELECT ch.icon_url,ch.display_name channel_name FROM epg.stream_mappings m
      JOIN epg.channels ch ON ch.id=m.epg_channel_id
      JOIN epg.sources src ON src.id=ch.source_id
      WHERE m.stream_id=$1 AND m.epg_channel_id=$2 AND m.provider_id IS NOT DISTINCT FROM $3::integer AND m.enabled
        AND ($3::integer IS NULL OR src.visibility='all' OR EXISTS(
          SELECT 1 FROM epg.source_providers sp WHERE sp.source_id=src.id AND sp.provider_id=$3))
      LIMIT 1`,[streamId,epgId,pid]);
    if(!row)throw new ForbiddenException('Сначала сохраните EPG-сопоставление');
    if(!row.icon_url)throw new BadRequestException('У выбранного EPG-канала отсутствует icon_url');
    const binary=await downloadLogo(row.icon_url);
    const ext=imageExtension(binary);
    const hash=createHash('sha256').update(binary).digest('hex');
    const fileName=`${hash}.${ext}`;
    const logoKey=`epg-logos/${fileName}`;
    await mkdir(this.directory,{recursive:true,mode:0o750});
    await writeFile(this.file(fileName),binary,{flag:'wx',mode:0o640}).catch((e:NodeJS.ErrnoException)=>{
      if(e.code!=='EEXIST')throw e;
    });
    await this.db.tx(async c=>{
      if(pid===null){
        const result=await c.query('UPDATE catalog.streams SET logo_key=$1,updated_by=$2 WHERE id=$3',[logoKey,actor.id,streamId]);
        if(!result.rowCount)throw new NotFoundException('Канал отсутствует');
      }else{
        await c.query(`INSERT INTO catalog.stream_provider_overrides(stream_id,provider_id,logo_key_override,updated_by)
          VALUES($1,$2,$3,$4) ON CONFLICT (stream_id,provider_id)
          DO UPDATE SET logo_key_override=excluded.logo_key_override,updated_by=excluded.updated_by`,[streamId,pid,logoKey,actor.id]);
      }
      await this.audit.write(c,actor.id,'epg.logo.import','catalog.streams',String(streamId),pid,['logo_key']);
    });
    this.log.info(`EPG logo cached stream=${streamId} provider=${pid??'all'} size=${binary.length}`,'EPG');
    return {logo_key:logoKey,logo_url:EpgLogoService.urlForKey(logoKey),epg_channel_id:String(epgId)};
  }
}
