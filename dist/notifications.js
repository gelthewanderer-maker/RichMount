const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function notificationListHTML(state){
 if(!state.owner)return '<p>Join your class to see your homework and activity reminders.</p><a class="notification-link" href="#class">Join your class →</a>';
 if(!state.loaded)return `<p role="${state.error?'alert':'status'}">${esc(state.error||'Checking your class activities…')}</p>`;
 const notices=state.tasks.map(a=>`<li><a class="notification-link" href="${esc(a.href||'#course/'+a.id)}"><span class="notification-meta">${a.type==='mock'?'Mock test':'Homework'} · ${esc(a.label)}${a.dueDate?' · Due '+esc(a.dueDate):''}</span><strong>${esc(a.title)}</strong>${a.message?`<span>${esc(a.message)}</span>`:''}<span class="notification-open">Open activity →</span></a></li>`);
 if(state.feedback)notices.push(`<li><a class="notification-link" href="#progress"><span class="notification-meta">Teacher feedback</span><strong>${state.feedback} ${state.feedback===1?'review is':'reviews are'} ready</strong><span class="notification-open">View your feedback →</span></a></li>`);
 const weekly=state.weekly;return `${state.error?`<p role="alert">${esc(state.error)} · Last loaded reminders are shown. Try Refresh when connected.</p>`:''}${weekly?`<div class="weekly-preview"><strong>Week ${weekly.window.week} · ${esc(weekly.window.startDate)} – ${esc(weekly.window.endDate)}</strong><p>${weekly.standing.points} approved points${weekly.awaitingApproval?' · '+weekly.awaitingApproval+' awaiting approval':''}</p>${!weekly.window.active?'<p>Your list opens when this week starts.</p>':''}</div>`:''}${notices.length?`<ul class="notification-list">${notices.join('')}</ul>`:weekly?.awaitingApproval?'<p>Fantastic job! Your deliverables are submitted. Your teacher will approve them and award points.</p>':'<p>You’re up to date. Nice work!</p>'}<a class="notification-all" href="${weekly?'#deliverables':'#homework'}">${weekly?'View this week’s list & standing':'View all homework'} →</a>`;
}
export function initStudentNotifications({getState,refresh,doc=document,win=window,storage=globalThis.localStorage,canAutoOpen=()=>true}){
 const root=doc.querySelector('#studentNotifications'),bell=doc.querySelector('#notificationBell'),panel=doc.querySelector('#notificationPanel'),body=doc.querySelector('#notificationItems'),badge=doc.querySelector('#notificationCount'),closeButton=doc.querySelector('#notificationClose'),reload=doc.querySelector('#notificationRefresh');
 let owner='',markup='';const seen=new Map();
 function markWeek(state){if(!state.weekly?.window.active)return;const key=state.weekly.window.key;seen.set(state.owner,key);try{storage?.setItem('richmount-weekly-reminder:'+state.owner,key);}catch{}}
 function previous(map,key,id){let value=map.get(id);try{value=value||storage?.getItem(key+id);}catch{}return value;}
 function close(returnFocus=false){panel.hidden=true;bell.setAttribute('aria-expanded','false');if(returnFocus&&!root.hidden)bell.focus();}
 function position(){const bottom=bell.getBoundingClientRect().bottom;panel.style.setProperty('--notification-top',Math.round(bottom+10)+'px');}
 function paint(allowPopup=true){const state=getState();if(owner!==state.owner||state.teacher){close();owner=state.owner;}root.hidden=state.teacher;
  const count=state.tasks.length+(state.feedback?1:0);badge.hidden=!count;badge.textContent=count>99?'99+':String(count);bell.setAttribute('aria-label',count?`Notifications: ${count} ${count===1?'reminder':'reminders'}`:'Notifications');
  reload.hidden=!state.owner;reload.disabled=state.loading;reload.textContent=state.loading?'Checking…':'Refresh';
  const next=notificationListHTML(state);if(next!==markup){const active=doc.activeElement,href=body.contains(active)?active.getAttribute('href'):null;body.innerHTML=next;markup=next;if(href&&!panel.hidden){const replacement=[...body.querySelectorAll('a')].find(a=>a.getAttribute('href')===href);(replacement||closeButton).focus();}}
  const week=state.weekly?.window,newWeek=week?.active&&previous(seen,'richmount-weekly-reminder:',state.owner)!==week.key;
  if(allowPopup&&!state.teacher&&state.owner&&state.loaded&&!state.loading&&!state.error&&newWeek&&canAutoOpen()&&!doc.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')&&!doc.querySelector('[data-course-action="stop-recording"]')){panel.hidden=false;bell.setAttribute('aria-expanded','true');markWeek(state);const announcement=doc.querySelector('#notificationAnnouncement');if(announcement)announcement.textContent=`Week ${week.week} deliverables are ready. Open the notification links or view this week’s list.`;}
  if(!panel.hidden)position();
 }
 bell.addEventListener('click',()=>{paint(false);if(root.hidden)return;if(!panel.hidden){close(true);return;}panel.hidden=false;bell.setAttribute('aria-expanded','true');markWeek(getState());position();closeButton.focus();void refresh();paint(false);});
 closeButton.addEventListener('click',()=>close(true));
 reload.addEventListener('click',async()=>{const pending=refresh(true);paint();await pending;paint();});
 panel.addEventListener('click',event=>{if(event.target.closest('a')){close();doc.querySelector('#app')?.focus();}});
 doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}});
 doc.addEventListener('pointerdown',event=>{if(!panel.hidden&&!root.contains(event.target))close();});
 root.addEventListener('focusout',event=>{if(event.relatedTarget&&!root.contains(event.relatedTarget))close();});
 win.addEventListener('hashchange',()=>close());win.addEventListener('resize',()=>{if(!panel.hidden)position();});
 function checkCycle(){if(!doc.hidden&&getState().owner){void refresh();paint();}}win.addEventListener('focus',checkCycle);doc.addEventListener('visibilitychange',checkCycle);win.setInterval?.(checkCycle,60000);
 paint();return {refresh:paint,close};
}
