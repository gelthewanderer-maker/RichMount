export const studentPages={deliverables:'Weekly deliverables',home:'Overview',writing:'Writing studio',reading:'Reading room',listening:'Listening lab',speaking:'Speaking practice',course:'Weekly course',lessons:'Guided lessons',homework:'Homework',mock:'Mock test',guides:'Study guides',official:'Official IELTS practice',vocabulary:'Vocabulary',materials:'Lesson materials',progress:'My progress',class:'Your class',teacher:'Teacher dashboard'};
export const teacherRoutes={live:'live',attendance:'attendance',deliverables:'deliverables',home:'overview',writing:'writing',reading:'reading',listening:'listening',speaking:'speaking',course:'course',lessons:'lessons',homework:'homework',mock:'mock',guides:'guides',official:'official',vocabulary:'vocabulary',materials:'resources',progress:'inbox',class:'students',teacher:'inbox'};
export const teacherPages={live:'Live classroom',grades:'Grading sheets',attendance:'Attendance & payment',deliverables:'Weekly deliverables & points',overview:'Overview',inbox:'Student progress & submissions',students:'Students & class codes',course:'Weekly course & homework',lessons:'Weekly guided lessons',homework:'Homework',mock:'Mock tests',resources:'Learning Materials',listening:'Listening Lab',audio:'Audio library',settings:'Password',writing:'Writing studio',reading:'Reading room',speaking:'Speaking practice',guides:'Study guides',official:'Official IELTS practice',vocabulary:'Vocabulary'};
export const teacherTabs=['live','grades','attendance','deliverables','inbox','students','lessons','course','resources','listening','official','audio','settings'];
export const teacherCourseViews=['course','homework','mock','writing','reading','speaking'];
export function teacherLocation(hash){
  const parts=String(hash||'#home').replace(/^#/,'').split('/');
  const view=parts[0]==='teacher'?(Object.hasOwn(teacherPages,parts[1])?parts[1]:'inbox'):(Object.hasOwn(teacherRoutes,parts[0])?teacherRoutes[parts[0]]:'overview');
  const id=parts[0]==='teacher'?parts[2]:parts[1];
  return '#teacher/'+view+((teacherCourseViews.includes(view)&&/^[a-z0-9-]{1,60}$/.test(id||''))||(view==='lessons'&&/^week-[1-8]$/.test(id||''))?'/'+id:'');
}
export function teacherLink(href){
  const route=String(href||'').replace(/^#/,'').split('/')[0];
  return String(href).startsWith('#')&&(Object.hasOwn(teacherRoutes,route)||route==='teacher')?teacherLocation(href):href;
}
export const teacherView=hash=>teacherLocation(hash).slice(1).split('/')[1];
export const teacherNav=view=>Object.keys(teacherRoutes).find(key=>teacherRoutes[key]===view)||'teacher';
