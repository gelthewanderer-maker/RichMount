import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateSubmission,UUID} from './validation.mjs';
import {verifyPassword,hashPassword,codeHash,makeCode,encryptCode,decryptCode,makeSession,validSession} from './security.mjs';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
const publicStudent=s=>({id:s.id,name:s.name});
const cookieValue=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('richmount_teacher='))?.slice(18)||'';

export function createClassroomServer(config){
  if(!config.sessionSecret||config.sessionSecret.length<40||!/^[0-9a-f]{64}$/.test(config.encryptionKey||''))throw new Error('Classroom security configuration is missing');
  const allowed=new Set([config.appOrigin,...(config.allowedOrigins||[])]),limits=new Map();
  const store=config.store|| (async(op,params={})=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(config.storeUrl+'/api/classroom',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+config.siteToken,'Authorization':'Bearer '+config.storeKey},body:JSON.stringify({op,params}),signal:controller.signal,redirect:'error'});
      if(!response.ok)throw new Error('Classroom storage unavailable');return await response.json();
    }finally{clearTimeout(timer);}
  });
  const passwordHash=async()=> (await store('settings:get',{key:'teacher_password_hash'})).setting?.value||config.passwordHash;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const sessionCookie=token=>'richmount_teacher='+token+'; Path=/; HttpOnly; SameSite=Strict; '+(config.secureCookies===false?'':'Secure; ')+'Max-Age='+(token?'28800':'0');
  async function body(req){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Send JSON activity data.');
    if(Number(req.headers['content-length'])>180000)fail(413,'This submission is too large.');
    let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>180000)fail(413,'This submission is too large.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'The submitted information is invalid.');}
  }
  function rate(req,key,max=60){
    const ip=req.socket.remoteAddress||'unknown',now=Date.now(),k=ip+':'+key;
    if(limits.size>2000)for(const [old,v] of limits)if(v.until<now)limits.delete(old);
    let v=limits.get(k);if(!v||v.until<now)v={n:0,until:now+60000};v.n++;limits.set(k,v);if(v.n>max)fail(429,'Please wait a minute before trying again.');
  }
  async function teacher(req){if(!validSession(cookieValue(req),await passwordHash(),config.sessionSecret))fail(401,'Sign in to your teacher dashboard.');}
  async function student(req){
    const code=String(req.headers.authorization||'').replace(/^Bearer /,'').trim();if(!/^RM-[A-F0-9]{24}$/i.test(code))fail(401,'Enter the class code given to you by your teacher.');
    const result=await store('students:by-code',{codeHash:codeHash(code,config.encryptionKey)});if(!result.student)fail(401,'This class code is not active. Ask your teacher to check it.');return result.student;
  }
  return http.createServer(async(req,res)=>{
    const origin=req.headers.origin,method=req.method||'GET',url=new URL(req.url||'/',config.appOrigin),pathname=url.pathname;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    try{
      if(origin&&allowed.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
      if(method==='OPTIONS'){if(!origin||!allowed.has(origin))fail(403,'This request is not allowed.');res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Max-Age':'600'});res.end();return;}
      if(origin&&!allowed.has(origin))fail(403,'This request is not allowed.');
      if(pathname.startsWith('/api/teacher/')&&['POST','PATCH'].includes(method)&&origin!==config.appOrigin)fail(403,'Open the teacher dashboard to make this change.');
      if(pathname==='/health'){const result=await store('health');json(res,result.ready?200:503,{ready:result.ready});return;}
      if(pathname==='/api/teacher/login'&&method==='POST'){
        rate(req,'teacher-login',5);const data=await body(req),hash=await passwordHash();if(!await verifyPassword(data.password,hash))fail(401,'The teacher password is incorrect.');
        res.setHeader('Set-Cookie',sessionCookie(makeSession(hash,config.sessionSecret)));json(res,200,{teacher:'Teacher Angelo'});return;
      }
      if(pathname==='/api/teacher/logout'&&method==='POST'){res.setHeader('Set-Cookie',sessionCookie(''));json(res,200,{signedOut:true});return;}
      if(pathname.startsWith('/api/teacher/')){
        await teacher(req);
        if(pathname==='/api/teacher/session'&&method==='GET'){json(res,200,{teacher:'Teacher Angelo'});return;}
        if(pathname==='/api/teacher/summary'&&method==='GET'){json(res,200,await store('summary'));return;}
        if(pathname==='/api/teacher/password'&&method==='POST'){
          rate(req,'password-change',5);const data=await body(req);if(!await verifyPassword(data.currentPassword,await passwordHash()))fail(401,'Your current password is incorrect.');
          if(typeof data.newPassword!=='string'||data.newPassword.length<12||data.newPassword.length>200)fail(400,'Use a new password of 12–200 characters.');
          const hash=await hashPassword(data.newPassword);await store('settings:set',{key:'teacher_password_hash',value:hash});res.setHeader('Set-Cookie',sessionCookie(makeSession(hash,config.sessionSecret)));json(res,200,{saved:true});return;
        }
        if(pathname==='/api/teacher/students'&&method==='GET'){
          const result=await store('students:list');json(res,200,{students:result.students.map(s=>({...publicStudent(s),code:decryptCode(s.encrypted_code,config.encryptionKey),createdAt:s.created_at}))});return;
        }
        if(pathname==='/api/teacher/students'&&method==='POST'){
          const data=await body(req);if(!Array.isArray(data.names)||!data.names.length||data.names.length>20)fail(400,'Add between 1 and 20 students at a time.');
          const names=data.names.map(v=>String(v).trim());if(names.some(n=>!n||n.length>60))fail(400,'Each student name must contain 1–60 characters.');
          const existing=await store('students:list');if(existing.students.length+names.length>100)fail(400,'The classroom can hold up to 100 active students.');
          const students=names.map(name=>{const code=makeCode();return {id:randomUUID(),name,codeHash:codeHash(code,config.encryptionKey),encryptedCode:encryptCode(code,config.encryptionKey),createdAt:new Date().toISOString()};});await store('students:add-many',{students});json(res,201,{added:names.length});return;
        }
        const studentMatch=pathname.match(/^\/api\/teacher\/students\/([^/]+)$/);
        if(studentMatch&&method==='PATCH'){
          if(!UUID.test(studentMatch[1]))fail(404,'Student not found.');const data=await body(req);
          const current=await store('students:by-id',{id:studentMatch[1]});if(!current.student)fail(404,'Student not found.');
          if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>60)fail(400,'Enter a student name of 1–60 characters.');
          await store('students:rename',{id:studentMatch[1],name:data.name.trim()});json(res,200,{saved:true});return;
        }
        if(pathname==='/api/teacher/submissions'&&method==='GET'){
          const reviewed=url.searchParams.get('reviewed'),kind=url.searchParams.get('kind')||undefined,studentId=url.searchParams.get('student')||undefined;
          if(kind&&!['writing','reading','listening','speaking'].includes(kind)||studentId&&!UUID.test(studentId))fail(400,'Choose a valid filter.');
          json(res,200,await store('submissions:list',{kind,studentId,reviewed:reviewed==='0'?0:reviewed==='1'?1:undefined,offset:Number(url.searchParams.get('offset'))||0,limit:50}));return;
        }
        const detailMatch=pathname.match(/^\/api\/teacher\/submissions\/([^/]+)$/);
        if(detailMatch){
          if(!UUID.test(detailMatch[1]))fail(404,'Submission not found.');const detail=await store('submissions:detail',{id:detailMatch[1]});if(!detail.submission)fail(404,'Submission not found.');
          if(method==='GET'){json(res,200,{submission:{...detail.submission,payload:JSON.parse(detail.submission.payload)}});return;}
          if(method==='PATCH'){
            const data=await body(req);if(typeof data.feedback!=='string'||data.feedback.length>10000)fail(400,'Feedback must be under 10,000 characters.');
            const score=data.teacherScore==null?null:String(data.teacherScore).trim();if(score&&score.length>30)fail(400,'The teacher mark is too long.');
            await store('submissions:review',{id:detailMatch[1],feedback:data.feedback,teacherScore:score||null,reviewed:!!data.reviewed,reviewedAt:new Date().toISOString()});json(res,200,{saved:true});return;
          }
        }
        fail(404,'This teacher page was not found.');
      }
      if(pathname.startsWith('/api/student/')){
        rate(req,'student-api',120);const learner=await student(req);
        if(pathname==='/api/student/me'&&method==='GET'){json(res,200,{student:publicStudent(learner)});return;}
        if(pathname==='/api/student/submissions'&&method==='GET'){json(res,200,await store('submissions:list',{studentId:learner.id,limit:100}));return;}
        if(pathname==='/api/student/submissions'&&method==='POST'){
          rate(req,'student-submit',30);const data=await body(req);let entry;try{entry=validateSubmission(data.entry);}catch(e){fail(400,e.message);}
          entry.name=learner.name;entry.submittedAt=new Date().toISOString();
          const result=await store('submissions:save',{id:randomUUID(),studentId:learner.id,clientId:entry.id,kind:entry.kind,title:entry.title,payload:JSON.stringify(entry),score:entry.score,total:entry.total,words:entry.result?.wordCount,createdAt:entry.submittedAt});json(res,201,result);return;
        }
        const match=pathname.match(/^\/api\/student\/submissions\/([^/]+)$/);
        if(match&&method==='GET'){
          if(!UUID.test(match[1]))fail(404,'Submission not found.');const detail=await store('submissions:detail',{id:match[1],studentId:learner.id});if(!detail.submission)fail(404,'Submission not found.');json(res,200,{submission:{...detail.submission,payload:JSON.parse(detail.submission.payload)}});return;
        }
        fail(404,'This class page was not found.');
      }
      if(pathname.startsWith('/api/'))fail(404,'This request was not found.');
      if(!['GET','HEAD'].includes(method))fail(405,'Use GET to open the studio.');
      const relative=decodeURIComponent(pathname==='/'?'/index.html':pathname),file=path.resolve(root,'.'+relative);
      if(!file.startsWith(root)||relative.includes('\0'))fail(404,'Page not found.');
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
      let bytes;try{bytes=await readFile(file);}catch{fail(404,'Page not found.');}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; connect-src 'self' https://*.onrender.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; script-src 'self'; frame-ancestors 'none'"});res.end(method==='HEAD'?undefined:bytes);
    }catch(error){
      const status=error instanceof HttpError?error.status:503;
      json(res,status,{error:error instanceof HttpError?error.message:'The classroom is temporarily unavailable. Your work stays saved on this device; try sending it again shortly.'});
    }
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const appOrigin=process.env.RENDER_EXTERNAL_URL||process.env.CLASSROOM_APP_URL;
  if(!appOrigin||!process.env.CLASSROOM_STORE_URL||!process.env.CLASSROOM_STORE_TOKEN||!process.env.STORE_API_KEY||!process.env.TEACHER_PASSWORD_HASH)throw new Error('Required classroom configuration is missing');
  const server=createClassroomServer({appOrigin,allowedOrigins:['https://richmount-ielts.onrender.com'],storeUrl:process.env.CLASSROOM_STORE_URL,siteToken:process.env.CLASSROOM_STORE_TOKEN,storeKey:process.env.STORE_API_KEY,passwordHash:process.env.TEACHER_PASSWORD_HASH,sessionSecret:process.env.TEACHER_SESSION_SECRET,encryptionKey:process.env.CLASSROOM_ENCRYPTION_KEY});
  server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Richmount classroom is ready.'));
}
