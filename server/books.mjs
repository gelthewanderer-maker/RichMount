import catalog from '../materials/book-activities.json' with {type:'json'};
import {randomUUID} from 'node:crypto';
import {courseMarks,publicCourseValue,courseClientId} from './course.mjs';
import {UUID} from './validation.mjs';
export class BookError extends Error{constructor(status,message){super(message);this.status=status;}}
const books=new Map(catalog.books.map(book=>[book.id,book]));
export const bookDefinition=id=>books.get(id);
export async function bookForReader(id,store,teacher=false){
 const original=books.get(id);if(!original)throw new BookError(404,'Interactive activities for this book are not available yet.');
 const book=structuredClone(original),settings=await store('books:keys',{bookId:id}),stored=new Map((settings.settings||[]).map(row=>[row.key,row]));
 for(const a of book.activities){const row=stored.get('book-key:'+id+':'+a.id);let keys={};try{keys=JSON.parse(row?.value||'{}');}catch{}
  for(const g of a.gradingGroups||[])if(g.ids.some(id=>Object.hasOwn(keys,id)))g.answers=g.ids.map(id=>keys[id]||a.questions.find(q=>q.id===id)?.answer||[]);
  for(const q of a.questions){if(Object.hasOwn(keys,q.id)){if(keys[q.id].length){q.answer=keys[q.id];q.evidence='Answer key confirmed by your teacher.';}else delete q.answer;}q.autoMarked=!!q.answer;}
 }
 return teacher?book:publicCourseValue(book);
}
export function validateBookKey(activity,keys){
 if(!keys||typeof keys!=='object'||Array.isArray(keys))throw new BookError(400,'Provide this activity’s answer key.');
 const clean={};for(const [id,values] of Object.entries(keys)){if(!activity.questions.some(q=>q.id===id)||!Array.isArray(values)||values.length>12||values.some(v=>typeof v!=='string'||v.length>120))throw new BookError(400,'Choose valid answers from this activity.');clean[id]=values.map(v=>v.trim()).filter(Boolean);}
 if(JSON.stringify(clean).length>12000)throw new BookError(400,'This answer key is too long.');return clean;
}
export function bookSubmission(book,activity,packet,student,{preview=false}={}){
 if(!packet||!UUID.test(packet.id||'')||!packet.answers||typeof packet.answers!=='object'||Array.isArray(packet.answers))throw new BookError(400,'This activity is missing its saved answers.');
 const answers={};for(const q of activity.questions){const raw=packet.answers[q.id]??'';if(typeof raw!=='string'||raw.length>(q.response==='long'?3000:120))throw new BookError(400,'An answer is too long.');answers[q.id]=raw;}
 if(!Object.values(answers).some(s=>s.trim()))throw new BookError(400,'Answer at least one item before submitting.');
 const scored=activity.questions.filter(q=>q.answer),marks=courseMarks(scored,answers,activity.gradingGroups||[]),byId=new Map(marks.details.map(q=>[q.id,q]));
 const details=activity.questions.map(q=>byId.get(q.id)||{...publicCourseValue(q),given:answers[q.id].trim(),correct:null});
 const payload={id:packet.id,kind:book.skill,context:'practice',source:'student-book',bookId:book.id,bookActivityId:activity.id,bookTitle:book.title,day:book.day,section:'book-activity',title:`${book.skill==='reading'?'Reading':'Listening'}${book.day?' Day '+book.day:''} · ${activity.title}`.slice(0,200),name:student.name,submittedAt:new Date().toISOString(),score:marks.total?marks.score:null,total:marks.total||null,questionCount:details.length,answeredCount:details.filter(q=>q.given).length,pendingCount:details.filter(q=>q.correct===null).length,details};
 const row={id:randomUUID(),studentId:student.id,clientId:courseClientId(student.id,'book:'+book.id+':'+activity.id+':'+packet.id),kind:book.skill,title:payload.title,payload:JSON.stringify(payload),score:payload.score,total:payload.total,words:null,createdAt:payload.submittedAt};
 if(row.payload.length>145000)throw new BookError(400,'This activity response is too long.');
 return {row,payload};
}
