import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import catalog from '../materials/catalog.json' with {type:'json'};

import overrides from '../materials/slide-overrides.json' with {type:'json'};
export const slideOverrides=id=>overrides.filter(f=>f.sourceId===id);
const files=new Map(catalog.lessons.flatMap(lesson=>lesson.files).concat(overrides).map(file=>[file.id,file]));
const TTL=3*60*60;
export class MaterialError extends Error{constructor(status,message){super(message);this.status=status;}}
export const findMaterial=id=>files.get(id);
// The two editable student papers already have matching PDF copies.
// Students read those copies; teachers retain the editable originals.
const studentViews={'day10-editable-book':'day10-book','final-editable-paper':'final-paper'};
export const studentMaterialView=id=>findMaterial(studentViews[id]||id);
export function materialCatalog(role){return {...catalog,lessons:catalog.lessons.map(lesson=>({...lesson,files:lesson.files.filter(file=>role==='teacher'||file.visibility==='student').map(({key,sha256,order,visibility,...file})=>file)}))};}
const fingerprint=hash=>createHash('sha256').update(hash).digest('hex');
const signature=(body,secret)=>createHmac('sha256',secret).update('richmount-materials-v1:'+body).digest('base64url');

// File-specific, time-limited tickets let native media players make range requests.
// They contain no student code, password, or private storage address.
export function makeMaterialTicket({id,role,subject='',passwordHash='',secret,now=Date.now()}){
  const file=files.get(id);
  if(!file||!['student','teacher'].includes(role)||(role==='student'&&(file.visibility!=='student'||!['application/pdf','audio/mpeg','video/mp4'].includes(file.mime))))throw new MaterialError(404,'Lesson file not found.');
  const expires=Math.floor(now/1000)+TTL;
  const value={id,role,sub:subject,exp:expires,...(passwordHash?{auth:fingerprint(passwordHash)}:{})};
  const body=Buffer.from(JSON.stringify(value)).toString('base64url');
  return {ticket:body+'.'+signature(body,secret),expiresAt:new Date(expires*1000).toISOString()};
}
export function readMaterialTicket(ticket,id,secret,now=Date.now()){
  if(typeof ticket!=='string'||ticket.length>900)return null;
  const parts=ticket.split('.');if(parts.length!==2||!parts.every(part=>/^[A-Za-z0-9_-]+$/.test(part)))return null;
  const actual=Buffer.from(parts[1]),expected=Buffer.from(signature(parts[0],secret));
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{
    const value=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')),seconds=Math.floor(now/1000);
    if(value.id!==id||!['student','teacher'].includes(value.role)||!Number.isSafeInteger(value.exp)||value.exp<=seconds||value.exp>seconds+TTL+60)return null;
    if(value.role==='student'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.sub))return null;
    if(value.role==='teacher'&&!/^[0-9a-f]{64}$/.test(value.auth||''))return null;
    return value;
  }catch{return null;}
}
export const teacherTicketValid=(ticket,passwordHash)=>ticket.auth===fingerprint(passwordHash);

export async function streamMaterial(req,res,file,config,download=false){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  const close=()=>{if(!res.writableEnded)controller.abort();};res.once('close',close);
  try{
    const headers={'OAI-Sites-Authorization':'Bearer '+config.siteToken,'Authorization':'Bearer '+config.storeKey};
    if(req.headers.range)headers.Range=req.headers.range;
    if(req.headers['if-range'])headers['If-Range']=req.headers['if-range'];
    const response=await (config.materialFetch||fetch)(config.storeUrl+'/api/materials/'+file.id,{method:req.method,headers,signal:controller.signal,redirect:'error'});
    clearTimeout(timer);
    if(response.status===404){await response.body?.cancel();throw new MaterialError(404,'This lesson file is not available yet. Please try again shortly.');}
    if(response.status===416){res.writeHead(416,{'Content-Range':response.headers.get('content-range')||'bytes */'+file.size,'Accept-Ranges':'bytes','Cache-Control':'no-store'});res.end();await response.body?.cancel();return;}
    if(![200,206].includes(response.status)||response.headers.get('x-material-sha256')!==file.sha256){await response.body?.cancel();throw new MaterialError(503,'The lesson file could not be reached. Please try again.');}
    const attachment=download||file.kind==='slides'||file.filename.endsWith('.docx');
    const output={'Content-Type':file.mime,'Content-Disposition':(attachment?'attachment':'inline')+"; filename*=UTF-8''"+encodeURIComponent(file.filename),'Cache-Control':'private, no-store','Accept-Ranges':'bytes','Referrer-Policy':'no-referrer','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges, Content-Disposition'};
    for(const name of ['Content-Length','Content-Range','ETag'])if(response.headers.has(name))output[name]=response.headers.get(name);
    res.writeHead(response.status,output);
    if(req.method==='HEAD'||!response.body){res.end();await response.body?.cancel();return;}
    await pipeline(Readable.fromWeb(response.body),res,{signal:controller.signal});
  }finally{clearTimeout(timer);res.removeListener('close',close);}
}
