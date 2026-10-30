const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FILE_MAX_BYTES=10*1024*1024;
export const FILE_MAX_COUNT=10;
export const ATTACHMENT_SCHEMA=`CREATE TABLE IF NOT EXISTS classroom_feedback_files (
 id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES classroom_submissions(id),filename TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,object_key TEXT NOT NULL,created_at TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0)`;
export async function ensureAttachments(db){await db.prepare(ATTACHMENT_SCHEMA).run();}
export function feedbackFileType(bytes,filename){
 const ext=filename.split('.').pop()?.toLowerCase(),head=new TextDecoder('latin1').decode(bytes.subarray(0,16));
 if(ext==='pdf'&&head.startsWith('%PDF-'))return 'application/pdf';
 if(ext==='png'&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(['jpg','jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(ext==='webp'&&head.startsWith('RIFF')&&head.slice(8,12)==='WEBP')return 'image/webp';
 if(ext==='docx'&&bytes[0]===80&&bytes[1]===75){const text=new TextDecoder('latin1').decode(bytes);if(text.includes('[Content_Types].xml')&&text.includes('word/'))return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';}
 if(ext==='txt'&&!bytes.includes(0)){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);return 'text/plain';}catch{}}
 return null;
}
const publicColumns='a.id,a.submission_id,a.filename,a.mime,a.size,a.created_at,a.published';
export async function attachmentStore(db,op,p){
 await ensureAttachments(db);
 if(op==='attachments:list')return {attachments:(await db.prepare(`SELECT ${publicColumns} FROM classroom_feedback_files a JOIN classroom_submissions s ON s.id=a.submission_id WHERE a.submission_id=? AND a.deleted=0${p.studentId?' AND s.student_id=? AND s.reviewed=1 AND a.published=1':''} ORDER BY a.created_at,a.id`).bind(p.id,...(p.studentId?[p.studentId]:[])).all()).results};
 if(op==='attachments:by-id')return {attachment:await db.prepare('SELECT a.*,s.student_id,s.reviewed FROM classroom_feedback_files a JOIN classroom_submissions s ON s.id=a.submission_id WHERE a.id=? AND a.deleted=0').bind(p.id).first()};
 throw Error('Unknown attachment operation');
}
const error=(status,message)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
async function authorized(request,key){const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!key||!supplied)return false;const digests=await Promise.all([key,supplied].map(v=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));const a=new Uint8Array(digests[0]),b=new Uint8Array(digests[1]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export async function handleAttachment(request,env,id){
 if(!await authorized(request,env.STORE_API_KEY))return error(401,'Not authorized');
 if(!UUID.test(id)||!env.DB||!env.BUCKET)return error(404,'File not found');
 const db=env.DB,bucket=env.BUCKET;await ensureAttachments(db);
 const existing=await db.prepare('SELECT * FROM classroom_feedback_files WHERE id=? AND deleted=0').bind(id).first();
 if(request.method==='DELETE'){
  if(!existing)return error(404,'File not found');await db.prepare('UPDATE classroom_feedback_files SET deleted=1,published=0 WHERE id=?').bind(id).run();await bucket.delete(existing.object_key).catch(()=>{});return Response.json({deleted:true},{headers:{'Cache-Control':'no-store'}});
 }
 if(request.method==='PUT'){
  if(existing)return error(409,'Upload a new attachment instead.');let meta;try{meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(request.headers.get('x-file-metadata')||''),c=>c.charCodeAt(0))));}catch{return error(400,'Invalid file information');}
  const {submissionId,filename,mime,size,sha256}=meta;
  if(!UUID.test(submissionId||'')||typeof filename!=='string'||!filename.trim()||filename.length>120||/[\\/\x00-\x1f\x7f]/.test(filename)||!Number.isInteger(size)||size<1||size>FILE_MAX_BYTES||!/^[0-9a-f]{64}$/.test(sha256||''))return error(400,'Invalid attachment');
  if(!await db.prepare('SELECT id FROM classroom_submissions WHERE id=?').bind(submissionId).first())return error(404,'Submission not found');
  if((await db.prepare('SELECT COUNT(*) AS n FROM classroom_feedback_files WHERE submission_id=? AND deleted=0').bind(submissionId).first()).n>=FILE_MAX_COUNT)return error(409,'Each activity can have up to 10 feedback files.');
  if(Number(request.headers.get('content-length'))>FILE_MAX_BYTES)return error(413,'Choose a file of 10 MB or less.');
  let bytes;try{let length=0;const chunks=[];for await(const chunk of request.body||[]){length+=chunk.length;if(length>FILE_MAX_BYTES)return error(413,'Choose a file of 10 MB or less.');chunks.push(chunk);}bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}}catch{return error(400,'The upload was interrupted. Please try again.');}
  if(bytes.length!==size||feedbackFileType(bytes,filename)!==mime)return error(415,'Choose a valid PDF, DOCX, TXT, PNG, JPG or WebP file.');
  const digest=await crypto.subtle.digest('SHA-256',bytes),actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==sha256)return error(400,'The upload was incomplete. Please try again.');
  const key='feedback-files/'+id+'/'+crypto.randomUUID();let committed=false;
  try{const object=await bucket.put(key,bytes,{sha256:digest,httpMetadata:{contentType:mime}});if(!object||object.size!==size){await bucket.delete(key);return error(400,'The upload was incomplete. Please try again.');}
   const saved=await db.prepare('INSERT INTO classroom_feedback_files (id,submission_id,filename,mime,size,sha256,object_key,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM classroom_feedback_files WHERE submission_id=? AND deleted=0)<? RETURNING id').bind(id,submissionId,filename,mime,size,sha256,key,new Date().toISOString(),submissionId,FILE_MAX_COUNT).first();
   if(!saved){await bucket.delete(key);return error(409,'The attachment limit has been reached.');}committed=true;return Response.json({saved:true,id},{headers:{'Cache-Control':'no-store'}});
  }catch{if(!committed)await bucket.delete(key).catch(()=>{});return error(503,'The file could not be saved. Please retry.');}
 }
 if(!['GET','HEAD'].includes(request.method))return error(405,'Use GET, HEAD, PUT or DELETE');
 if(!existing)return error(404,'File not found');
 try{const object=await bucket.get(existing.object_key);if(!object)return error(404,'File not found');return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':existing.mime,'Content-Length':String(existing.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(existing.filename),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'X-File-SHA256':existing.sha256}});}catch{return error(503,'The file is temporarily unavailable.');}
}
