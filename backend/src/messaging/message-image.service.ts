import {BadRequestException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Authz,Actor} from '../auth/authz';
import {providerId} from '../common/http';

const filename=/^[a-f0-9]{64}\.(png|jpg|webp)$/;
function imageType(b:Buffer):{ext:string;mime:string}|null{
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {ext:'png',mime:'image/png'};
 if(b.length>=3&&b.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return {ext:'jpg',mime:'image/jpeg'};
 if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return {ext:'webp',mime:'image/webp'};
 return null;
}
@Injectable()
export class MessageImageService {
 private readonly dir=resolve(process.env.MESSAGING_IMAGE_DIR??'./storage/message-images');
 constructor(@Inject(Authz) private readonly authz:Authz){}
 async upload(actor:Actor,file:{buffer:Buffer;size:number}|undefined,pid?:string){
  if(pid===undefined)await this.authz.global(actor,'messages.write');
  else await this.authz.provider(actor,'messages.write',providerId(pid));
  if(!file?.buffer||file.size>2*1024*1024||file.size<10)throw new BadRequestException('Upload PNG, JPEG or WebP (max 2MB)');
  const type=imageType(file.buffer);
  if(!type)throw new BadRequestException('Invalid image format (PNG/JPEG/WebP only)');
  const key=`${createHash('sha256').update(file.buffer).digest('hex')}.${type.ext}`;
  await mkdir(this.dir,{recursive:true,mode:0o750});
  try{await writeFile(join(this.dir,key),file.buffer,{flag:'wx',mode:0o640});}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  return {image_key:key,url:`/api/v1/messages/images/${key}`};
 }
 async read(key:string){
  if(!filename.test(key))throw new NotFoundException('Image not found');
  const mime=key.endsWith('.png')?'image/png':key.endsWith('.jpg')?'image/jpeg':'image/webp';
  try{return {buffer:await readFile(join(this.dir,key)),mime};}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new NotFoundException('Image not found');throw e;}
 }
}
