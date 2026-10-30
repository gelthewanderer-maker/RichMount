import {vocabularyTopics,vocabularyWords} from './vocabulary-data.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId=new Map(vocabularyWords.map(word=>[word.id,word]));
const topicLabel=id=>vocabularyTopics.find(topic=>topic.id===id)?.label||'All topics';
const pageSize=24;
let config={},owner=null,progress=null,tab='bank',topic='all',search='',review='all',page=0,flashIndex=0,flipped=false,flashSaved=false,quiz=null;

export function createVocabularyProgress(storage,scope='guest'){
 const key='richmount-vocabulary-v1:'+scope;
 let source={};try{source=JSON.parse(storage.getItem(key)||'{}')||{};}catch{}
 const validIds=value=>new Set(Array.isArray(value)?value.filter(id=>byId.has(id)):[]);
 const saved=validIds(source.saved),learned=validIds(source.learned),best={};
 for(const id of ['all',...vocabularyTopics.map(t=>t.id)]){const value=source.best?.[id];if(value&&Number.isInteger(value.score)&&Number.isInteger(value.total)&&value.total>0&&value.total<=10&&value.score>=0&&value.score<=value.total)best[id]={score:value.score,total:value.total};}
 let canSave=true;
 function persist(){try{storage.setItem(key,JSON.stringify({saved:[...saved],learned:[...learned],best}));canSave=true;}catch{canSave=false;}return canSave;}
 return {
  saved,learned,best,
  get canSave(){return canSave;},
  toggleSaved(id){if(!byId.has(id))return;saved.has(id)?saved.delete(id):saved.add(id);persist();},
  setLearned(id,value){if(!byId.has(id))return;value?learned.add(id):learned.delete(id);persist();},
  recordQuiz(id,score,total){if(!['all',...vocabularyTopics.map(t=>t.id)].includes(id)||!Number.isInteger(score)||!Number.isInteger(total)||total<1||total>10||score<0||score>total)return;if(!best[id]||score/total>best[id].score/best[id].total)best[id]={score,total};persist();}
 };
}

export function filterVocabulary({topic='all',search='',review='all',savedOnly=false},progress){
 const term=String(search).trim().toLocaleLowerCase();
 return vocabularyWords.filter(word=>(topic==='all'||word.topic===topic)&&(!savedOnly||progress.saved.has(word.id))&&(review!=='learning'||!progress.learned.has(word.id))&&(review!=='learned'||progress.learned.has(word.id))&&(!term||[word.word,word.meaning,word.example,...word.collocations,topicLabel(word.topic)].join(' ').toLocaleLowerCase().includes(term)));
}
const shuffled=(values,random)=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function buildVocabularyQuiz(pool,limit=10,random=Math.random){
 return shuffled(pool,random).slice(0,Math.max(0,Math.min(10,limit))).map(word=>{
  const others=vocabularyWords.filter(item=>item.id!==word.id),samePart=others.filter(item=>item.pos===word.pos);
  const distractors=shuffled(samePart.length>=3?samePart:others,random).slice(0,3);
  return {id:word.id,word,answer:word.id,sentence:word.example.replace(new RegExp('\\b'+escapePattern(word.word)+'\\b','i'),'_____'),options:shuffled([word,...distractors],random).map(item=>({id:item.id,label:item.word}))};
 });
}

function ensureScope(){
 const scope=String(config.scope?.()||'guest');
 if(scope!==owner){owner=scope;progress=createVocabularyProgress(config.storage||localStorage,scope);flashIndex=0;flipped=false;quiz=null;page=0;}
}
const act=(label,action,attributes='',style='secondary')=>`<button type="button" class="button ${style}" data-vocab-action="${action}" ${attributes}>${label}</button>`;
function saveButton(word){return `<button type="button" class="vocab-save ${progress.saved.has(word.id)?'is-saved':''}" data-vocab-action="save" data-word="${word.id}" aria-label="${progress.saved.has(word.id)?'Unsave':'Save'} ${esc(word.word)}" aria-pressed="${progress.saved.has(word.id)}">${progress.saved.has(word.id)?'★':'☆'}</button>`;}
function details(word){return `<p class="vocab-meaning">${esc(word.meaning)}</p><div class="vocab-collocations"><span class="vocab-small-label">USE IT TOGETHER</span>${word.collocations.map(phrase=>`<span class="vocab-phrase">${esc(phrase)}</span>`).join('')}</div><blockquote class="vocab-example">${esc(word.example)}</blockquote>`;}
function wordCard(word){return `<article class="vocab-word-card"><div class="vocab-word-top"><span class="vocab-topic-label">${esc(topicLabel(word.topic))}</span>${saveButton(word)}</div><h3>${esc(word.word)}</h3><span class="vocab-part">${esc(word.pos)}</span>${details(word)}<button type="button" class="vocab-learned ${progress.learned.has(word.id)?'is-learned':''}" data-vocab-action="learned" data-word="${word.id}" aria-pressed="${progress.learned.has(word.id)}">${progress.learned.has(word.id)?'✓ Marked as learned':'○ Mark as learned'}</button></article>`;}
function matchingWords(){return filterVocabulary({topic,search,review,savedOnly:tab==='saved'},progress);}
function bankCount(){const total=matchingWords().length;return total+' '+(tab==='saved'?'saved ':'')+(total===1?'word':'words');}
function bankGrid(){
 const words=matchingWords(),pages=Math.max(1,Math.ceil(words.length/pageSize));page=Math.min(page,pages-1);
 if(!words.length)return `<div class="empty"><span class="vocab-empty-icon" aria-hidden="true">${tab==='saved'?'☆':'Aa'}</span><h3>${tab==='saved'&&!progress.saved.size?'Make your own word list.':'No words found.'}</h3><p>${tab==='saved'&&!progress.saved.size?'Tap the star beside a word to save it here for revision.':'Try a different search, topic or study filter.'}</p>${act(tab==='saved'&&!progress.saved.size?'Explore the word bank →':'Reset filters','reset','', 'soft')}</div>`;
 return `<div class="vocab-grid">${words.slice(page*pageSize,(page+1)*pageSize).map(wordCard).join('')}</div>${pages>1?`<div class="vocab-pagination">${act('← Previous','page',`data-page="${page-1}" ${page===0?'disabled':''}`)}<span>Page ${page+1} of ${pages}</span>${act('Next →','page',`data-page="${page+1}" ${page===pages-1?'disabled':''}`)}</div>`:''}`;
}
function bankHTML(){return `<div class="vocab-bank-tools"><div><label for="vocabSearch">Find a word</label><input id="vocabSearch" type="search" placeholder="Search words, meanings or examples…" value="${esc(search)}" autocomplete="off"></div><div><label for="vocabReview">Study filter</label><select id="vocabReview"><option value="all" ${review==='all'?'selected':''}>All words</option><option value="learning" ${review==='learning'?'selected':''}>Still learning</option><option value="learned" ${review==='learned'?'selected':''}>Marked as learned</option></select></div></div><p id="vocabCount" class="vocab-count" role="status">${bankCount()}</p><div id="vocabBankGrid">${bankGrid()}</div>`;}
function flashDeck(){return filterVocabulary({topic,savedOnly:flashSaved},progress);}
function flashHTML(){
 const deck=flashDeck();flashIndex=deck.length?flashIndex%deck.length:0;
 const selector=`<div class="vocab-deck-selector"><label for="vocabDeck">Flashcard deck</label><select id="vocabDeck"><option value="all" ${!flashSaved?'selected':''}>All words in this topic</option><option value="saved" ${flashSaved?'selected':''}>My saved words</option></select></div>`;
 if(!deck.length)return selector+`<div class="empty"><h3>No saved words in this topic yet.</h3><p>Save a few words in the Word bank, or choose the full deck.</p>${act('Use all words','full-deck','','soft')}</div>`;
 const word=deck[flashIndex];
 return selector+`<div class="vocab-flash-wrap"><div class="vocab-flash-top"><span>Card ${flashIndex+1} of ${deck.length}</span><span>${esc(topicLabel(word.topic))}</span></div><article class="vocab-flash ${flipped?'is-flipped':''}"><div class="vocab-flash-save">${saveButton(word)}</div><span class="vocab-small-label">${flipped?'MEANING & USE':'WHAT DOES THIS WORD MEAN?'}</span><h2>${esc(word.word)}</h2><span class="vocab-part">${esc(word.pos)}</span>${flipped?details(word):'<p class="vocab-flash-prompt">Say the meaning out loud, then try a sentence of your own.</p>'}${act(flipped?'Show word only ↺':'Reveal meaning ↻','flip','','soft')}</article><div class="vocab-flash-controls">${act('← Previous','flash-prev')}<span>${progress.learned.has(word.id)?'✓ Marked as learned':'Learning this word'}</span>${act('Next →','flash-next')}</div>${flipped?`<div class="vocab-flash-rating"><p>How well did you remember it?</p><div class="button-row">${act('Keep practising','flash-review',`data-word="${word.id}"`)}${act('Got it ✓','flash-learned',`data-word="${word.id}"`,'')}</div></div>`:''}</div>`;
}
function quizHTML(){
 const pool=filterVocabulary({topic},progress);
 if(!quiz)return `<section class="vocab-quiz-intro card"><span class="vocab-quiz-symbol" aria-hidden="true">Aa?</span><div class="eyebrow">USE WORDS IN CONTEXT</div><h2>A little practice. A stronger memory.</h2><p>Choose the word that matches the meaning and completes the example. Get an explanation after each answer.</p><div class="tagline"><span class="pill">${Math.min(10,pool.length)} questions</span><span class="pill">${esc(topicLabel(topic))}</span><span class="pill">No timer</span></div>${act('Start practice quiz →','start-quiz','','')}<p class="vocab-quiz-note">This is vocabulary practice. Your result is a practice score.</p></section>`;
 if(quiz.complete){
  const score=quiz.answers.filter(item=>item.correct).length,total=quiz.questions.length,missed=quiz.answers.filter(item=>!item.correct).map(item=>byId.get(item.id));
  return `<section class="vocab-quiz-result card"><div class="eyebrow">PRACTICE COMPLETE</div><h2>${score===total?'You know these words.':'Every attempt is a step forward.'}</h2><div class="vocab-result-score">${score}<span> / ${total}</span></div><p>${score===total?'Try another topic, then use your new words in a paragraph.':`Review ${missed.length===1?'the word':`these ${missed.length} words`} below and try again when you’re ready.`}</p><div class="button-row">${act('Try another quiz →','start-quiz','','')}${act('Study flashcards','tab','data-tab="flash"','secondary')}</div><p class="vocab-quiz-note">Practice score · ${esc(topicLabel(quiz.topic))} · Saved on this device</p></section>${missed.length?`<div class="section-head"><h2>Words to revisit</h2></div><div class="vocab-grid">${missed.map(wordCard).join('')}</div>`:''}`;
 }
 const question=quiz.questions[quiz.index],checked=quiz.answers[quiz.index],correct=checked?.correct;
 return `<section class="vocab-quiz-question card"><div class="vocab-quiz-top"><span class="eyebrow">QUESTION ${quiz.index+1} OF ${quiz.questions.length}</span><span>${esc(topicLabel(question.word.topic))}</span></div><progress value="${quiz.index}" max="${quiz.questions.length}" aria-label="Questions completed"></progress><p class="vocab-quiz-meaning">${esc(question.word.meaning)}</p><p class="vocab-gap">${esc(question.sentence)}</p><div class="vocab-quiz-options" role="group" aria-label="Choose the missing word">${question.options.map((option,index)=>`<button type="button" class="vocab-quiz-option ${quiz.choice===option.id?'is-selected':''} ${checked&&option.id===question.answer?'is-correct':''} ${checked&&quiz.choice===option.id&&!correct?'is-wrong':''}" data-vocab-action="choose" data-choice="${option.id}" aria-pressed="${quiz.choice===option.id}" ${checked?'disabled':''}><span>${String.fromCharCode(65+index)}</span>${esc(option.label)}</button>`).join('')}</div>${checked?`<div class="vocab-answer-feedback ${correct?'is-correct':''}" role="status"><h3>${correct?'✓ Correct':'Let’s review this word.'}</h3><p><strong>${esc(question.word.word)}</strong> — ${esc(question.word.meaning)}</p><p>${esc(question.word.example)}</p></div>${act(quiz.index===quiz.questions.length-1?'See my result →':'Next question →','quiz-next','','')}`:act('Check answer','check-answer',!quiz.choice?'disabled':'','')}<p class="vocab-quiz-note">Choose the word that fits both the meaning and the sentence.</p></section>`;
}
export function vocabularyPage(){
 ensureScope();const best=progress.best[topic],body=tab==='flash'?flashHTML():tab==='quiz'?quizHTML():bankHTML();
 return `<section id="vocabularySection"><div class="page-head vocab-heading"><div><div class="eyebrow">LEARN · REMEMBER · USE</div><h1>Find the words for your ideas.</h1><p>Build a useful IELTS vocabulary. Learn the meaning, notice the word partners, and practise using each word in context.</p></div><div class="vocab-heading-art" aria-hidden="true">Aa<span>one word at a time</span></div></div><div class="vocab-study-summary"><div><strong>${vocabularyWords.length}</strong><span>Words to explore</span></div><div><strong>${progress.learned.size}</strong><span>Marked as learned</span></div><div><strong>${progress.saved.size}</strong><span>Saved for revision</span></div><div><strong>${best?best.score+' / '+best.total:'—'}</strong><span>Best quiz · ${esc(topicLabel(topic))}</span></div></div><div class="vocab-toolbar"><div class="tabs vocab-tabs" role="group" aria-label="Vocabulary activities">${[['bank','Word bank'],['flash','Flashcards'],['quiz','Practice quiz'],['saved','Saved words']].map(([id,label])=>`<button type="button" class="tab ${tab===id?'active':''}" data-vocab-action="tab" data-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</div><div class="vocab-topic-picker"><label for="vocabTopic">Topic</label><select id="vocabTopic" ${tab==='quiz'&&quiz&&!quiz.complete?'disabled':''}><option value="all">All topics</option>${vocabularyTopics.map(item=>`<option value="${item.id}" ${topic===item.id?'selected':''}>${esc(item.label)}</option>`).join('')}</select></div></div><p class="vocab-storage-note">${progress.canSave?'Your saved words, learned words and quiz bests stay on this device.':'Your browser could not save your study progress. Keep this page open to continue this session.'}</p><div id="vocabContent">${body}</div><aside class="vocab-study-tip"><strong>Teacher Angelo’s study tip</strong><p>Learn a word with its word partners. Write one sentence about your own life, then use it in your next IELTS response.</p><a href="#writing">Try it in the Writing studio →</a></aside></section>`;
}
function rerender(){if(document.querySelector('#vocabularySection'))config.render?.();}
function updateBank(){const grid=document.querySelector('#vocabBankGrid'),count=document.querySelector('#vocabCount');if(grid)grid.innerHTML=bankGrid();if(count)count.textContent=bankCount();}
export function initVocabulary(options={}){
 config=options;const root=document.querySelector('#app');
 root.addEventListener('input',event=>{if(event.target.id!=='vocabSearch')return;ensureScope();search=event.target.value;page=0;updateBank();});
 root.addEventListener('change',event=>{
  const {id,value}=event.target;if(!['vocabTopic','vocabReview','vocabDeck'].includes(id))return;ensureScope();
  if(id==='vocabTopic'){if(!['all',...vocabularyTopics.map(item=>item.id)].includes(value)||quiz&&!quiz.complete&&tab==='quiz')return;topic=value;page=0;flashIndex=0;flipped=false;quiz=null;}
  if(id==='vocabReview'){review=['all','learning','learned'].includes(value)?value:'all';page=0;}
  if(id==='vocabDeck'){flashSaved=value==='saved';flashIndex=0;flipped=false;}
  rerender();
 });
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-vocab-action]');if(!button||button.disabled)return;ensureScope();const data=button.dataset,word=byId.get(data.word);
  switch(data.vocabAction){
   case 'tab':if(['bank','flash','quiz','saved'].includes(data.tab)){tab=data.tab;page=0;}break;
   case 'reset':topic='all';search='';review='all';page=0;if(tab==='saved'&&!progress.saved.size)tab='bank';break;
   case 'save':if(word)progress.toggleSaved(word.id);break;
   case 'learned':if(word)progress.setLearned(word.id,!progress.learned.has(word.id));break;
   case 'page':page=Math.max(0,Number(data.page)||0);break;
   case 'flip':flipped=!flipped;break;
   case 'flash-next':flashIndex=(flashIndex+1)%Math.max(1,flashDeck().length);flipped=false;break;
   case 'flash-prev':flashIndex=(flashIndex+Math.max(1,flashDeck().length)-1)%Math.max(1,flashDeck().length);flipped=false;break;
   case 'full-deck':flashSaved=false;flashIndex=0;flipped=false;break;
   case 'flash-review':case 'flash-learned':if(word)progress.setLearned(word.id,data.vocabAction==='flash-learned');flashIndex=(flashIndex+1)%Math.max(1,flashDeck().length);flipped=false;break;
   case 'start-quiz':{const questions=buildVocabularyQuiz(filterVocabulary({topic},progress));if(questions.length)quiz={topic,questions,index:0,answers:[],choice:'',complete:false};break;}
   case 'choose':if(quiz&&!quiz.complete&&!quiz.answers[quiz.index]&&quiz.questions[quiz.index].options.some(option=>option.id===data.choice))quiz.choice=data.choice;break;
   case 'check-answer':if(quiz&&!quiz.complete&&quiz.choice&&!quiz.answers[quiz.index]){const question=quiz.questions[quiz.index];quiz.answers.push({id:question.id,choice:quiz.choice,correct:quiz.choice===question.answer});}break;
   case 'quiz-next':if(quiz&&!quiz.complete&&quiz.answers[quiz.index]){if(quiz.index===quiz.questions.length-1){quiz.complete=true;progress.recordQuiz(quiz.topic,quiz.answers.filter(answer=>answer.correct).length,quiz.questions.length);}else{quiz.index++;quiz.choice='';}}break;
   default:return;
  }
  rerender();
 });
}
