import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {readings,listenings,writingTasks,guides,speaking} from '../dist/data.js';
import {checkGrammar,words} from '../dist/grammar.js';

assert.equal(readings.flatMap(r=>r.questions).length,40);
assert.equal(listenings.flatMap(r=>r.questions).length,40);
const readWords=readings.reduce((n,r)=>n+words(r.paragraphs.join(' ')),0);
assert.ok(readWords>=2150&&readWords<=2750,'Reading passages match the official total length range.');
for(const q of [...readings,...listenings].flatMap(r=>r.questions)){
 assert.ok(q.answer&&q.evidence);
 if(q.options)assert.ok(q.options.includes(q.answer));
 if(q.limit)assert.ok(String(q.answer).split(/\s+/).length<=q.limit);
}
const grammar=checkGrammar('People is using cars. They has many problem. The goverment should improves transport.');
assert.equal(grammar.corrected,'People are using cars. They have many problems. The government should improve transport.');
assert.equal(checkGrammar('The government should reduce pollution. Students are learning.').issues.length,0);
assert.equal(checkGrammar('He should goes home.').corrected,'He should go home.');
assert.equal(checkGrammar('An university is a useful place.').corrected,'A university is a useful place.');
assert.equal(checkGrammar('').wordCount,0);

// Execute application state transitions without a browser or preview server.
const nodes=new Map(),listeners={},storage=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(type,fn){listeners[key+':'+type]=fn;},showModal(){},close(){},click(){},value:''});return nodes.get(key);}
const context={initClassroom(){},classroomPage:()=>"Classroom ".repeat(30),teacherPage:()=>"Teacher ".repeat(30),queueSubmission(){},cloudHistoryLabel:()=>"",progressCloudHTML:()=>"",studentName:()=>"",readings,listenings,writingTasks,guides,speaking,checkGrammar,words,console,crypto:webcrypto,Date,Blob,URL,setTimeout:()=>1,clearTimeout(){},setInterval(){},confirm:()=>true,location:{hash:'#home',reload(){}},navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{hidden:false,querySelector:s=>s==='#teacherAudio'?null:node(s),querySelectorAll:()=>[],createElement:()=>node('download')},window:{addEventListener(type,fn){listeners['window:'+type]=fn;},scrollTo(){},print(){}}};
let currentHash='#home';Object.defineProperty(context.location,'hash',{get:()=>currentHash,set:value=>{currentHash=value.startsWith('#')?value:'#'+value;}});
vm.createContext(context);
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
vm.runInContext(source+'\nglobalThis.test={state,render,grade,isCorrect,beginMock,mockNext,finishMock,processExpiry,submitWriting,submitSet,report,setTask:i=>taskIndex=i};',context);
const t=context.test;
for(const path of ['home','writing','reading','listening','speaking','mock','guides','progress']){context.location.hash='#'+path;t.render();assert.ok(node('#app').innerHTML.length>200,path+' renders');assert.ok(!node('#app').innerHTML.includes('undefined'),path+' contains no undefined values');}
const correctRead=Object.fromEntries(readings.flatMap(r=>r.questions).map((q,i)=>[i,q.answer]));
const correctListen=Object.fromEntries(listenings.flatMap(r=>r.questions).map((q,i)=>[i,q.answer]));
assert.equal(t.grade('reading',correctRead).score,40);
assert.equal(t.grade('listening',correctListen).score,40);
assert.equal(t.grade('reading',{}).score,0);
assert.ok(t.isCorrect(listenings[0].questions[1],'14th'));
assert.ok(!t.isCorrect(readings[0].questions[5],'the correct answer is sedum'),'Word limits are enforced.');
t.state.reading.answers=correctRead;context.location.hash='#reading';t.submitSet('reading');assert.equal(t.state.reading.result.score,40);assert.equal(t.state.history[0].total,40);
t.setTask(1);t.state.drafts.pollution='People is using cars. The goverment should improves transport.';context.location.hash='#writing';t.submitWriting();assert.ok(t.state.writeResults.pollution.result.corrected.includes('government should improve'));assert.ok(t.report(t.state.history[0]).includes('ORIGINAL RESPONSE'));
t.state.drafts.education='An important idea.';t.state.timers['write-education']={end:Date.now()-1000};t.processExpiry();assert.ok(t.state.writeResults.education,'Timer expiry submits a draft.');
context.location.hash='#mock';t.beginMock();assert.equal(t.state.mock.stage,0);assert.ok(t.state.timers['mock-0']);
t.state.mock.listening=correctListen;t.mockNext();assert.equal(t.state.mock.stage,1);assert.ok(!node('#app').innerHTML.includes('Answer:'));
t.state.mock.reading=correctRead;t.mockNext();assert.equal(t.state.mock.stage,2);
t.state.mock.writing.transport=writingTasks[0].model;t.state.mock.writing.pollution=writingTasks[1].model;t.mockNext();assert.equal(t.state.mock.stage,3);t.mockNext();assert.ok(t.state.mock.done);assert.equal(t.state.mock.results.reading.score,40);assert.equal(t.state.mock.results.listening.score,40);assert.ok(node('#app').innerHTML.includes('Suggested corrected draft'));
assert.ok(storage.get('richmount-ielts-v1').includes('results'),'Completed mock persists.');
t.beginMock();t.state.timers['mock-0'].end=Date.now()-1000;t.processExpiry();assert.equal(t.state.mock.stage,1,'Expired section advances once.');t.finishMock(true);assert.ok(t.state.mock.endedEarly);assert.equal(t.state.mock.results.reading.score,0);
t.state.name='<img src=x onerror=alert(1)>';context.location.hash='#home';t.render();assert.ok(!node('#app').innerHTML.includes('<img src=x'),'Learner-controlled text is escaped.');
console.log('Passed: content completeness, grammar rules, all route renderers, 40/40 marking, answer limits, saved submissions, timer expiry, full mock sequence, early finish, report generation and text escaping.');
console.log(`Reading: ${readWords} words · 40 questions. Listening: 40 questions.`);
