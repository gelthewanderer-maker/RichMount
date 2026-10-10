import {randomBytes,createHash,createHmac,scrypt,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export async function hashPassword(password){const salt=randomBytes(16).toString('hex'),hash=await derive(password,salt,64);return 'scrypt$'+salt+'$'+hash.toString('hex');}
export async function verifyPassword(password,encoded){
  const [type,salt,hex]=String(encoded||'').split('$');if(type!=='scrypt'||!/^[0-9a-f]{32}$/.test(salt||'')||!/^[0-9a-f]{128}$/.test(hex||''))return false;
  if(typeof password!=='string'||password.length>300)return false;
  const hash=await derive(password,salt,64);return timingSafeEqual(hash,Buffer.from(hex,'hex'));
}
export const digest=v=>createHash('sha256').update(v).digest('hex');
export const codeHash=(code,key)=>createHmac('sha256',key).update(String(code).trim().toUpperCase()).digest('hex');
export const makeCode=()=> 'RM-'+randomBytes(12).toString('hex').toUpperCase();
export function encryptCode(code,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv),data=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
export function decryptCode(value,key){const all=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),all.subarray(0,12));decipher.setAuthTag(all.subarray(12,28));return Buffer.concat([decipher.update(all.subarray(28)),decipher.final()]).toString('utf8');}
const sign=(v,key)=>createHmac('sha256',key).update(v).digest('base64url');
export function makeSession(passwordHash,key){const value=Buffer.from(JSON.stringify({exp:Date.now()+8*3600000,version:digest(passwordHash)})).toString('base64url');return value+'.'+sign(value,key);}
export function validSession(token,passwordHash,key){try{const [value,signature]=String(token).split('.'),expected=sign(value,key);if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;const data=JSON.parse(Buffer.from(value,'base64url'));return data.exp>Date.now()&&data.version===digest(passwordHash);}catch{return false;}}
