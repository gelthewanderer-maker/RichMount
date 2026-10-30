import catalog from './materials-catalog.json' with {type:'json'};

import overrides from './slide-overrides.json' with {type:'json'};
const originalIds=new Set(catalog.lessons.flatMap(l=>l.files).map(f=>f.id));
const previewIds=new Set(overrides.map(f=>f.id));
const files=new Map(catalog.lessons.flatMap(lesson=>lesson.files).concat(overrides).map(file=>[file.id,file]));
const error=(status,message,headers={})=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store',...headers}});

async function authorized(request,key){
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(!key||!supplied)return false;
  const enc=new TextEncoder(),[a,b]=await Promise.all([key,supplied].map(value=>crypto.subtle.digest('SHA-256',enc.encode(value))));
  const left=new Uint8Array(a),right=new Uint8Array(b);let difference=0;
  for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
  return difference===0;
}

export function byteRange(header,size){
  if(!header)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if(!match||(!match[1]&&!match[2]))throw new Error('Invalid range');
  let start,end;
  if(!match[1]){
    const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new Error('Invalid range');
    start=Math.max(0,size-suffix);end=size-1;
  }else{
    start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)throw new Error('Invalid range');
  }
  return {offset:start,length:end-start+1};
}

// Only the Render classroom bridge can read or write these whitelisted files.
// R2 verifies the original checksum while streaming uploads, without buffering audio.
export async function handleMaterial(request,env,id){
  if(!await authorized(request,env.STORE_API_KEY))return error(401,'Not authorized');
  return materialContent(request,env,id);
}

// Import only the supplied Reading resources. The separate import key cannot
// read classroom records or replace the existing Listening files.
export async function handleMaterialImport(request,env,id){
  if(!await authorized(request,env.MATERIALS_IMPORT_KEY))return error(401,'Not authorized');
  if(!id.startsWith('reading-')||!originalIds.has(id))return error(404,'File not found');
  if(!['PUT','HEAD'].includes(request.method))return error(405,'Use HEAD or PUT',{Allow:'HEAD, PUT'});
  return materialContent(request,env,id);
}

async function materialContent(request,env,id){
  const file=files.get(id);if(!file)return error(404,'File not found');
  if(!env.BUCKET)return error(503,'Lesson files are being prepared');
  if(!['GET','HEAD','PUT'].includes(request.method))return error(405,'Use GET, HEAD or PUT',{Allow:'GET, HEAD, PUT'});
  if(request.method==='PUT'){
    if(request.headers.get('content-length')!==String(file.size))return error(400,'The file size does not match');
    try{
      const sha256=Uint8Array.from(file.sha256.match(/../g),pair=>parseInt(pair,16)).buffer;
      const object=await env.BUCKET.put(file.key,request.body,{sha256,httpMetadata:{contentType:file.mime},customMetadata:{sha256:file.sha256}});
      if(!object||object.size!==file.size)return error(400,'The file did not match the original');
      return Response.json({saved:true,id:file.id,size:file.size,sha256:file.sha256},{headers:{'Cache-Control':'no-store'}});
    }catch{return error(400,'The file did not match the original');}
  }
  try{
    const object=await env.BUCKET.head(file.key);
    if(!object||object.size!==file.size||object.customMetadata?.sha256!==file.sha256)return error(404,'This file is not available yet');
    const headers=new Headers({'Content-Type':file.mime,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','ETag':object.httpEtag,'Content-Length':String(file.size),'X-Material-SHA256':file.sha256,'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(file.filename)});
    if(request.method==='HEAD')return new Response(null,{headers});
    let range;
    try{range=byteRange(request.headers.get('if-range')&&request.headers.get('if-range')!==object.httpEtag?null:request.headers.get('range'),file.size);}
    catch{return error(416,'Choose a valid byte range',{'Content-Range':'bytes */'+file.size,'Accept-Ranges':'bytes'});}
    const content=await env.BUCKET.get(file.key,range?{range}:{});
    if(!content)return error(404,'File not found');
    if(range){headers.set('Content-Length',String(range.length));headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${file.size}`);}
    return new Response(content.body,{status:range?206:200,headers});
  }catch{return error(503,'The lesson file is temporarily unavailable');}
}

export async function handleSlideImport(request,env,id){
 if(!await authorized(request,env.SLIDES_IMPORT_KEY))return error(401,'Not authorized');
 if(!previewIds.has(id))return error(404,'File not found');
 if(!['PUT','HEAD'].includes(request.method))return error(405,'Use HEAD or PUT',{Allow:'HEAD, PUT'});
 return materialContent(request,env,id);
}
