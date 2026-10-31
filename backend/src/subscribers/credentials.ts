import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import * as argon2 from 'argon2';
function secret():Buffer {
 const hex=process.env.ABONENT_PASSWORD_KEY;
 if(!hex||!/^[a-f0-9]{64}$/i.test(hex)) throw new ServiceUnavailableException('ABONENT_PASSWORD_KEY is not configured');
 return Buffer.from(hex,'hex');
}
export async function encryptPassword(password:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv);
 const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
 return {password_hash:await argon2.hash(password,{type:argon2.argon2id}),
   password_ciphertext:Buffer.concat([iv,cipher.getAuthTag(),encrypted]),password_key_id:'env-v1'};
}
export function decryptPassword(data:Buffer,keyId:string){
 if(keyId!=='env-v1'||data.length<29)throw new ServiceUnavailableException('Unsupported credential format');
 const decipher=createDecipheriv('aes-256-gcm',secret(),data.subarray(0,12));
 decipher.setAuthTag(data.subarray(12,28));
 return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
