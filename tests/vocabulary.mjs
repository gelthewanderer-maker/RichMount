import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {vocabularyTopics,vocabularyWords} from '../dist/vocabulary-data.js';
import {createVocabularyProgress,filterVocabulary,buildVocabularyQuiz} from '../dist/vocabulary.js';

assert.equal(vocabularyTopics.length,10);
assert.equal(vocabularyWords.length,120);
assert.equal(new Set(vocabularyWords.map(word=>word.id)).size,120);
for(const topic of vocabularyTopics)assert.equal(vocabularyWords.filter(word=>word.topic===topic.id).length,12);
for(const word of vocabularyWords){
 assert.ok(word.meaning.length>20&&word.example.length>25&&word.collocations.length===2);
 assert.ok(word.example.toLowerCase().includes(word.word),'Every example uses the exact headword.');
 const [question]=buildVocabularyQuiz([word]);assert.ok(question.sentence.includes('_____'));
 assert.equal(question.options.length,4);assert.equal(new Set(question.options.map(option=>option.id)).size,4);
 assert.equal(question.options.filter(option=>option.id===question.answer).length,1);
}
const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
const a=createVocabularyProgress(storage,'a'),first=vocabularyWords[0];
a.toggleSaved(first.id);a.setLearned(first.id,true);a.recordQuiz('all',8,10);a.recordQuiz('all',2,10);
const restored=createVocabularyProgress(storage,'a');assert.ok(restored.saved.has(first.id)&&restored.learned.has(first.id));assert.equal(restored.best.all.score,8);
assert.equal(createVocabularyProgress(storage,'b').saved.size,0,'Individual learners have separate saved words.');
assert.equal(filterVocabulary({savedOnly:true},restored).length,1);
assert.equal(filterVocabulary({topic:'education',review:'learning'},restored).length,11);
assert.equal(filterVocabulary({search:'curriculum'},restored)[0].id,first.id);
memory.set('richmount-vocabulary-v1:bad','{"saved":["unknown","education-curriculum","education-curriculum"],"learned":null,"best":{"all":{"score":90,"total":10}}}');
assert.equal(createVocabularyProgress(storage,'bad').saved.size,1);assert.equal(createVocabularyProgress(storage,'bad').best.all,undefined);
memory.set('richmount-vocabulary-v1:broken','{bad json');assert.equal(createVocabularyProgress(storage,'broken').saved.size,0);
const limited=createVocabularyProgress({getItem:()=>null,setItem(){throw new Error('Unavailable');}},'limited');limited.toggleSaved(first.id);assert.equal(limited.canSave,false);
let seed=42;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
const educationQuiz=buildVocabularyQuiz(vocabularyWords.filter(word=>word.topic==='education'),10,random);assert.equal(educationQuiz.length,10);assert.equal(new Set(educationQuiz.map(question=>question.id)).size,10);
assert.ok(educationQuiz.every(question=>question.word.topic==='education'));

// Exercise the actual delegated controls, including quiz scoring, refreshes,
// topic filtering and switching learners. This requires no production records.
const nodes=new Map(),listeners={};
function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',addEventListener(type,fn){listeners[id+':'+type]=fn;}});return nodes.get(id);}
let learner='ui-a';
const context={vocabularyWords,vocabularyTopics,localStorage:storage,console,Date,Math,document:{querySelector:id=>id==='#vocabularySection'?node('#app').innerHTML.includes('id="vocabularySection"')?node(id):null:node(id)}};
vm.createContext(context);
const source=readFileSync(new URL('../dist/vocabulary.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
vm.runInContext(source+'\nglobalThis.ui={initVocabulary,vocabularyPage,state:()=>({tab,topic,search,flashIndex,flipped,quiz,progress,owner})};',context);
const ui=context.ui,render=()=>node('#app').innerHTML=ui.vocabularyPage();
ui.initVocabulary({storage,scope:()=>learner,render});render();
const click=(action,other={})=>listeners['#app:click']({target:{closest:()=>({disabled:false,dataset:{vocabAction:action,...other}})}});
const change=(id,value)=>listeners['#app:change']({target:{id,value}});
const input=value=>listeners['#app:input']({target:{id:'vocabSearch',value}});
assert.ok(node('#app').innerHTML.includes('Word bank')&&node('#app').innerHTML.includes('Practice quiz'));
input('sustainable');assert.ok(node('#vocabBankGrid').innerHTML.includes('sustainable'));assert.ok(!node('#vocabBankGrid').innerHTML.includes('curriculum'));assert.equal(node('#vocabCount').textContent,'1 word');
click('reset');change('vocabTopic','environment');click('tab',{tab:'flash'});
const emissions=vocabularyWords.find(word=>word.id==='environment-emissions');
assert.ok(node('#app').innerHTML.includes('emissions'));assert.ok(!node('#app').innerHTML.includes(emissions.meaning),'Flashcard answer is hidden until revealed.');
click('flip');assert.ok(node('#app').innerHTML.includes(emissions.meaning));
click('save',{word:emissions.id});click('flash-learned',{word:emissions.id});assert.ok(ui.state().progress.saved.has(emissions.id));assert.ok(ui.state().progress.learned.has(emissions.id));assert.equal(ui.state().flashIndex,1);
change('vocabDeck','saved');assert.ok(node('#app').innerHTML.includes('Card 1 of 1'));
click('tab',{tab:'saved'});assert.ok(node('#app').innerHTML.includes('emissions'));
learner='ui-b';render();assert.equal(ui.state().progress.saved.size,0);assert.ok(node('#app').innerHTML.includes('Make your own word list.'));
learner='ui-a';render();assert.equal(ui.state().progress.saved.size,1);
click('tab',{tab:'quiz'});click('start-quiz');
assert.equal(ui.state().quiz.questions.length,10);assert.ok(!node('#app').innerHTML.includes('vocab-answer-feedback'));
for(let i=0;i<10;i++){
 const question=ui.state().quiz.questions[i];
 click('choose',{choice:question.answer});click('check-answer');click('check-answer');
 assert.equal(ui.state().quiz.answers.length,i+1,'Repeated checking cannot score an answer twice.');
 const wrong=question.options.find(option=>option.id!==question.answer).id;click('choose',{choice:wrong});assert.equal(ui.state().quiz.answers[i].choice,question.answer,'Checked answers cannot be changed.');
 click('quiz-next');
}
assert.ok(ui.state().quiz.complete);assert.equal(ui.state().progress.best.environment.score,10);assert.ok(node('#app').innerHTML.includes('You know these words.'));
click('start-quiz');
for(let i=0;i<10;i++){const question=ui.state().quiz.questions[i];click('choose',{choice:question.options.find(option=>option.id!==question.answer).id});click('check-answer');click('quiz-next');}
assert.ok(node('#app').innerHTML.includes('Words to revisit'));assert.equal(ui.state().progress.best.environment.score,10,'A weaker attempt does not overwrite the best.');
click('tab',{tab:'bank'});input('<img src=x onerror=alert(1)>');render();assert.ok(!node('#app').innerHTML.includes('<img src=x'),'Search text is escaped.');
change('vocabTopic','not-a-topic');assert.equal(ui.state().topic,'environment');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert.ok(html.includes('data-nav="vocabulary"')&&html.includes('vocabulary.css'));
console.log('Passed: 120 original words, 10 topics, contextual examples, search, saved words, flashcard reveal and review, scored quizzes, retries, storage recovery, and separate learner progress.');
