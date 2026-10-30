import {randomBytes,createHash,createHmac,scrypt,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export async function hashPassword(password){const salt=randomBytes(16).toString('hex'),hash=await derive(password,salt,64);return 'scrypt$'+salt+'$'+hash.toString('hex');}
export async function verifyPassword(password,encoded){
  const [type,salt,hex]=String(encoded||'').split('$');if(!['scrypt','scrypt-v2'].includes(type)||!/^[0-9a-f]{32}$/.test(salt||'')||!/^[0-9a-f]{128}$/.test(hex||''))return false;
  if(typeof password!=='string'||password.length>300)return false;
  const hash=await derive(password,salt,64,type==='scrypt-v2'?{N:32768,r:8,p:3,maxmem:64*1024*1024}:{});return timingSafeEqual(hash,Buffer.from(hex,'hex'));
}
export async function hashStudentPassword(password){const salt=randomBytes(16).toString('hex'),hash=await derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});return 'scrypt-v2$'+salt+'$'+hash.toString('hex');}
export const studentVersion=(student,credentials)=>credentials?.session_version||digest('student-initial:'+student.code_hash);
export function validStudentCode(password,student,key){if(typeof password!=='string'||password.length>200)return false;return timingSafeEqual(Buffer.from(codeHash(password,key)),Buffer.from(student.code_hash));}
export function makeStudentSession(id,version,key,temporary=false,now=Date.now()){
 const value=Buffer.from(JSON.stringify({sub:id,version,exp:now+(temporary?20*60000:7*86400000)})).toString('base64url');return 'RMS.'+value+'.'+sign('student:'+value,key);
}
export function readStudentSession(token,key,now=Date.now()){
 try{if(typeof token!=='string'||token.length>700)return null;const [type,value,signature,...extra]=token.split('.'),expected=sign('student:'+value,key);if(type!=='RMS'||extra.length||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;const data=JSON.parse(Buffer.from(value,'base64url'));if(!/^[0-9a-f-]{36}$/i.test(data.sub||'')||!/^[0-9a-f]{64}$/.test(data.version||'')||!Number.isSafeInteger(data.exp)||data.exp<=now||data.exp>now+7*86400000+60000)return null;return data;}catch{return null;}
}
export const digest=v=>createHash('sha256').update(v).digest('hex');
export const codeHash=(code,key)=>createHmac('sha256',key).update(String(code).trim().toUpperCase()).digest('hex');
export const makeCode=()=> 'RM-'+randomBytes(12).toString('hex').toUpperCase();
export function encryptCode(code,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv),data=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
export function decryptCode(value,key){const all=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),all.subarray(0,12));decipher.setAuthTag(all.subarray(12,28));return Buffer.concat([decipher.update(all.subarray(28)),decipher.final()]).toString('utf8');}
const sign=(v,key)=>createHmac('sha256',key).update(v).digest('base64url');
export function makeSession(passwordHash,key){const value=Buffer.from(JSON.stringify({exp:Date.now()+8*3600000,version:digest(passwordHash)})).toString('base64url');return value+'.'+sign(value,key);}
export function validSession(token,passwordHash,key){try{const [value,signature]=String(token).split('.'),expected=sign(value,key);if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;const data=JSON.parse(Buffer.from(value,'base64url'));return data.exp>Date.now()&&data.version===digest(passwordHash);}catch{return false;}}
