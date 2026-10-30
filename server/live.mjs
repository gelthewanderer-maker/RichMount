import {DraftError} from './drafts.mjs';
import {courseActivity} from './course.mjs';
import {readings,listenings,writingTasks} from '../dist/data.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sections=['listening','reading','writing','speaking'];
const titles={home:'Overview',reading:'Reading practice',listening:'Listening practice',writing:'Writing practice',speaking:'Speaking practice',mock:'Mock tests',course:'Weekly course',homework:'Homework',lessons:'Guided lessons',materials:'Lesson materials',vocabulary:'Vocabulary',guides:'Study guides',class:'Your class',deliverables:'Weekly deliverables',progress:'My progress',official:'Official IELTS practice'};
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const words=value=>(String(value||'').trim().match(/\S+/g)||[]).length;
const text=value=>Array.isArray(value)?value.map(String).join(', '):typeof value==='string'?value:typeof value==='number'?String(value):'';
const count=value=>Number.isSafeInteger(value)&&value>=0?Math.min(value,30000):0;
function describe(data){
 const page=Object.hasOwn(titles,data.page)?data.page:'home';
 let activity={page,title:titles[page],section:'',source:'',draftKey:'',activityId:'',weeklyKey:'',attemptId:'',phase:'viewing'};
 if(data.activityId&&['course','homework'].includes(page)){
  const item=courseActivity(data.activityId);if(!item)throw new DraftError('Choose a valid course activity.');
  const weeklyKey=data.weeklyKey||'';if(weeklyKey&&!/^\d{4}-\d{2}-\d{2}_s[1-8]_w\d{1,5}$/.test(weeklyKey))throw new DraftError('The activity week is invalid.');
  const attemptId=data.attemptId||'';if(attemptId&&!UUID.test(attemptId))throw new DraftError('The attempt reference is invalid.');
  const section=item.type==='mock'?sections[data.stage]||'':item.kind;
  activity={...activity,title:item.title,activityId:item.id,weeklyKey,attemptId,section,source:'answers',draftKey:'course:'+item.id+(weeklyKey?'@'+weeklyKey:'')};
 }else if(page==='writing'){
  const item=writingTasks.find(task=>task.id===data.taskId);if(item)activity={...activity,title:item.title,section:'writing',source:'writing',draftKey:'practice:'+item.id};
 }else if(['reading','listening','speaking'].includes(page))activity={...activity,section:page,source:'answers',draftKey:'practice:'+page};
 if(activity.draftKey&&(!activity.activityId||activity.attemptId))activity.phase=['working','paused','finished'].includes(data.phase)?data.phase:'working';
 const total=['reading','listening'].includes(activity.section)?40:0;
 return {...activity,answered:Math.min(count(data.answered),total),total,words:['writing','speaking'].includes(activity.section)?count(data.words):0};
}
export function validateLiveActivity(data,updatedAt){
 if(!data||!UUID.test(data.deviceId||'')||!Number.isSafeInteger(data.revision)||data.revision<1||typeof data.visible!=='boolean'||!Object.hasOwn(titles,data.page))throw new DraftError('The activity update is invalid.');
 return {deviceId:data.deviceId,revision:data.revision,updatedAt,payload:JSON.stringify({...describe(data),visible:data.visible})};
}
export function liveOverview(rows,now=Date.now()){
 const learners=new Map();
 for(const row of rows){
  let learner=learners.get(row.student_id);if(!learner){learner={id:row.student_id,name:row.name,sessions:[]};learners.set(row.student_id,learner);}
  const value=parse(row.payload);if(value&&Number.isFinite(Date.parse(row.updated_at)))learner.sessions.push({activity:value,lastSeenAt:row.updated_at});
 }
 return [...learners.values()].map(learner=>{
  const recent=entry=>now-Date.parse(entry.lastSeenAt)<=60000;
  const current=learner.sessions.find(entry=>entry.activity.visible&&recent(entry))||learner.sessions[0];
  const connected=!!current&&recent(current),status=!current?'unknown':!connected?'offline':!current.activity.visible?'away':current.activity.phase||'viewing';
  return {id:learner.id,name:learner.name,activity:current?.activity||null,lastSeenAt:current?.lastSeenAt||null,connected,status};
 });
}
function savedDescription(row){
 const key=row.draft_key;
 if(key.startsWith('course:')){const [activityId,weeklyKey]=key.slice(7).split('@');const value=parse(row.payload);return describe({page:'course',activityId,weeklyKey,attemptId:value?.id,stage:value?.stage,phase:value?.finished?'finished':'paused'});}
 if(row.source==='writing')return {...describe({page:'writing',taskId:key.replace(/^practice:/,'')}),draftKey:key,source:'writing',title:writingTasks.find(task=>key==='practice:'+task.id)?.title||'Writing draft'};
 return {...describe({page:key.replace(/^practice:/,'')}),draftKey:key,source:'answers'};
}
const questions=(items,answers,numbered=false)=>items.map((q,index)=>({id:String(numbered?q.id:index+1),prompt:String(q.text||''),response:text(answers?.[numbered?q.id:index])}));
export function livePreview(activity,rows){
 let entry=null,value=null;
 for(const row of rows){const candidate=parse(row.payload);if(candidate===null)continue;if(activity?.attemptId&&candidate.id!==activity.attemptId)continue;entry=row;value=candidate;break;}
 if(!entry)return {savedAt:null,sections:[],message:'No answers from this attempt have reached the account backup yet. The student can keep working; this preview updates after a successful save.'};
 const context=activity?.draftKey?activity:savedDescription(entry),output=[];
 const addText=(id,title,prompt,response)=>{const content=text(response);output.push({id,title,prompt:prompt||'',type:'text',text:content,words:words(content)});};
 if(context.activityId){
  const item=courseActivity(context.activityId);
  if(item?.type==='mock'){
   const r=value.responses||{};
   output.push({id:'listening',title:'Listening answers',type:'answers',answers:questions(item.listening.questions,r.listening,true)});
   output.push({id:'reading',title:'Reading answers',type:'answers',answers:questions(item.reading.questions,r.reading,true)});
   for(const task of ['task1','task2'])addText(task,item.writing[task].title,item.writing[task].prompt,r[task]);
   addText('speaking','Speaking preparation notes','',r.speaking?.notes);
  }else if(item)addText(item.kind,item.title,item.prompt,item.kind==='writing'?value.text:value.notes);
 }else if(entry.source==='writing')addText('writing',context.title,writingTasks.find(task=>context.draftKey==='practice:'+task.id)?.prompt,value.text);
 else if(context.section==='reading')output.push({id:'reading',title:'Reading answers',type:'answers',answers:questions(readings.flatMap(p=>p.questions),value.answers)});
 else if(context.section==='listening')output.push({id:'listening',title:'Listening answers',type:'answers',answers:questions(listenings.flatMap(p=>p.questions),value.answers)});
 else if(context.section==='speaking')addText('speaking','Speaking preparation notes','',value.notes);
 return {activity:context,savedAt:entry.updated_at,sections:output,message:output.length?'Latest account backup. Unsent changes appear after the student reconnects.':'No preview is available for this saved activity yet.'};
}
