import assert from 'node:assert/strict';
import {dailyLearning,dailyLearningHTML} from '../dist/daily-learning.js';
import {vocabularyWords} from '../dist/vocabulary-data.js';

const now=Date.parse('2026-10-12T05:30:00Z'),first=dailyLearning('student-a','Ana',now);
assert.equal(first.date,'2026-10-12');
assert.equal(first.name,'Ana');
assert.deepEqual(dailyLearning('student-a','Ana',now+8*3600000),first,'One daily selection is stable across refreshes and devices.');
assert.equal(new Set(first.words.map(word=>word.id)).size,3);
for(const word of first.words){assert.ok(vocabularyWords.includes(word));assert.ok(word.word&&word.pos&&word.meaning&&word.example&&word.collocations.length);}
const days=Array.from({length:24},(_,i)=>dailyLearning('student-a','Ana',now+i*86400000));
assert.equal(new Set(days.map(day=>day.motivation)).size,24,'A shuffled cycle gives a different expression each day before repeating.');
assert.notDeepEqual(first.words,days[1].words);
assert.notDeepEqual(first.words,dailyLearning('student-b','Bea',now).words,'Different students get personalised word rotations.');
assert.equal(dailyLearning('student-a','Ana',Date.parse('2026-10-12T15:59:59Z')).date,'2026-10-12');
assert.equal(dailyLearning('student-a','Ana',Date.parse('2026-10-12T16:00:00Z')).date,'2026-10-13','The daily cycle uses the classroom’s UTC+8 calendar.');
const wordCycle=Array.from({length:vocabularyWords.length/3},(_,i)=>dailyLearning('student-a','Ana',now+i*86400000).words).flat();
assert.equal(new Set(wordCycle.map(word=>word.id)).size,vocabularyWords.length,'The vocabulary cycle covers the bank without repeating words within the cycle.');
const html=dailyLearningHTML(dailyLearning('student-a','Ana <img src=x>',now));
assert.match(html,/Hello, Ana &lt;img src=x&gt;!/);
assert.ok(!html.includes('<img'));
assert.match(html,/Vocabulary for today/);assert.match(html,/See an example/);assert.match(html,/Useful combinations/);assert.match(html,/href="#vocabulary"/);
assert.equal(dailyLearningHTML(null),'');
console.log('Daily learning passed: personalised greetings, escaped names, stable daily selections, UTC+8 rollover, 24-expression rotation, three defined words with examples, and full vocabulary coverage.');
