import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {UUID} from './validation.mjs';
export const AUDIO_MAX_BYTES=25*1024*1024;
export class AudioError extends Error{constructor(status,message){super(message);this.status=status;}}
export const publicAudio=({object_key,sha256,deleted,...row})=>row;
const hash=value=>createHash('sha256').update(value).digest('hex');
const signature=(value,secret)=>createHmac('sha256',secret).update('richmount-audio-v1:'+value).digest('base64url');
const TTL=3*60*60;
export function makeAudioTicket({id,role,subject='',passwordHash='',secret,now=Date.now()}){
  const exp=Math.floor(now/1000)+TTL,value={id,role,sub:subject,exp,...(passwordHash?{auth:hash(passwordHash)}:{})};
  const body=Buffer.from(JSON.stringify(value)).toString('base64url');return {ticket:body+'.'+signature(body,secret),expiresAt:new Date(exp*1000).toISOString()};
}
export function readAudioTicket(ticket,id,secret,now=Date.now()){
  if(typeof ticket!=='string'||ticket.length>900)return null;
  const [body,sig,...extra]=ticket.split('.');if(extra.length||!body||!sig||! /^[A-Za-z0-9_-]+$/.test(body+sig))return null;
  const a=Buffer.from(sig),b=Buffer.from(signature(body,secret));if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  try{const value=JSON.parse(Buffer.from(body,'base64url')),seconds=Math.floor(now/1000);
    if(value.id!==id||!UUID.test(id)||!['student','teacher'].includes(value.role)||!Number.isSafeInteger(value.exp)||value.exp<=seconds||value.exp>seconds+TTL+60||value.role==='student'&&!UUID.test(value.sub)||value.role==='teacher'&&!/^[0-9a-f]{64}$/.test(value.auth||''))return null;return value;
  }catch{return null;}
}
export const audioTeacherValid=(ticket,passwordHash)=>ticket.auth===hash(passwordHash);
export function audioStudentAllowed(row,studentId){return row.role==='teacher'&&!row.submission_id||row.student_id===studentId;}
export async function readAudioUpload(req,url){
  if(Number(req.headers['content-length'])>AUDIO_MAX_BYTES)throw new AudioError(413,'Choose an audio file of 25 MB or less.');
  let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>AUDIO_MAX_BYTES)throw new AudioError(413,'Choose an audio file of 25 MB or less.');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(bytes.length<16)throw new AudioError(400,'Choose a complete audio recording.');
  const ascii=bytes.subarray(0,16).toString('latin1');let mime;
  if(ascii.startsWith('ID3')||bytes[0]===255&&(bytes[1]&224)===224)mime='audio/mpeg';
  else if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE')mime='audio/wav';
  else if(ascii.startsWith('OggS'))mime='audio/ogg';
  else if(bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))mime='audio/webm';
  else if(ascii.slice(4,8)==='ftyp')mime='audio/mp4';
  else if(ascii.startsWith('fLaC'))mime='audio/flac';
  else throw new AudioError(415,'Choose an MP3, M4A, WAV, OGG, WebM or FLAC audio file.');
  const filename=(url.searchParams.get('filename')||'recording.'+({mpeg:'mp3',mp4:'m4a'}[mime.split('/')[1]]||mime.split('/')[1])).replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,120);
  const title=(url.searchParams.get('title')||filename).trim().slice(0,100)||'Audio recording',category=url.searchParams.get('category')||'general';
  if(!['general','speaking','listening-1','listening-2','listening-3','listening-4'].includes(category))throw new AudioError(400,'Choose a valid audio category.');
  return {bytes,meta:{title,filename,mime,size:bytes.length,sha256:hash(bytes),category}};
}
export async function audioStorage(config,id,method,upload){
  const headers={'OAI-Sites-Authorization':'Bearer '+config.siteToken,Authorization:'Bearer '+config.storeKey};
  if(upload){headers['Content-Type']=upload.meta.mime;headers['Content-Length']=String(upload.bytes.length);headers['X-Audio-Metadata']=Buffer.from(JSON.stringify(upload.meta)).toString('base64');}
  const response=await (config.audioFetch||fetch)(config.storeUrl+'/api/audio/'+id,{method,headers,body:upload?.bytes,signal:AbortSignal.timeout(65000),redirect:'error'});
  let value;try{value=await response.json();}catch{throw new AudioError(503,'Audio storage is temporarily unavailable. Please try again.');}
  if(!response.ok)throw new AudioError([400,404,409,413,415].includes(response.status)?response.status:503,value.error||'Audio could not be saved.');return value;
}
export async function streamAudio(req,res,row,config){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000),close=()=>{if(!res.writableEnded)controller.abort();};res.once('close',close);
  try{
    const headers={'OAI-Sites-Authorization':'Bearer '+config.siteToken,Authorization:'Bearer '+config.storeKey};
    for(const name of ['range','if-range'])if(req.headers[name])headers[name]=req.headers[name];
    const response=await (config.audioFetch||fetch)(config.storeUrl+'/api/audio/'+row.id,{method:req.method,headers,signal:controller.signal,redirect:'error'});clearTimeout(timer);
    if(response.status===416){res.writeHead(416,{'Content-Range':response.headers.get('content-range'),'Accept-Ranges':'bytes','Cache-Control':'no-store'});res.end();await response.body?.cancel();return;}
    if(![200,206].includes(response.status)||response.headers.get('x-audio-sha256')!==row.sha256){await response.body?.cancel();throw new AudioError(response.status===404?404:503,'The audio is no longer available. Refresh the attachment list.');}
    const output={'Content-Type':row.mime,'Cache-Control':'private, no-store','Accept-Ranges':'bytes','Referrer-Policy':'no-referrer','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(row.filename),'Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges'};
    for(const name of ['Content-Length','Content-Range','ETag'])if(response.headers.has(name))output[name]=response.headers.get(name);
    res.writeHead(response.status,output);if(req.method==='HEAD'||!response.body){res.end();await response.body?.cancel();return;}await pipeline(Readable.fromWeb(response.body),res,{signal:controller.signal});
  }finally{clearTimeout(timer);res.removeListener('close',close);}
}
