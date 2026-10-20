import {listenings,readings} from './data.js';
const el=document.getElementById('diagnostic');
const grammar=[
['She ____ to school every weekday.',['go','goes','going','gone'],1],
['They ____ at home yesterday.',['was','is','were','be'],2],
['I have lived here ____ 2021.',['since','for','during','from'],0],
['If it rains tomorrow, we ____ inside.',['stayed','stay','will stay','staying'],2],
['The letter ____ by the manager yesterday.',['signs','signed','was signed','has signing'],2],
['I am interested ____ learning languages.',['on','at','in','to'],2],
['The lecture was ____ than I expected.',['more interesting','most interesting','interestinger','interesting'],0],
['You ____ smoke in the laboratory.',['must not','do not have','might to','should to'],0],
['He asked me where I ____.',['live','living','lived','have live'],2],
['Despite ____ tired, she finished her work.',['be','being','was','been'],1],
['By the time we arrived, the film ____.',['starts','had started','start','has start'],1],
['The researcher suggested ____ the data again.',['analyse','to analysing','analysing','analysed'],2],
['Neither of the answers ____ correct.',['are','were','is','be'],2],
['Had I known about the delay, I ____ earlier.',['would leave','will leave','would have left','left'],2],
['The policy is expected ____ next year.',['to be revised','revising','revise','being revise'],0]
];
const vocab=[
['The word \"essential\" means:',['optional','necessary','expensive','unusual'],1],
['Which word is closest in meaning to \"rapid\"?',['slow','quick','careful','minor'],1],
['A \"significant increase\" is a ____ increase.',['noticeable','tiny','temporary','negative'],0],
['Which verb best completes: \"The experiment ____ useful evidence.\"',['produced','borrowed','refused','forgot'],0],
['Which phrase is most appropriate in an academic essay?',['Kids these days are nuts.','This issue warrants further investigation.','It is super bad, honestly.','Lots of stuff happens.'],1]
];
const qs=[
...listenings[0].questions.map((q,i)=>({section:'Listening',question:q.text,answer:String(q.answer),type:'text'})),
...readings[0].questions.slice(0,10).map(q=>({section:'Reading',question:q.text,options:q.options||null,answer:q.answer,type:q.options?'choice':'text'})),
...grammar.map(([question,options,index])=>({section:'Grammar',question,options,answer:options[index],type:'choice'})),
...vocab.map(([question,options,index])=>({section:'Vocabulary',question,options,answer:options[index],type:'choice'}))
];
const KEY='richmount-entrance-v1';let stored={};try{stored=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
const state={name:'',answers:{},index:0,finished:false,writing:'',...stored};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const equivalent=(a,b)=>String(a??'').trim().toLowerCase().replace(/[.,!?]/g,'')===String(b??'').trim().toLowerCase().replace(/[.,!?]/g,'');
function rating(p){return p>=90?'C1–C2 practice range':p>=75?'B2 practice range':p>=55?'B1 practice range':p>=35?'A2 practice range':'A1 practice range'}
function result(){const stats={};for(const section of ['Listening','Reading','Grammar','Vocabulary'])stats[section]={correct:0,total:0};qs.forEach((q,i)=>{stats[q.section].total++;if(equivalent(state.answers[i],q.answer))stats[q.section].correct++});return stats}
function play(){const x=window.speechSynthesis;if(!x){alert('Speech playback is not supported on this browser.');return}x.cancel();const s=listenings[0].script.map(x=>x.speaker+': '+x.text).join(' ');const u=new SpeechSynthesisUtterance(s);u.lang='en-GB';u.rate=.87;x.speak(u)}
function render(){const i=state.index,q=qs[i],n=Object.values(state.answers).filter(a=>String(a).trim()).length;
el.innerHTML='<div class="eyebrow">RICHMOUNT EDUCATION CENTER · PLACEMENT ASSESSMENT</div><h1>English Entrance Diagnostic</h1><p class="hint">40 questions · Listening, Reading, Grammar and Vocabulary · Teacher review for Writing and Speaking · Original diagnostic practice, not an official IELTS or CEFR certification.</p>'+
(!state.finished?'<div class="diag-panel"><label for="learner">Student full name</label><p><input id="learner" type="text" maxlength="80" placeholder="Student name" value="'+esc(state.name)+'"></p><div class="progress-track"><div class="progress-fill" style="width:'+n/40*100+'%"></div></div><p class="hint">'+n+' of 40 answered · Question '+(i+1)+' of 40</p></div><section class="diag-panel"><div class="question-type">'+esc(q.section)+' · Question '+(i+1)+'</div>'+
(q.section==='Listening'?'<p class="hint">Listen to the booking conversation before answering. This browser-generated speech is a temporary practice audio, not your previously uploaded recording.</p><button class="outline hide-print" id="playAudio">▶ Play / replay conversation</button>':'')+
(q.section==='Reading'?'<details style="margin:14px 0" open><summary>Read the passage</summary><div class="passage">'+esc(readings[0].paragraphs.join('\n\n'))+'</div></details>':'')+
'<h2>'+esc(q.question)+'</h2>'+(q.type==='choice'?'<div class="diag-options">'+q.options.map((option,j)=>'<label class="diag-option"><input type="radio" name="answer" value="'+esc(option)+'" '+(state.answers[i]===option?'checked':'')+'> '+String.fromCharCode(65+j)+'. '+esc(option)+'</label>').join('')+'</div>':'<input type="text" id="answer" value="'+esc(state.answers[i]||'')+'" placeholder="Type your answer" autocomplete="off">')+'</section><div class="diag-actions"><button class="outline" id="previous" '+(i===0?'disabled':'')+'>← Previous</button><button class="outline" id="clear">Clear response</button><button id="next">'+(i===39?'Submit assessment':'Next →')+'</button></div>':'<section class="diag-panel"><h2>Diagnostic results: '+esc(state.name||'Learner')+'</h2><div class="metric"><strong>'+qs.filter((q,i)=>equivalent(state.answers[i],q.answer)).length+'/40</strong> correct</div><div class="metric">'+Math.round(qs.filter((q,i)=>equivalent(state.answers[i],q.answer)).length/40*100)+'% overall</div><p><strong>Indicative placement:</strong> '+rating(qs.filter((q,i)=>equivalent(state.answers[i],q.answer)).length/40*100)+'. This is an informal screening estimate, not a validated CEFR classification or IELTS band.</p><table><thead><tr><th>Skill</th><th>Score</th><th>Suggested focus</th></tr></thead><tbody>'+Object.entries(result()).map(([k,v])=>'<tr><td>'+k+'</td><td>'+v.correct+'/'+v.total+'</td><td>'+(v.correct/v.total<.6?'Priority practice':'Continue development')+'</td></tr>').join('')+'</tbody></table></section><section class="diag-panel"><h2>Writing and Speaking: teacher assessment required</h2><p class="hint">Writing prompt: Some people believe that online learning is better than classroom learning. Discuss both views and give your opinion. Write 150–200 words.</p><textarea id="writing" rows="9" style="width:100%;padding:14px" placeholder="Enter your writing response here">'+esc(state.writing)+'</textarea><p class="hint">Speaking interview: Introduce yourself, describe a learning experience, and explain whether technology improves education. Teacher should assess fluency, vocabulary, grammar and pronunciation separately.</p><p><strong>Teacher note:</strong> Do not assign an official IELTS Writing/Speaking band automatically from this screening.</p><div class="diag-actions"><button class="outline" id="restart">Start another student</button><button class="outline" id="download">Download report</button><button id="print">Print report</button></div></section>')+
'<p class="hint"><a href="index.html#mock">← Return to the full IELTS Mock Test</a></p>';
el.querySelector('#learner')?.addEventListener('input',e=>{state.name=e.target.value;save()});
el.querySelector('#playAudio')?.addEventListener('click',play);
el.querySelectorAll('input[name=answer]').forEach(a=>a.addEventListener('change',e=>{state.answers[state.index]=e.target.value;save()}));
el.querySelector('#answer')?.addEventListener('input',e=>{state.answers[state.index]=e.target.value;save()});
el.querySelector('#previous')?.addEventListener('click',()=>{state.index--;save();render()});
el.querySelector('#clear')?.addEventListener('click',()=>{delete state.answers[state.index];save();render()});
el.querySelector('#next')?.addEventListener('click',()=>{if(state.index===39){if(!confirm('Submit answers and view results?'))return;state.finished=true}else state.index++;save();render();window.scrollTo(0,0)});
el.querySelector('#writing')?.addEventListener('input',e=>{state.writing=e.target.value;save()});
el.querySelector('#restart')?.addEventListener('click',()=>{if(!confirm('Start a new attempt? Save or print this result first.'))return;Object.assign(state,{name:'',answers:{},index:0,finished:false,writing:''});save();render()});
el.querySelector('#print')?.addEventListener('click',()=>window.print());
el.querySelector('#download')?.addEventListener('click',()=>{const stats=result(),score=Object.values(stats).reduce((n,s)=>n+s.correct,0);const report=['RICHMOUNT ENTRANCE DIAGNOSTIC','Learner: '+state.name,'Correct: '+score+'/40','Informal placement: '+rating(score/40*100),...Object.entries(stats).map(([k,v])=>k+': '+v.correct+'/'+v.total),'Writing prompt response:',state.writing||'(not submitted)','Speaking: teacher review required','Not an official IELTS or CEFR result'].join('\n');const url=URL.createObjectURL(new Blob([report],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='richmount-entrance-report.txt';a.click();URL.revokeObjectURL(url)});
}
render();
