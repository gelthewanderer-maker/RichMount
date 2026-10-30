import {createHash,randomUUID} from 'node:crypto';
import catalog from '../course/catalog.json' with {type:'json'};
import {checkGrammar} from '../dist/grammar.js';
import {UUID} from './validation.mjs';

export class CourseError extends Error{constructor(status,message){super(message);this.status=status;}}
const invalid=message=>{throw new CourseError(400,message);};
const normal=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[’]/g,"'").replace(/[.,!?;:]$/,'').replace(/\s+/g,' ');
const blocked=new Set(['answer','answers','evidence','teacherNotes','teacherGuidance','rubric','transcript','gradingGroups','sourceAnswerKey']);
export function publicCourseValue(value){if(Array.isArray(value))return value.map(publicCourseValue);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!blocked.has(key)).map(([key,v])=>[key,publicCourseValue(v)]));return value;}
const activities=new Map();
for(const week of catalog.weeks){
 const mock={id:`week-${week.week}-mock`,type:'mock',kind:'mock',week:week.week,title:`Week ${week.week} · Academic practice mock`,description:week.title,minutes:174,days:week.days,listening:week.listening,reading:week.reading,writing:week.writing,speaking:week.speaking,study:week.study||[]};
 activities.set(mock.id,mock);
 for(const homework of week.homework)activities.set(homework.id,{...homework,type:'homework',week:week.week,days:week.days});
}
export const courseActivities=()=>[...activities.values()];
export const courseActivity=id=>activities.get(id);
export function courseOverride(override={}){return {published:override.published!==false,dueDate:override.dueDate||'',message:override.message||''};}
export function validateCourseSetting(value){
 if(!value||typeof value.published!=='boolean')invalid('Choose whether this activity is shared with students.');
 const dueDate=String(value.dueDate||'');
 if(dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T00:00:00Z'))||new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate))invalid('Choose a valid due date.');
 if(typeof value.message!=='string'||value.message.length>500)invalid('Keep your class instruction under 500 characters.');
 return {published:value.published,dueDate,message:value.message.trim()};
}
export async function courseSettings(store){
 const result=await store('course:settings');const settings={};
 for(const row of result.settings||[]){try{const id=row.key.slice(7);if(activities.has(id))settings[id]=courseOverride(JSON.parse(row.value));}catch{}}
 return settings;
}
export function courseMetadata(settings={},teacher=false){return {version:catalog.version,weeks:catalog.weeks.map(w=>({week:w.week,title:w.title,days:w.days,study:w.study||[]})),activities:courseActivities().filter(a=>teacher||courseOverride(settings[a.id]).published).map(a=>({id:a.id,type:a.type,kind:a.kind,week:a.week,title:a.title,description:a.description||a.prompt,minutes:a.minutes||a.targetMinutes||0,min:a.min||a.targetWords||0,days:a.days,...courseOverride(settings[a.id]),shareUrl:`https://richmount-ielts.onrender.com/#course/${a.id}`}))};}
export function courseMarks(questions,values,groups=[]){
 if(!values||typeof values!=='object'||Array.isArray(values))invalid('Your answer sheet is missing.');
 const details=questions.map((q,index)=>{
  const raw=values[q.id]??values[index+1]??'';if(typeof raw!=='string'||raw.length>120)invalid('Keep each answer under 120 characters.');
  const given=raw.trim(),accepted=(Array.isArray(q.answer)?q.answer:[q.answer]).map(normal);
  const parts=given.split(/\s+/).filter(Boolean),wordCount=q.numberAllowed?parts.filter(part=>!/[0-9]/.test(part)).length:parts.length;
  const withinLimit=q.requireBothTimes?accepted.includes(normal(given)):!q.limit||wordCount<=q.limit;
  return {...q,given,correct:!!given&&withinLimit&&accepted.includes(normal(given))};
 });
 for(const group of groups){
  const rows=group.ids.map(id=>details.find(q=>String(q.id)===String(id)));if(rows.some(q=>!q))throw new Error('Invalid listening answer group');
  const choices=group.answers.map(answer=>(Array.isArray(answer)?answer:[answer]).map(normal)),used=new Set();
  for(const row of rows){row.correct=false;const match=choices.findIndex((answer,index)=>!used.has(index)&&answer.includes(normal(row.given)));if(row.given&&match>=0){used.add(match);row.correct=true;}}
 }
 return {score:details.filter(q=>q.correct).length,total:details.length,details};
}
export function courseClientId(owner,part){const bytes=createHash('sha256').update('richmount-course:'+owner+':'+part).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function text(value,label,limit=15000){if(typeof value!=='string'||value.length>limit)invalid(`${label} must be under ${limit.toLocaleString()} characters.`);return value;}
export function buildCourseSubmissions(activity,packet,student){
 if(!packet||!UUID.test(packet.id||''))invalid('This activity is missing its saved submission reference.');
 const now=new Date().toISOString(),context=activity.type==='mock'?'weekly-mock':'homework';
 const attemptId=activity.type==='mock'?(packet.weeklyKey?courseClientId(packet.id,packet.weeklyKey):packet.id):courseClientId(student.id,activity.id+(packet.weeklyKey?':'+packet.weeklyKey:''));
 const base={context,week:activity.week,activityId:activity.id,courseAttemptId:attemptId,...(packet.weeklyKey?{weeklyKey:packet.weeklyKey}:{}),name:student.name,date:Date.now(),submittedAt:now};
 let payloads=[];
 if(activity.type==='mock'){
  const r=packet.responses;if(!r||typeof r!=='object')invalid('The mock responses are missing.');
  const listening=courseMarks(activity.listening.questions,r.listening,activity.listening.gradingGroups),reading=courseMarks(activity.reading.questions,r.reading);
  payloads.push({...base,id:courseClientId(attemptId,'listening'),kind:'listening',section:'listening',title:`Week ${activity.week} mock · Listening`,...listening});
  payloads.push({...base,id:courseClientId(attemptId,'reading'),kind:'reading',section:'reading',title:`Week ${activity.week} mock · Reading`,...reading});
  for(const [section,label] of [['task1','Task 1'],['task2','Task 2']]){const task=activity.writing[section],response=text(r[section],label);payloads.push({...base,id:courseClientId(attemptId,section),kind:'writing',section,writingTaskType:section==='task1'?'academic-task1':'task2',title:`Week ${activity.week} mock · Writing ${label}`,prompt:task.prompt,min:task.min||task.minWords|| (section==='task1'?150:250),text:response,result:checkGrammar(response),table:task.table});}
  const speaking=r.speaking||{};payloads.push({...base,id:courseClientId(attemptId,'speaking'),kind:'speaking',section:'speaking',title:`Week ${activity.week} mock · Speaking`,prompt:publicCourseValue(activity.speaking),notes:text(speaking.notes||'','Speaking notes',8000),checklist:Array.isArray(speaking.checklist)?speaking.checklist.slice(0,5).map(Boolean):[]});
 }else{
  if(activity.kind==='writing'){const response=text(packet.text,'Your homework');if(!response.trim())invalid('Write your homework response before submitting it.');payloads=[{...base,id:attemptId,kind:'writing',section:'homework',writingTaskType:'classroom',title:activity.title,prompt:activity.prompt,min:activity.min||activity.targetWords||150,text:response,result:checkGrammar(response)}];}
  else if(activity.kind==='speaking')payloads=[{...base,id:attemptId,kind:'speaking',section:'homework',title:activity.title,prompt:activity.prompt,notes:text(packet.notes||'','Your preparation notes',8000),checklist:Array.isArray(packet.checklist)?packet.checklist.slice(0,5).map(Boolean):[]}];
  else invalid('This homework is not supported.');
 }
 const rows=payloads.map(p=>({id:randomUUID(),studentId:student.id,clientId:p.id,kind:p.kind,title:p.title,payload:JSON.stringify(p),score:p.score??null,total:p.total??null,words:p.result?.wordCount??null,createdAt:now}));
 if(JSON.stringify({submissions:rows}).length>180000)invalid('This response is too long to send. Shorten your preparation notes or answers.');
 return rows;
}
export function courseReview(rows){return rows.map(row=>({id:row.id,clientId:row.client_id,payload:JSON.parse(row.payload)}));}
