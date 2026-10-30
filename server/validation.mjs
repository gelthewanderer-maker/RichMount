import {readings,listenings,writingTasks} from '../dist/data.js';
import {checkGrammar} from '../dist/grammar.js';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalize=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[’]/g,"'").replace(/[.,!?;:]$/,'').replace(/\s+/g,' ');
const synonyms={'14':['fourteen','14th','fourteenth'],'9:30':['9.30','nine thirty','9:30 am','09:30'],'85':['eighty-five','eighty five'],'12':['twelve'],'2018':['two thousand eighteen','two thousand and eighteen'],'9':['nine'],'6':['six'],'Sundays':['sunday'],'60':['sixty'],'2000':['2,000','two thousand'],'3':['three']};
export function grade(kind,answers){
  const sets=kind==='reading'?readings:listenings;let i=0;
  const details=sets.flatMap(s=>s.questions.map(q=>{const given=String(answers[i++]??'').slice(0,200),accepted=[...(Array.isArray(q.answer)?q.answer:[q.answer]),...(synonyms[String(q.answer)]||[])].map(normalize);const correct=!!given.trim()&&(!q.limit||given.trim().split(/\s+/).length<=q.limit)&&accepted.includes(normalize(given));return {...q,given,correct};}));
  return {score:details.filter(d=>d.correct).length,total:details.length,details};
}
export function validateSubmission(entry){
  if(!entry||!UUID.test(entry.id||'')||!['writing','reading','listening','speaking'].includes(entry.kind))throw new Error('Choose a completed activity to send.');
  const base={id:entry.id,kind:entry.kind,context:entry.context==='mock'?'mock':'practice',mockId:typeof entry.mockId==='string'?entry.mockId.slice(0,80):null};
  if(entry.kind==='writing'){
    const task=writingTasks.find(t=>t.id===entry.taskId||t.title===entry.title);
    if(!task)throw new Error('This writing task is not supported.');
    if(typeof entry.text!=='string'||entry.text.length>30000)throw new Error('The response is too long.');
    return {...base,title:task.title,taskId:task.id,writingTaskType:task.min===250?'task2':/General/i.test(task.type)?'general-task1':'academic-task1',min:task.min,text:entry.text,prompt:task.prompt,result:checkGrammar(entry.text)};
  }
  if(entry.kind==='reading'||entry.kind==='listening'){
    let answers=entry.answers;
    if(!answers&&Array.isArray(entry.details))answers=Object.fromEntries(entry.details.slice(0,40).map((d,i)=>[i,d.given||'']));
    if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('The activity answers are missing.');
    const clean={};for(let i=0;i<40;i++){if(typeof answers[i]!=='string'&&answers[i]!=null)throw new Error('An answer is invalid.');clean[i]=String(answers[i]||'').slice(0,200);}
    return {...base,title:entry.kind==='reading'?'Academic Reading · three passages':'Listening · four parts',...grade(entry.kind,clean)};
  }
  if(typeof entry.notes!=='string'||entry.notes.length>15000)throw new Error('Speaking notes are too long.');
  return {...base,title:'Speaking · three-part practice',notes:entry.notes,checklist:Array.isArray(entry.checklist)?entry.checklist.slice(0,5).map(Boolean):[]};
}
