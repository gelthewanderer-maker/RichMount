import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {FILE_MAX_BYTES,feedbackFileType} from '../storage/attachment-store.js';
export class AttachmentError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function readAttachment(req,url){
 if(Number(req.headers['content-length'])>FILE_MAX_BYTES)throw new AttachmentError(413,'Choose files of 10 MB or less.');let length=0;const chunks=[];
 for await(const chunk of req){length+=chunk.length;if(length>FILE_MAX_BYTES)throw new AttachmentError(413,'Choose files of 10 MB or less.');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks),filename=(url.searchParams.get('filename')||'').replace(/[\\/\x00-\x1f\x7f]/g,'_').trim().slice(0,120),mime=feedbackFileType(bytes,filename);
 if(!bytes.length||!mime)throw new AttachmentError(415,'Choose a PDF, DOCX, TXT, PNG, JPG or WebP file.');
 return {bytes,meta:{filename,mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
}
const headers=config=>({'OAI-Sites-Authorization':'Bearer '+config.siteToken,Authorization:'Bearer '+config.storeKey});
export async function attachmentStorage(config,id,method,upload){
 const h=headers(config);if(upload){h['Content-Type']=upload.meta.mime;h['Content-Length']=String(upload.bytes.length);h['X-File-Metadata']=Buffer.from(JSON.stringify(upload.meta)).toString('base64');}
 const response=await (config.attachmentFetch||fetch)(config.storeUrl+'/api/feedback-files/'+id,{method,headers:h,body:upload?.bytes,signal:AbortSignal.timeout(65000),redirect:'error'});
 let value;try{value=await response.json();}catch{throw new AttachmentError(503,'File storage is temporarily unavailable. Please retry.');}if(!response.ok)throw new AttachmentError([400,404,409,413,415].includes(response.status)?response.status:503,value.error||'The file could not be saved.');return value;
}
export async function streamAttachment(req,res,row,config){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000),close=()=>{if(!res.writableEnded)controller.abort();};res.once('close',close);
 try{const response=await (config.attachmentFetch||fetch)(config.storeUrl+'/api/feedback-files/'+row.id,{method:req.method,headers:headers(config),signal:controller.signal,redirect:'error'});
  if(!response.ok||response.headers.get('x-file-sha256')!==row.sha256){await response.body?.cancel();throw new AttachmentError(response.status===404?404:503,'The file is unavailable. Refresh your feedback.');}
  res.writeHead(200,{'Content-Type':row.mime,'Content-Length':String(row.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.filename),'Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'"});
  if(req.method==='HEAD'||!response.body){res.end();await response.body?.cancel();return;}await pipeline(Readable.fromWeb(response.body),res,{signal:controller.signal});
 }finally{clearTimeout(timer);res.removeListener('close',close);}
}
