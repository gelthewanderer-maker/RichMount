// Small, transparent offline writing checker. No external service receives essays.
export const words = text => (text.match(/\b[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*\b/gu)||[]).length;
const preserveCase=(old,value)=>old[0]===old[0].toUpperCase()?value[0].toUpperCase()+value.slice(1):value;
export function checkGrammar(text){
  const issues=[];
  const add=(regex,fix,message,category='Grammar')=>{for(const m of text.matchAll(regex)){const replacement=typeof fix==='function'?fix(m):fix;if(replacement!==m[0])issues.push({start:m.index,end:m.index+m[0].length,original:m[0],replacement,message,category});}};
  const spell={alot:'a lot',becuase:'because',recieve:'receive',recieved:'received',enviroment:'environment',goverment:'government',goverments:'governments',definately:'definitely',seperate:'separate',seperately:'separately',arguement:'argument',occured:'occurred',developement:'development',educaton:'education',teh:'the',thier:'their',wich:'which',writting:'writing',grammer:'grammar',neccessary:'necessary',accomodation:'accommodation',sucess:'success',responsability:'responsibility',increse:'increase',decrese:'decrease',polution:'pollution',benifit:'benefit',beleive:'believe',advantange:'advantage',langauge:'language',knowlege:'knowledge',oppertunity:'opportunity',tommorow:'tomorrow'};
  for(const [bad,good] of Object.entries(spell))add(new RegExp('\\b'+bad+'\\b','gi'),m=>preserveCase(m[0],good),'Check this commonly misspelled word.','Spelling');
  add(/\bI is\b/g,'I am','Use “am” with “I”.');
  add(/\bI has\b/g,'I have','Use “have” with “I”.');
  add(/\b(he|she|it) (are|have|were)\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()+' '+({are:'is',have:'has',were:'was'}[m[2].toLowerCase()])),'Check agreement with this singular subject.');
  add(/\b(they|we|you) (is|has|was)\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()+' '+({is:'are',has:'have',was:'were'}[m[2].toLowerCase()])),'Check agreement with this plural subject.');
  add(/\b(people|students|children|governments|cars|buses) (is|has|was)\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()+' '+({is:'are',has:'have',was:'were'}[m[2].toLowerCase()])),'This plural subject normally takes a plural verb.');
  add(/\b(he|she|it) (go|think|want|need|work|live)\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()+' '+m[2].toLowerCase()+(m[2].toLowerCase()==='go'?'es':'s')),'Third-person singular present verbs normally need -s or -es.');
  add(/\b(must|should|can|could|will|would|may|might) (goes|works|thinks|wants|needs|improves|reduces|increases|provides|helps)\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()+' '+m[2].toLowerCase().replace(/(es|s)$/,(v)=>m[2].toLowerCase()==='goes'?'':v==='es'?'e':'')),'Use the base verb after a modal.');
  add(/\b(should|must|can|could|will|would|may|might) to\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()),'A modal is followed directly by a base verb.');
  add(/\b(an) (university|European|useful|unique)\b/gi,m=>preserveCase(m[0],'a '+m[2]),'These words begin with a consonant sound: use “a”.');
  add(/\ba (hour|honest)\b/gi,m=>preserveCase(m[0],'an '+m[1]),'These words begin with a vowel sound: use “an”.');
  add(/\ba (important|interesting|expensive|effective|essential|excellent)\b/gi,m=>preserveCase(m[0],'an '+m[1]),'Use “an” before this vowel sound.');
  add(/\b(many|several|these|those) (student|problem|reason|car|benefit|advantage|disadvantage)\b/gi,m=>preserveCase(m[0],m[1].toLowerCase()+' '+m[2].toLowerCase()+'s'),'This determiner needs a plural countable noun.');
  add(/\b(informations|advices|equipments|furnitures|homeworks|researches)\b/gi,m=>preserveCase(m[0],m[0].toLowerCase().slice(0,-1)),'This noun is usually uncountable in this context; check the intended meaning.');
  add(/\bin the other hand\b/gi,m=>preserveCase(m[0],'on the other hand'),'The linking phrase is “on the other hand”.');
  add(/\bdiscuss about\b/gi,m=>preserveCase(m[0],'discuss'),'“Discuss” normally takes its object directly.');
  add(/\bdespite of\b/gi,m=>preserveCase(m[0],'despite'),'Use “despite” followed by a noun or -ing form.');
  add(/\bmore better\b/gi,m=>preserveCase(m[0],'better'),'“Better” is already comparative.');
  add(/\bmost best\b/gi,m=>preserveCase(m[0],'best'),'“Best” is already superlative.');
  add(/\baccording to me\b/gi,m=>preserveCase(m[0],'in my opinion'),'Use “in my opinion” to introduce your own view.','Style');
  add(/\b(because of|due to) of\b/gi,m=>m[1],'Remove the extra “of”.');
  add(/\b(the|a|an|to|of|in|is|are|and)\s+\1\b/gi,m=>m[1],'Check this repeated word.','Punctuation');
  add(/\bi\b/g,'I','Always capitalise the pronoun “I”.','Capitalisation');
  add(/[ \t]+([,.;!?])/g,m=>m[1],'Remove the space before punctuation.','Punctuation');
  add(/([,;!?])(?=[A-Za-z])/g,m=>m[1]+' ','Add a space after punctuation.','Punctuation');
  add(/(^|[.!?]\s+)([a-z])/g,m=>m[1]+m[2].toUpperCase(),'Start a sentence with a capital letter.','Capitalisation');
  issues.sort((a,b)=>a.start-b.start || b.end-a.end);
  const unique=[];for(const i of issues){if(!unique.some(x=>i.start<x.end&&i.end>x.start))unique.push(i);}
  let corrected=text;for(const i of [...unique].reverse())corrected=corrected.slice(0,i.start)+i.replacement+corrected.slice(i.end);
  const notes=[];
  if(text.trim()&&!/[.!?]["”']?$/.test(text.trim()))notes.push('Check the final sentence: it may need end punctuation.');
  const sentences=text.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
  if(sentences.some(s=>words(s)>35))notes.push('Review sentences longer than 35 words for clarity and punctuation.');
  if(/\b(don't|can't|won't|isn't|aren't|it's|I'm)\b/i.test(text))notes.push('Consider full forms instead of contractions in formal Academic writing.');
  return {issues:unique,corrected,notes,wordCount:words(text),paragraphs:text.trim()?text.trim().split(/\n\s*\n/).length:0};
}
