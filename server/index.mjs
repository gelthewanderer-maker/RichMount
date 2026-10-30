import {answerKey,validateAnswers,publicAnswers} from './answer-drafts.mjs';
import {AttachmentError,readAttachment,attachmentStorage,streamAttachment} from './attachments.mjs';
import {createAutomaticFeedback,feedbackJobAuthorized} from './automatic-feedback.mjs';
import {DraftError,draftKey,validateDraft,publicDraft} from './drafts.mjs';
import {BookError,bookDefinition,bookForReader,bookSubmission,validateBookKey} from './books.mjs';
import {AttendanceError,validateAttendance,attendanceDate,attendanceClock,attendanceMonth,attendanceSummary} from '../storage/attendance-store.js';
import {appHTMLForRole} from './mobile.mjs';
import {weeklySettings,validateWeeklySettings,weeklyWindowFromKey,activityWindow,rowsForWindow,weeklyChecklist,weeklyStudentData,weeklyTeacherData} from './weekly.mjs';
import http from 'node:http';
import {createWritingCoach,WritingError,studentVisible} from './writing.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CourseError,courseActivity,courseSettings,courseMetadata,courseOverride,validateCourseSetting,publicCourseValue,buildCourseSubmissions,courseReview} from './course.mjs';
import {guidedLessonIndex,guidedLesson} from './lessons.mjs';
import {AudioError,publicAudio,makeAudioTicket,readAudioTicket,audioTeacherValid,audioStudentAllowed,readAudioUpload,audioStorage,streamAudio} from './audio.mjs';
import {MaterialError,slideOverrides,findMaterial,studentMaterialView,materialCatalog,makeMaterialTicket,readMaterialTicket,teacherTicketValid,streamMaterial} from './materials.mjs';
import {validateSubmission,UUID} from './validation.mjs';
import {verifyPassword,hashPassword,hashStudentPassword,studentVersion,validStudentCode,makeStudentSession,readStudentSession,digest,codeHash,makeCode,encryptCode,decryptCode,makeSession,validSession} from './security.mjs';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
function attendanceStart(value,now){
 const date=value.date??attendanceDate(now),time=value.startTime||attendanceClock(now),start=Date.parse(date+'T'+time+':00+08:00');
 if(!Number.isFinite(start)||attendanceDate(start)!==date||attendanceClock(start)!==time||start>now)fail(400,'Choose a valid starting date and time that is not in the future.');
 return {date,startTime:time,startedAt:new Date(start).toISOString()};
}
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
  const coach=createWritingCoach({store,config});
  const automaticFeedback=createAutomaticFeedback({store,coach,config});
  const clock=()=>config.now?.()??Date.now();
  const passwordHash=async()=> (await store('settings:get',{key:'teacher_password_hash'})).setting?.value||config.passwordHash;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  function fileAccess(id,role,subject='',hash=''){
    const file=role==='student'?studentMaterialView(id):findMaterial(id);
    if(!file)fail(404,'Lesson file not found.');
    id=file.id;
    const access=makeMaterialTicket({id,role,subject,passwordHash:hash,secret:config.sessionSecret});
    return {url:config.appOrigin+'/api/materials/file/'+id+'?ticket='+encodeURIComponent(access.ticket),expiresAt:access.expiresAt,id,title:file.title,filename:file.filename,kind:file.kind,size:file.size,...(role==='teacher'&&file.kind==='slides'?{slideOverrides:slideOverrides(id).map(f=>({page:f.page,...fileAccess(f.id,role,subject,hash)}))}:{})};
  }
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
  async function studentCredentials(learner){return (await store('students:credentials',{id:learner.id})).credentials;}
  function studentLogin(learner,credentials){return {student:{...publicStudent(learner),passwordChangeRequired:!credentials?.password_hash},token:makeStudentSession(learner.id,studentVersion(learner,credentials),config.sessionSecret,!credentials?.password_hash,clock())};}
  async function studentPasswordValid(value,learner,credentials){return credentials?.password_hash?verifyPassword(value,credentials.password_hash):validStudentCode(value,learner,config.encryptionKey);}
  async function student(req){
    const session=readStudentSession(String(req.headers.authorization||'').replace(/^Bearer /,''),config.sessionSecret,clock());if(!session)fail(401,'Sign in with your student code and password.');
    const learner=(await store('students:by-id',{id:session.sub})).student;if(!learner||learner.active!==1)fail(401,'This student account is not active. Ask your teacher to check it.');
    const credentials=await studentCredentials(learner);if(session.version!==studentVersion(learner,credentials))fail(401,'Your password was changed or reset. Sign in again.');
    return {...learner,credentials};
  }
  return http.createServer(async(req,res)=>{
    const origin=req.headers.origin,method=req.method||'GET',url=new URL(req.url||'/',config.appOrigin),pathname=url.pathname;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    try{
      if(origin&&allowed.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
      if(method==='OPTIONS'){if(!origin||!allowed.has(origin))fail(403,'This request is not allowed.');res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, Authorization, Range, If-Range','Access-Control-Allow-Methods':'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS','Access-Control-Max-Age':'600'});res.end();return;}
      if(origin&&!allowed.has(origin))fail(403,'This request is not allowed.');
      if(pathname.startsWith('/api/teacher/')&&['POST','PATCH','PUT','DELETE'].includes(method)&&origin!==config.appOrigin)fail(403,'Open the teacher dashboard to make this change.');
      if(pathname==='/api/internal/feedback/status'&&method==='GET'){if(!feedbackJobAuthorized(String(req.headers.authorization||'').replace(/^Bearer /,''),config.feedbackJobKey))fail(401,'Not authorized');json(res,200,await automaticFeedback.status());return;}
      if(pathname==='/api/internal/feedback/run'&&method==='POST'){if(!feedbackJobAuthorized(String(req.headers.authorization||'').replace(/^Bearer /,''),config.feedbackJobKey))fail(401,'Not authorized');json(res,200,await automaticFeedback.run());return;}
      if(pathname==='/health'){const result=await store('health');json(res,result.ready?200:503,{ready:result.ready});return;}
      if(pathname==='/api/student/login'&&method==='POST'){
        rate(req,'student-login',15);const data=await body(req),code=typeof data.studentCode==='string'?data.studentCode.trim().toUpperCase():'';
        if(!/^RM-[A-F0-9]{24}$/.test(code)||typeof data.password!=='string'||data.password.length>200)fail(401,'The student code or password is incorrect.');
        rate(req,'student-login:'+codeHash(code,config.encryptionKey),10);
        const learner=(await store('students:by-code',{codeHash:codeHash(code,config.encryptionKey)})).student;
        if(!learner)fail(401,'The student code or password is incorrect.');const credentials=await studentCredentials(learner);
        if(!await studentPasswordValid(data.password,learner,credentials))fail(401,'The student code or password is incorrect.');
        json(res,200,studentLogin(learner,credentials));return;
      }
      const audioFile=pathname.match(/^\/api\/audio\/file\/([^/]+)$/);
      if(audioFile&&['GET','HEAD'].includes(method)){
        const id=audioFile[1],ticket=readAudioTicket(url.searchParams.get('ticket'),id,config.sessionSecret);
        if(!ticket)fail(401,'This audio link has expired. Open the player again.');
        const row=(await store('audio:by-id',{id})).audio;if(!row)fail(404,'Audio not found.');
        if(ticket.role==='teacher'){const hash=await passwordHash();if(!validSession(cookieValue(req),hash,config.sessionSecret)||!audioTeacherValid(ticket,hash))fail(401,'Sign in to open this recording.');}
        else{const learner=(await store('students:by-id',{id:ticket.sub})).student;if(!learner||learner.active!==1||!audioStudentAllowed(row,learner.id)||!audioTeacherValid(ticket,studentVersion(learner,await studentCredentials(learner))))fail(401,'This recording is not available to your class code.');if(url.searchParams.has('download'))fail(403,'Student recordings are available for playback only.');}
        await streamAudio(req,res,row,config);return;
      }
      const mediaMatch=pathname.match(/^\/api\/materials\/file\/([a-z0-9-]{1,60})$/);
      if(mediaMatch&&['GET','HEAD'].includes(method)){
        rate(req,'materials-read',600);
        const id=mediaMatch[1],ticket=readMaterialTicket(url.searchParams.get('ticket'),id,config.sessionSecret),file=findMaterial(id);
        if(!ticket)fail(401,'This file link has expired. Open it again from Lesson materials.');
        if(!file||ticket.role==='student'&&file.visibility!=='student')fail(404,'Lesson file not found.');
        if(ticket.role==='teacher'){
          const hash=await passwordHash();
          if(!validSession(cookieValue(req),hash,config.sessionSecret)||!teacherTicketValid(ticket,hash))fail(401,'Sign in again to open this teacher file.');
        }else{
          const learner=(await store('students:by-id',{id:ticket.sub})).student;
          if(!learner||learner.active!==1||!teacherTicketValid(ticket,studentVersion(learner,await studentCredentials(learner))))fail(401,'This class code is not active. Ask your teacher to check it.');
          if(url.searchParams.has('download'))fail(403,'Student materials are available for viewing and playback only.');
          if(!['application/pdf','audio/mpeg','video/mp4'].includes(file.mime))fail(403,'Open the PDF view of this document from Lesson materials.');
        }
        const download=url.searchParams.get('download')==='1';
        // Both readers embed PDFs after their own authentication checks.
        // Private teacher documents stay restricted to the teacher dashboard.
        if(file.mime==='application/pdf'&&!download){
          res.removeHeader('X-Frame-Options');
          const parents=ticket.role==='teacher'?[config.appOrigin]:[...allowed];
          res.setHeader('Content-Security-Policy','frame-ancestors '+parents.join(' ')+';');
        }
        await streamMaterial(req,res,file,config,download);return;
      }
      if(pathname==='/api/teacher/login'&&method==='POST'){
        rate(req,'teacher-login',5);const data=await body(req),hash=await passwordHash();if(!await verifyPassword(data.password,hash))fail(401,'The teacher password is incorrect.');
        res.setHeader('Set-Cookie',sessionCookie(makeSession(hash,config.sessionSecret)));json(res,200,{teacher:'Teacher Angelo'});return;
      }
      if(pathname==='/api/teacher/logout'&&method==='POST'){res.setHeader('Set-Cookie',sessionCookie(''));json(res,200,{signedOut:true});return;}
      if(pathname.startsWith('/api/teacher/')){
        await teacher(req);
        if(pathname==='/api/teacher/attendance'){
          if(method==='GET'){const month=attendanceMonth(url.searchParams.get('month')||attendanceDate(clock()).slice(0,7)),records=await store('attendance:list',{month}),roster=await store('students:list');json(res,200,{month,sessions:records.sessions,summary:attendanceSummary(records.sessions),students:roster.students.map(publicStudent)});return;}
          if(method==='POST'){const raw=await body(req),previous=(await store('attendance:get',{id:raw.id})).session,action=raw.action||'save',now=clock();if(!['save','launch','end','session'].includes(action))fail(400,'Choose a valid class action.');
            if(action==='session'){
              if(raw.teachingHours===undefined)fail(400,'Enter teaching hours, or leave them blank for now.');
              const start=Date.parse(raw.date+'T'+raw.startTime+':00+08:00');
              if(!Number.isFinite(start)||attendanceDate(start)!==raw.date||attendanceClock(start)!==raw.startTime)fail(400,'Enter a valid class date and time.');
              const hours=raw.teachingHours;if(hours!==null&&(typeof hours!=='number'||!Number.isFinite(hours)||hours<=0||hours>24))fail(400,'Enter teaching hours from 0.01 to 24.');
              const finish=start+(hours===null?0:Math.round(hours*60))*60000;
              if(!Number.isFinite(finish))fail(400,'Enter valid teaching hours.');
              Object.assign(raw,{state:'completed',startedAt:null,endedAt:null,endTime:attendanceClock(finish),endDate:attendanceDate(finish),teacherPresent:raw.teacherPresent??true});
            }
            else if(action==='launch'){if(previous&&previous.state!=='live')fail(409,'This class has already ended. Open its saved record.');const start=previous?{date:previous.date,startTime:previous.startTime,startedAt:previous.startedAt}:attendanceStart(raw,now);Object.assign(raw,start,{state:'live',endedAt:null,endTime:'',endDate:null,teacherPresent:true,paid:false});}
            else if(action==='end'){if(!previous?.startedAt)fail(400,'Launch and save this class before ending it.');const start=previous.endedAt?{date:previous.date,startTime:previous.startTime,startedAt:previous.startedAt}:raw.date===previous.date&&raw.startTime===previous.startTime?{date:previous.date,startTime:previous.startTime,startedAt:previous.startedAt}:attendanceStart(raw,now);let finish=previous.endedAt;if(!finish){let time=now;if(raw.finishTime){time=Date.parse((raw.finishDate||start.date)+'T'+raw.finishTime+':00+08:00');if(!Number.isFinite(time)||time>now||attendanceDate(time)!==(raw.finishDate||start.date)||attendanceClock(time)!==raw.finishTime)fail(400,'Choose an actual finish date and time that is not in the future.');}else if(time-Date.parse(start.startedAt)>86400000)fail(400,'Choose the actual finish date and time for this earlier class.');finish=new Date(time).toISOString();}const time=Date.parse(finish);Object.assign(raw,start,{state:'completed',endedAt:finish,endTime:attendanceClock(time),endDate:attendanceDate(time),teacherPresent:true});}
            else if((raw.state==='live'&&previous?.state!=='live')||(previous?.state==='live'&&raw.state!=='live'))fail(400,'Use Launch class or End class to change a running class.');
            else if(previous?.state==='live'){const start=raw.date===previous.date&&raw.startTime===previous.startTime?{date:previous.date,startTime:previous.startTime,startedAt:previous.startedAt}:attendanceStart(raw,now);Object.assign(raw,start,{endedAt:null});}
            if(raw.markIds!==undefined){if(!Array.isArray(raw.markIds)||raw.markIds.length>100||new Set(raw.markIds).size!==raw.markIds.length||raw.markIds.some(id=>!raw.attendees?.some(a=>a.studentId===id)))fail(400,'Choose students from this class to mark attendance.');if(raw.state!=='live'&&!['session','save'].includes(action))fail(400,'Open the class record to correct an attendance time.');raw.attendees=raw.attendees.map(a=>raw.markIds.includes(a.studentId)?{...a,markedAt:a.status==='unmarked'?null:new Date(now).toISOString()}:a);}
            const value=validateAttendance(raw,now),roster=(await store('students:list')).students;
            const attendees=value.attendees.map(row=>{const active=roster.find(s=>s.id===row.studentId),saved=previous?.attendees.find(s=>s.studentId===row.studentId);if(!active&&!saved)fail(400,'This student is no longer on the active roster. Refresh your attendance list.');return {...row,name:saved?.name||active.name};});
            const result=await store('attendance:save',{session:{...value,attendees},now:clock(),updatedAt:new Date(clock()).toISOString()});if(result.conflict)fail(409,'This class record changed on another device. Open its latest saved version before correcting it.');const month=value.date.slice(0,7),records=await store('attendance:list',{month});json(res,200,{...result,month,sessions:records.sessions,summary:attendanceSummary(records.sessions),students:roster.map(publicStudent)});return;}
        }
        if(pathname==='/api/teacher/automatic-feedback'&&method==='GET'){json(res,200,await automaticFeedback.status());return;}
        if(pathname==='/api/teacher/automatic-feedback/retry'&&method==='POST'){json(res,200,await store('feedback:retry-failed',{now:new Date(clock()).toISOString()}));return;}
        if(pathname==='/api/teacher/writing-settings'){if(method==='GET'){json(res,200,await coach.settings());return;}if(method==='POST'){json(res,200,await coach.configure(await body(req)));return;}}
        const teacherWriting=pathname.match(/^\/api\/teacher\/submissions\/([^/]+)\/writing-review$/);
        if(teacherWriting&&method==='POST'){const row=(await store('submissions:detail',{id:teacherWriting[1]})).submission;if(!row||row.kind!=='writing')fail(404,'Writing submission not found.');json(res,200,{report:await coach.review({owner:row.student_id,teacher:true,selector:{submissionId:row.id},text:JSON.parse(row.payload).text})});return;}
        if(pathname==='/api/teacher/book-grades'&&method==='GET'){json(res,200,await store('books:grades'));return;}
        const teacherBook=pathname.match(/^\/api\/teacher\/books\/([a-z0-9-]{1,60})(?:\/activities\/([a-z0-9-]{1,60})\/(submissions|key))?$/);
        if(teacherBook){
          const book=await bookForReader(teacherBook[1],store,true);
          if(!teacherBook[2]&&method==='GET'){json(res,200,book);return;}
          const activity=book.activities.find(a=>a.id===teacherBook[2]);if(!activity)fail(404,'Book activity not found.');
          if(teacherBook[3]==='key'&&method==='PATCH'){const data=await body(req),keys=validateBookKey(activity,data.keys);await store('settings:set',{key:'book-key:'+book.id+':'+activity.id,value:JSON.stringify(keys)});json(res,200,{saved:true});return;}
          if(teacherBook[3]==='submissions'&&method==='POST'){const data=await body(req),result=bookSubmission(book,activity,data.packet,{id:'00000000-0000-4000-8000-000000000000',name:'Teacher preview'},{preview:true});json(res,200,{review:[{payload:result.payload}],submissions:[],preview:true});return;}
        }
        const teacherLesson=pathname.match(/^\/api\/teacher\/lessons(?:\/week-([1-8]))?$/);
        if(teacherLesson&&method==='GET'){json(res,200,teacherLesson[1]?guidedLesson(teacherLesson[1],'teacher',await courseSettings(store)):guidedLessonIndex('teacher'));return;}
        if(pathname==='/api/teacher/course'&&method==='GET'){
          const settings=await courseSettings(store),progress=await store('course:progress');json(res,200,{...courseMetadata(settings,true),...progress});return;
        }
        if(pathname==='/api/teacher/weekly'){
          if(method==='PATCH'){const value=validateWeeklySettings(await body(req));await store('settings:set',{key:'weekly_cycle',value:JSON.stringify(value)});json(res,200,{saved:true});return;}
          if(method==='GET'){json(res,200,await weeklyTeacherData(store,await courseSettings(store),await store('course:progress'),url.searchParams.get('key')||'',clock()));return;}
        }
        if(pathname==='/api/teacher/weekly/approve'&&method==='POST'){
          const data=await body(req);if(!UUID.test(data.studentId||'')||!Number.isInteger(data.points)||data.points<0||data.points>100)fail(400,'Choose a student and award 0–100 whole points.');
          const learner=(await store('students:by-id',{id:data.studentId})).student,activity=courseActivity(data.activityId),window=weeklyWindowFromKey(data.windowKey,clock());if(!learner||!activity)fail(404,'Student or weekly activity not found.');if(!window.started)fail(409,'This deliverable week has not started yet.');
          const progress=await store('course:progress',{studentId:learner.id}),tasks=weeklyChecklist(courseMetadata(await courseSettings(store)).activities,progress.submissions,[],window),task=tasks.find(task=>task.id===activity.id);if(!task?.complete)fail(409,'The student must finish this deliverable, including its speaking recording, before approval.');
          await store('weekly:award',{studentId:learner.id,windowKey:window.key,activityId:activity.id,points:data.points,approved:true,updatedAt:new Date().toISOString()});json(res,200,{saved:true});return;
        }
        const teacherCourse=pathname.match(/^\/api\/teacher\/course\/([a-z0-9-]{1,60})$/);
        if(teacherCourse){
          const activity=courseActivity(teacherCourse[1]);if(!activity)fail(404,'Course activity not found.');
          if(method==='GET'){json(res,200,{activity,setting:courseOverride((await courseSettings(store))[activity.id])});return;}
          if(method==='PATCH'){const value=validateCourseSetting(await body(req));await store('settings:set',{key:'course:'+activity.id,value:JSON.stringify(value)});json(res,200,{saved:true,setting:value});return;}
        }
        if(pathname==='/api/teacher/audio-library'){
          if(method==='GET'){json(res,200,await store('audio:library'));return;}
          if(method==='POST'){rate(req,'teacher-audio',60);const upload=await readAudioUpload(req,url);upload.meta={...upload.meta,role:'teacher',submissionId:null,studentId:null};json(res,201,await audioStorage(config,randomUUID(),'PUT',upload));return;}
        }
        const teacherAudio=pathname.match(/^\/api\/teacher\/audio\/([^/]+)(\/access)?$/);
        if(teacherAudio){
          const id=teacherAudio[1];if(!UUID.test(id))fail(404,'Audio not found.');const row=(await store('audio:by-id',{id})).audio;if(!row)fail(404,'Audio not found.');
          if(teacherAudio[2]&&method==='GET'){const ticket=makeAudioTicket({id,role:'teacher',passwordHash:await passwordHash(),secret:config.sessionSecret});json(res,200,{url:config.appOrigin+'/api/audio/file/'+id+'?ticket='+encodeURIComponent(ticket.ticket),expiresAt:ticket.expiresAt});return;}
          if(['PUT','DELETE'].includes(method)){if(row.role!=='teacher')fail(403,'Only students can delete or redo their speaking audio.');let upload;if(method==='PUT'){upload=await readAudioUpload(req,url);upload.meta={...upload.meta,role:'teacher',submissionId:row.submission_id,studentId:row.student_id,category:row.category};}json(res,200,await audioStorage(config,id,method,upload));return;}
        }
        const teacherAttachment=pathname.match(/^\/api\/teacher\/submissions\/([^/]+)\/audio$/);
        if(teacherAttachment&&method==='POST'){
          const id=teacherAttachment[1];if(!UUID.test(id))fail(404,'Activity not found.');const row=(await store('submissions:detail',{id})).submission;if(!row)fail(404,'Activity not found.');
          const upload=await readAudioUpload(req,url);upload.meta={...upload.meta,role:'teacher',submissionId:id,studentId:row.student_id};json(res,201,await audioStorage(config,randomUUID(),'PUT',upload));return;
        }
        if(pathname==='/api/teacher/materials'&&method==='GET'){json(res,200,materialCatalog('teacher'));return;}
        const materialMatch=pathname.match(/^\/api\/teacher\/materials\/([a-z0-9-]{1,60})\/access$/);
        if(materialMatch&&method==='GET'){json(res,200,fileAccess(materialMatch[1],'teacher','',await passwordHash()));return;}
        if(pathname==='/api/teacher/session'&&method==='GET'){json(res,200,{teacher:'Teacher Angelo'});return;}
        if(pathname==='/api/teacher/summary'&&method==='GET'){json(res,200,await store('summary'));return;}
        if(pathname==='/api/teacher/password'&&method==='POST'){
          rate(req,'password-change',5);const data=await body(req);if(!await verifyPassword(data.currentPassword,await passwordHash()))fail(401,'Your current password is incorrect.');
          if(typeof data.newPassword!=='string'||data.newPassword.length<12||data.newPassword.length>200)fail(400,'Use a new password of 12–200 characters.');
          const hash=await hashPassword(data.newPassword);await store('settings:set',{key:'teacher_password_hash',value:hash});res.setHeader('Set-Cookie',sessionCookie(makeSession(hash,config.sessionSecret)));json(res,200,{saved:true});return;
        }
        if(pathname==='/api/teacher/students'&&method==='GET'){
          const result=await store('students:list'),archived=url.searchParams.get('archived')==='1'?(await store('students:archived')).students:undefined;json(res,200,{...(archived?{archived:archived.map(publicStudent)}:{}),students:result.students.map(s=>({...publicStudent(s),code:decryptCode(s.encrypted_code,config.encryptionKey),createdAt:s.created_at}))});return;
        }
        if(pathname==='/api/teacher/students'&&method==='POST'){
          const data=await body(req);if(!Array.isArray(data.names)||!data.names.length||data.names.length>20)fail(400,'Add between 1 and 20 students at a time.');
          const names=data.names.map(v=>String(v).trim());if(names.some(n=>!n||n.length>60))fail(400,'Each student name must contain 1–60 characters.');
          const existing=await store('students:list');if(existing.students.length+names.length>100)fail(400,'The classroom can hold up to 100 active students.');
          const students=names.map(name=>{const code=makeCode();return {id:randomUUID(),name,codeHash:codeHash(code,config.encryptionKey),encryptedCode:encryptCode(code,config.encryptionKey),createdAt:new Date().toISOString()};});await store('students:add-many',{students});json(res,201,{added:names.length});return;
        }
        const studentMatch=pathname.match(/^\/api\/teacher\/students\/([^/]+)$/);
        const resetPassword=pathname.match(/^\/api\/teacher\/students\/([^/]+)\/reset-password$/);
        if(resetPassword&&method==='POST'){
          rate(req,'student-password-reset',30);if(!UUID.test(resetPassword[1]))fail(404,'Student not found.');
          const learner=(await store('students:by-id',{id:resetPassword[1]})).student;if(!learner)fail(404,'Student not found.');
          const result=await store('students:password-set',{id:learner.id,passwordHash:null,version:digest(randomUUID()),updatedAt:new Date(clock()).toISOString()});if(!result.saved)fail(409,'This student account changed. Refresh your roster.');
          json(res,200,{reset:true,student:publicStudent(learner),message:'Password reset. The student can sign in using their student code as the temporary password, then choose a new password.'});return;
        }
        if(studentMatch&&method==='DELETE'){if(!UUID.test(studentMatch[1]))fail(404,'Student not found.');if(!(await store('students:any-id',{id:studentMatch[1]})).student)fail(404,'Student not found.');await store('students:archive',{id:studentMatch[1]});json(res,200,{removed:true});return;}
        const restoreStudent=pathname.match(/^\/api\/teacher\/students\/([^/]+)\/restore$/);
        if(restoreStudent&&method==='POST'){if(!UUID.test(restoreStudent[1]))fail(404,'Student not found.');const current=(await store('students:any-id',{id:restoreStudent[1]})).student;if(!current)fail(404,'Student not found.');if(current.active!==1){if((await store('students:list')).students.length>=100)fail(409,'The active roster is full.');await store('students:restore',{id:current.id});}json(res,200,{restored:true});return;}
        if(studentMatch&&method==='PATCH'){
          if(!UUID.test(studentMatch[1]))fail(404,'Student not found.');const data=await body(req);
          const current=await store('students:by-id',{id:studentMatch[1]});if(!current.student)fail(404,'Student not found.');
          if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>60)fail(400,'Enter a student name of 1–60 characters.');
          await store('students:rename',{id:studentMatch[1],name:data.name.trim()});json(res,200,{saved:true});return;
        }
        if(pathname==='/api/teacher/submissions'&&method==='GET'){
          const reviewed=url.searchParams.get('reviewed'),kind=url.searchParams.get('kind')||undefined,studentId=url.searchParams.get('student')||undefined,context=url.searchParams.get('context')||undefined,week=url.searchParams.get('week')?Number(url.searchParams.get('week')):undefined;
          if(kind&&!['writing','reading','listening','speaking'].includes(kind)||studentId&&!UUID.test(studentId))fail(400,'Choose a valid filter.');
          if(context&&!['practice','mock','homework','weekly-mock'].includes(context)||week!==undefined&&(!Number.isInteger(week)||week<1||week>8))fail(400,'Choose a valid week or activity type.');
          const period=url.searchParams.get('weekly')?weeklyWindowFromKey(url.searchParams.get('weekly'),clock()):null;json(res,200,await store('submissions:list',{kind,studentId,context,week,...(period?{weeklyKey:period.key,startsAt:period.startsAt,endsAt:period.endsAt}:{}),reviewed:reviewed==='0'?0:reviewed==='1'?1:undefined,offset:Number(url.searchParams.get('offset'))||0,limit:50}));return;
        }
        const teacherFiles=pathname.match(/^\/api\/teacher\/submissions\/([^/]+)\/feedback-files$/);
        if(teacherFiles){
          const id=teacherFiles[1];if(!UUID.test(id)||(await store('submissions:detail',{id})).submission==null)fail(404,'Submission not found.');
          if(method==='GET'){json(res,200,await store('attachments:list',{id}));return;}
          if(method==='POST'){rate(req,'feedback-upload',30);const upload=await readAttachment(req,url);upload.meta.submissionId=id;json(res,201,await attachmentStorage(config,randomUUID(),'PUT',upload));return;}
        }
        const teacherFile=pathname.match(/^\/api\/teacher\/feedback-files\/([^/]+)$/);
        if(teacherFile){
          if(!UUID.test(teacherFile[1]))fail(404,'File not found.');const row=(await store('attachments:by-id',{id:teacherFile[1]})).attachment;if(!row)fail(404,'File not found.');
          if(method==='DELETE'){json(res,200,await attachmentStorage(config,row.id,'DELETE'));return;}
          if(['GET','HEAD'].includes(method)){await streamAttachment(req,res,row,config);return;}
        }
        const detailMatch=pathname.match(/^\/api\/teacher\/submissions\/([^/]+)$/);
        if(detailMatch){
          if(!UUID.test(detailMatch[1]))fail(404,'Submission not found.');const detail=await store('submissions:detail',{id:detailMatch[1]});if(!detail.submission)fail(404,'Submission not found.');
          if(method==='GET'){json(res,200,{submission:{...detail.submission,payload:JSON.parse(detail.submission.payload),...await store('attachments:list',{id:detailMatch[1]}),...await store('feedback:teacher-draft',{id:detailMatch[1],now:new Date(clock()).toISOString()}),...await store('audio:for-submission',{id:detailMatch[1]})}});return;}
          if(method==='PATCH'){
            const data=await body(req);if(typeof data.feedback!=='string'||data.feedback.length>10000)fail(400,'Feedback must be under 10,000 characters.');
            const selected=data.attachmentIds??[];if(!Array.isArray(selected)||selected.length>10||new Set(selected).size!==selected.length||selected.some(id=>!UUID.test(id)))fail(400,'Choose valid feedback files.');
            const files=(await store('attachments:list',{id:detailMatch[1]})).attachments;if(selected.some(id=>!files.some(f=>f.id===id)))fail(400,'Refresh the feedback files before publishing.');
            if(data.reviewed===true&&!data.feedback.trim()&&!selected.length)fail(400,'Write feedback or attach a file before publishing.');
            const score=data.teacherScore==null?null:String(data.teacherScore).trim();if(score&&score.length>30)fail(400,'The teacher mark is too long.');
            await store('submissions:review',{id:detailMatch[1],feedback:data.feedback,attachmentIds:selected,teacherScore:score||null,reviewed:!!data.reviewed,reviewedAt:new Date().toISOString()});json(res,200,{saved:true});return;
          }
        }
        fail(404,'This teacher page was not found.');
      }
      if(pathname.startsWith('/api/student/')){
        rate(req,'student-api',120);const learner=await student(req);
        if(pathname==='/api/student/me'&&method==='GET'){json(res,200,{student:{...publicStudent(learner),passwordChangeRequired:!learner.credentials?.password_hash}});return;}
        if(pathname==='/api/student/password'&&method==='POST'){
          rate(req,'student-password-change',10);rate(req,'student-password-change:'+learner.id,10);const data=await body(req);
          if(!await studentPasswordValid(data.currentPassword,learner,learner.credentials))fail(400,'Your current password is incorrect. Use your student code if this is your first password or your teacher reset it.');
          if(typeof data.newPassword!=='string'||data.newPassword.length<12||data.newPassword.length>200)fail(400,'Choose a password of 12–200 characters.');
          if(data.newPassword!==data.confirmPassword)fail(400,'The new passwords do not match.');
          if(data.newPassword===data.currentPassword||validStudentCode(data.newPassword,learner,config.encryptionKey))fail(400,'Choose a new password different from your student code and current password.');
          const hash=await hashStudentPassword(data.newPassword),version=digest(randomUUID()),result=await store('students:password-set',{id:learner.id,passwordHash:hash,version,expectedVersion:learner.credentials?.session_version??null,updatedAt:new Date(clock()).toISOString()});
          if(!result.saved)fail(409,'Your password changed on another device or was reset. Sign in again.');
          json(res,200,{...studentLogin(learner,{password_hash:hash,session_version:version}),saved:true});return;
        }
        if(!learner.credentials?.password_hash)fail(403,'Choose your new password in Your class before opening class resources or submitting work.');
        if(pathname==='/api/student/answer-drafts'){
          if(method==='GET'){const result=await store('answers:list',{studentId:learner.id,key:answerKey(url.searchParams.get('key'))});json(res,200,{drafts:result.drafts.map(publicAnswers)});return;}
          if(method==='POST'){const draft=validateAnswers(await body(req),new Date(clock()).toISOString()),result=await store('answers:save',{...draft,studentId:learner.id});if(!result.saved)fail(409,'A newer copy of your answers is already saved. Your current device copy is kept.');json(res,200,{saved:true,revision:result.revision,updatedAt:result.updatedAt});return;}
          fail(405,'Use GET or POST for saved answers.');
        }
        if(pathname==='/api/student/writing-drafts'){
          if(method==='GET'){const result=await store('drafts:list',{studentId:learner.id,key:draftKey(url.searchParams.get('key'))});json(res,200,{drafts:result.drafts.map(publicDraft)});return;}
          if(method==='POST'){const draft=validateDraft(await body(req),new Date(clock()).toISOString()),result=await store('drafts:save',{...draft,studentId:learner.id});if(!result.saved)fail(409,'A newer account backup is already saved. Recover saved drafts to inspect it.');json(res,200,{saved:true,revision:result.revision});return;}
          fail(405,'Use GET or POST for writing drafts.');
        }
        const studentFiles=pathname.match(/^\/api\/student\/submissions\/([^/]+)\/feedback-files$/);
        if(studentFiles&&method==='GET'){
          const id=studentFiles[1];if(!UUID.test(id)||!(await store('submissions:detail',{id,studentId:learner.id})).submission)fail(404,'Submission not found.');json(res,200,await store('attachments:list',{id,studentId:learner.id}));return;
        }
        const studentFile=pathname.match(/^\/api\/student\/feedback-files\/([^/]+)$/);
        if(studentFile&&['GET','HEAD'].includes(method)){
          if(!UUID.test(studentFile[1]))fail(404,'File not found.');const row=(await store('attachments:by-id',{id:studentFile[1]})).attachment;
          if(!row||row.student_id!==learner.id||!row.reviewed||!row.published)fail(404,'File not found.');await streamAttachment(req,res,row,config);return;
        }
        const autoFeedbackMatch=pathname.match(/^\/api\/student\/submissions\/([^/]+)\/automatic-feedback$/);
        if(autoFeedbackMatch&&method==='GET'){if(!UUID.test(autoFeedbackMatch[1]))fail(404,'Submission not found.');const result=await store('feedback:status',{id:autoFeedbackMatch[1],studentId:learner.id,now:new Date(clock()).toISOString()});if(!result.feedback)fail(404,'No automatic feedback is scheduled for this activity.');json(res,200,result);return;}
        if(pathname==='/api/student/writing-status'&&method==='GET'){const status=await coach.settings();json(res,200,{available:status.configured&&status.enabled});return;}
        if(pathname==='/api/student/writing-review'&&method==='POST'){const data=await body(req);json(res,200,{report:await coach.review({owner:learner.id,selector:data.selector,text:data.text})});return;}
        const studentBook=pathname.match(/^\/api\/student\/books\/([a-z0-9-]{1,60})(?:\/activities\/([a-z0-9-]{1,60})\/submissions)?$/);
        if(studentBook){
          const file=findMaterial(studentBook[1]);if(!file||file.visibility!=='student'||file.kind!=='document')fail(404,'Student book not found.');
          const book=await bookForReader(studentBook[1],store,true);
          if(!studentBook[2]&&method==='GET'){json(res,200,publicCourseValue(book));return;}
          const activity=book.activities.find(a=>a.id===studentBook[2]);if(!activity)fail(404,'Book activity not found.');
          if(method==='POST'){rate(req,'book-submit',40);const data=await body(req),result=bookSubmission(book,activity,data.packet,learner),saved=await store('submissions:save',{...result.row});const actual=await store('submissions:detail',{id:saved.submission.id,studentId:learner.id});json(res,201,{submission:studentVisible(saved.submission),submissions:[studentVisible(saved.submission)],review:[{id:saved.submission.id,payload:JSON.parse(actual.submission.payload)}]});return;}
        }
        const studentLesson=pathname.match(/^\/api\/student\/lessons(?:\/week-([1-8]))?$/);
        if(studentLesson&&method==='GET'){json(res,200,studentLesson[1]?guidedLesson(studentLesson[1],'student',await courseSettings(store)):guidedLessonIndex());return;}
        if(pathname==='/api/student/course'&&method==='GET'){
          const settings=await courseSettings(store),progress=await store('course:progress',{studentId:learner.id}),weekly=await weeklyStudentData(store,settings,progress,learner.id,clock());json(res,200,{...courseMetadata(settings),...progress,submissions:progress.submissions.map(studentVisible),weekly});return;
        }
        const studentCourse=pathname.match(/^\/api\/student\/course\/([a-z0-9-]{1,60})(\/submissions)?$/);
        if(studentCourse){
          const activity=courseActivity(studentCourse[1]);if(!activity)fail(404,'Course activity not found.');
          const setting=courseOverride((await courseSettings(store))[activity.id]);if(!setting.published)fail(409,'Your teacher has not shared this activity. Ask your teacher to reopen it.');
          if(!studentCourse[2]&&method==='GET'){
            const progress=await store('course:progress',{studentId:learner.id}),window=activityWindow(activity,await weeklySettings(store),url.searchParams.get('key')||'',clock());json(res,200,{activity:publicCourseValue(activity),setting,weeklyKey:window.key,completed:rowsForWindow(progress.submissions,window).filter(s=>s.activity_id===activity.id).map(studentVisible)});return;
          }
          if(studentCourse[2]&&method==='POST'){
            rate(req,'course-submit',20);const data=await body(req);if(!data.packet||typeof data.packet!=='object')fail(400,'This activity is missing its saved response.');const window=activityWindow(activity,await weeklySettings(store),data.packet.weeklyKey||'',clock());let legacy=false;if(!data.packet.weeklyKey){const previous=await store('course:progress',{studentId:learner.id});legacy=previous.submissions.some(row=>!row.weekly_key&&row.activity_id===activity.id&&(activity.type==='mock'?row.attempt_id===data.packet.id:true));}if(!legacy)data.packet.weeklyKey=window.key;const submissions=buildCourseSubmissions(activity,data.packet,learner);
            if(activity.kind==='writing'&&data.packet.coachReportId){for(const row of submissions)row.payload=JSON.stringify(await coach.attach(JSON.parse(row.payload),learner.id,data.packet.coachReportId));}
            const saved=await store('submissions:save-many',{submissions});
            const review=courseReview(saved.submissions),records=saved.submissions.map(({payload,...row})=>{const p=JSON.parse(payload);return {...studentVisible(row),context:p.context,week:p.week,activity_id:p.activityId,weekly_key:p.weeklyKey,section:p.section,attempt_id:p.courseAttemptId,ai_band:p.coach?.bandEstimate??null,writing_task_type:p.coach?.taskType||p.writingTaskType||null,writing_criteria:p.coach?.criteria||null};});
            json(res,201,{submission:records[0],submissions:records,review});return;
          }
        }
        if(pathname==='/api/student/audio-library'&&method==='GET'){json(res,200,await store('audio:library'));return;}
        const studentAudio=pathname.match(/^\/api\/student\/audio\/([^/]+)\/access$/);
        if(studentAudio&&method==='GET'){
          const id=studentAudio[1];if(!UUID.test(id))fail(404,'Audio not found.');const row=(await store('audio:by-id',{id})).audio;if(!row||!audioStudentAllowed(row,learner.id))fail(404,'Audio not found.');
          const ticket=makeAudioTicket({id,role:'student',subject:learner.id,passwordHash:studentVersion(learner,learner.credentials),secret:config.sessionSecret});json(res,200,{url:config.appOrigin+'/api/audio/file/'+id+'?ticket='+encodeURIComponent(ticket.ticket),expiresAt:ticket.expiresAt});return;
        }
        const studentAttachment=pathname.match(/^\/api\/student\/submissions\/([^/]+)\/audio(?:\/([^/]+))?$/);
        if(studentAttachment){
          const id=studentAttachment[1],audioId=studentAttachment[2];if(!UUID.test(id)||audioId&&!UUID.test(audioId))fail(404,'Activity not found.');
          const row=(await store('submissions:detail',{id,studentId:learner.id})).submission;if(!row||row.kind!=='speaking')fail(404,'Speaking activity not found.');
          if(method==='GET'&&!audioId){json(res,200,await store('audio:for-submission',{id}));return;}
          if(method==='POST'&&!audioId){rate(req,'speaking-audio',15);const state=await store('audio:for-submission',{id});if(state.attemptsUsed>=3)fail(409,'All three speaking attempts have been used.');const upload=await readAudioUpload(req,url);upload.meta={...upload.meta,role:'student',submissionId:id,studentId:learner.id};json(res,201,await audioStorage(config,randomUUID(),'PUT',upload));return;}
          if(method==='DELETE'&&audioId){const audio=(await store('audio:by-id',{id:audioId})).audio;if(!audio||audio.role!=='student'||audio.submission_id!==id||audio.student_id!==learner.id)fail(404,'Your speaking audio was not found.');json(res,200,await audioStorage(config,audioId,'DELETE'));return;}
        }
        if(pathname==='/api/student/materials'&&method==='GET'){json(res,200,materialCatalog('student'));return;}
        const materialMatch=pathname.match(/^\/api\/student\/materials\/([a-z0-9-]{1,60})\/access$/);
        if(materialMatch&&method==='GET'){json(res,200,fileAccess(materialMatch[1],'student',learner.id,studentVersion(learner,learner.credentials)));return;}
        if(pathname==='/api/student/submissions'&&method==='GET'){const list=await store('submissions:list',{studentId:learner.id,limit:100});json(res,200,{...list,submissions:list.submissions.map(studentVisible)});return;}
        if(pathname==='/api/student/submissions'&&method==='POST'){
          rate(req,'student-submit',30);const data=await body(req);let entry;try{entry=validateSubmission(data.entry);}catch(e){fail(400,e.message);}
          if(entry.kind==='writing')entry=await coach.attach(entry,learner.id,data.entry.coachReportId);
          entry.name=learner.name;entry.submittedAt=new Date().toISOString();
          const result=await store('submissions:save',{id:randomUUID(),studentId:learner.id,clientId:entry.id,kind:entry.kind,title:entry.title,payload:JSON.stringify(entry),score:entry.score,total:entry.total,words:entry.result?.wordCount,createdAt:entry.submittedAt});json(res,201,{...result,submission:studentVisible(result.submission)});return;
        }
        const match=pathname.match(/^\/api\/student\/submissions\/([^/]+)$/);
        if(match&&method==='GET'){
          if(!UUID.test(match[1]))fail(404,'Submission not found.');const detail=await store('submissions:detail',{id:match[1],studentId:learner.id});if(!detail.submission)fail(404,'Submission not found.');json(res,200,{submission:{...studentVisible(detail.submission),payload:JSON.parse(detail.submission.payload),...await store('attachments:list',{id:match[1],studentId:learner.id}),...await store('audio:for-submission',{id:match[1]})}});return;
        }
        fail(404,'This class page was not found.');
      }
      if(pathname.startsWith('/api/'))fail(404,'This request was not found.');
      if(!['GET','HEAD'].includes(method))fail(405,'Use GET to open the studio.');
      const relative=decodeURIComponent(pathname==='/'?'/index.html':pathname),file=path.resolve(root,'.'+relative);
      if(!file.startsWith(root)||relative.includes('\0'))fail(404,'Page not found.');
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
      let bytes;try{bytes=await readFile(file);}catch{fail(404,'Page not found.');}
      if(path.extname(file)==='.html')bytes=Buffer.from(appHTMLForRole(bytes.toString('utf8'),true));
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; connect-src 'self' https://*.onrender.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' blob: data:; media-src 'self' blob: https://richmount-ielts-classroom.onrender.com; frame-src 'self' https://richmount-ielts-classroom.onrender.com; script-src 'self'; worker-src 'self'; frame-ancestors 'none'"});res.end(method==='HEAD'?undefined:bytes);
    }catch(error){
      if(res.headersSent){res.destroy();return;}
      const expected=error instanceof HttpError||error instanceof AttachmentError||error instanceof MaterialError||error instanceof AudioError||error instanceof CourseError||error instanceof WritingError||error instanceof AttendanceError||error instanceof BookError||error instanceof DraftError;
      const status=expected?error.status:503;
      json(res,status,{error:expected?error.message:'The classroom is temporarily unavailable. Your work stays saved on this device; try sending it again shortly.'});
    }
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const appOrigin=process.env.RENDER_EXTERNAL_URL||process.env.CLASSROOM_APP_URL;
  if(!appOrigin||!process.env.CLASSROOM_STORE_URL||!process.env.CLASSROOM_STORE_TOKEN||!process.env.STORE_API_KEY||!process.env.TEACHER_PASSWORD_HASH)throw new Error('Required classroom configuration is missing');
  const server=createClassroomServer({appOrigin,allowedOrigins:['https://richmount-ielts.onrender.com'],storeUrl:process.env.CLASSROOM_STORE_URL,siteToken:process.env.CLASSROOM_STORE_TOKEN,storeKey:process.env.STORE_API_KEY,passwordHash:process.env.TEACHER_PASSWORD_HASH,sessionSecret:process.env.TEACHER_SESSION_SECRET,encryptionKey:process.env.CLASSROOM_ENCRYPTION_KEY,feedbackJobKey:process.env.RICHMOUNT_FEEDBACK_JOB_KEY,feedbackSchedulerEnabled:process.env.RICHMOUNT_FEEDBACK_SCHEDULER_ENABLED==='true'});
  server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Richmount classroom is ready.'));
}
