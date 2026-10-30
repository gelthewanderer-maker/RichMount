import {vocabularyWords} from './vocabulary-data.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const expressions=[
 'Your ideas matter. Take one clear step today and let your confidence grow.',
 'A small improvement today can make a big difference over time. Keep going!',
 'Every sentence you practise brings you closer to expressing yourself with confidence.',
 'Mistakes are useful clues. Learn from one, try again, and celebrate your progress.',
 'You do not need perfect English to begin. Your next attempt is your next opportunity.',
 'Give yourself credit for showing up. Consistent practice builds strong skills.',
 'Your effort is building something valuable. Stay curious and keep asking questions.',
 'Read with purpose, listen closely, and trust that practice is moving you forward.',
 'Choose one skill to improve today. A focused step is a step toward your goal.',
 'You have a voice worth sharing. Make your meaning clear, one idea at a time.',
 'Progress can be quiet. The words you learn today will help you tomorrow.',
 'Keep your goal in sight and your next step small. You can do this!',
 'A thoughtful revision is a sign of growth. Be proud of learning from your own work.',
 'Try using one new word in a sentence today. Understanding grows when you use it.',
 'Your learning journey belongs to you. Move at a steady pace and keep building.',
 'Confidence comes from practice. Give yourself one more chance to improve.',
 'Clear ideas and careful practice are powerful. Bring both to your work today.',
 'Notice what you do better now. Your progress deserves to be recognised.',
 'Stay patient with yourself. Strong English grows through many small attempts.',
 'You can turn today’s challenge into tomorrow’s strength. Start with one task.',
 'Be brave enough to try and thoughtful enough to revise. Both help you grow.',
 'Your best work begins with your own ideas. Plan, practise, and let them shine.',
 'Learning is a daily habit. A few purposeful minutes today still count.',
 'Keep reaching for your goal. Every word, question, and attempt adds to your growth.'
];
function hash(text){let value=2166136261;for(const character of text)value=Math.imul(value^character.codePointAt(0),16777619);return value>>>0;}
function shuffled(values,seed){const result=[...values];let state=seed||1;for(let i=result.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;}
export function dailyLearning(owner,name,now=Date.now()){const day=Math.floor((now+8*3600000)/86400000),date=new Date(now+8*3600000).toISOString().slice(0,10),motivation=shuffled(expressions,hash(owner+'motivation'))[day%expressions.length],bank=shuffled(vocabularyWords,hash(owner+'vocabulary')),start=day*3%bank.length;return {date,name:String(name||'Learner'),motivation,words:Array.from({length:3},(_,i)=>bank[(start+i)%bank.length])};}
export function dailyLearningHTML(daily){if(!daily)return '';return `<section class="daily-learning" aria-label="Your daily motivation and vocabulary"><div class="daily-greeting"><span class="daily-date">TODAY · ${esc(daily.date)}</span><h3>Hello, ${esc(daily.name)}!</h3><p>${esc(daily.motivation)}</p></div><div class="daily-vocabulary"><h4>Vocabulary for today</h4><p class="small muted">Learn these three words. Try one in your own sentence.</p><ul>${daily.words.map(word=>`<li><strong>${esc(word.word)}</strong> <span class="daily-word-type">${esc(word.pos)}</span><p>${esc(word.meaning)}</p><details><summary>See an example</summary><p>${esc(word.example)}</p><p class="small">Useful combinations: ${esc(word.collocations.join('; '))}</p></details></li>`).join('')}</ul><a class="daily-study-link" href="#vocabulary">Study more vocabulary →</a></div></section>`;}
