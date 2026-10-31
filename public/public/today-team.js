(()=>{
 const toggle=document.getElementById('home-today-team-toggle'),panel=document.getElementById('home-today-team'),list=document.getElementById('home-today-team-list'),status=document.getElementById('home-today-team-status'),date=document.getElementById('home-today-team-date');if(!toggle||!panel)return;
 let generation=0,eligible=false;
 function close(focus=false){panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();}
 function clear(){list.replaceChildren();date.textContent='';status.textContent='';}
 async function refresh(){
  if(!eligible||panel.hidden)return;const run=++generation;clear();status.textContent='Loading today’s team…';
  try{const user=firebase.auth().currentUser;if(!user)throw Error('Sign in required.');const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/staff-schedule-api/today-team',{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{...(window.workspaceHeaders?.()||{}),Authorization:'Bearer '+await user.getIdToken()}});if(!response.ok)throw Error(response.status===403?'Today Team is unavailable for your account.':'Unable to load today’s team. Reopen to retry.');const data=await response.json();if(run!==generation||!eligible||panel.hidden)return;
   date.textContent=new Date(data.date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
   for(const person of data.employees){const row=document.createElement('li'),avatar=document.createElement('span'),name=document.createElement('span'),shift=document.createElement('span');avatar.className='team-avatar';name.className='team-name';shift.className='team-shift';avatar.textContent=(person.nickname||person.name).split(/\s+/).map(p=>p[0]).slice(0,2).join('');if(person.avatar){const image=document.createElement('img');image.src=person.avatar;image.alt='';avatar.replaceChildren(image);}name.textContent=person.nickname||person.name;name.title=person.name;shift.textContent=person.shift;shift.title=person.shiftLabel;const color=/^#[0-9a-f]{6}$/i.test(person.shiftColor||'')?person.shiftColor:'#eeeeee',rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));shift.style.backgroundColor=color;shift.style.color=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>145?'#17202d':'#fff';row.append(avatar,name,shift);list.append(row);}status.textContent=data.employees.length?'':'No working staff scheduled for today.';
  }catch(error){if(run===generation&&eligible&&!panel.hidden)status.textContent=error.message||'Unable to load today’s team. Reopen to retry.';}
 }
 toggle.onclick=()=>{if(!panel.hidden){generation++;close();return;}panel.hidden=false;toggle.setAttribute('aria-expanded','true');void refresh();};
 document.getElementById('home-today-team-close').onclick=()=>{generation++;close(true);};
 document.addEventListener('click',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target)){generation++;close();}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){generation++;close(true);}});
 function profileChanged(context){generation++;clear();const {profile,user}=context||{};eligible=Boolean(user&&profile&&(profile.canViewOperations??(profile.station==='LAX'&&profile.account==='MU')));toggle.hidden=!eligible;if(!eligible)close();else void refresh();}
 const auth=window.firebase?.apps?.length&&window.firebase?.auth?firebase.auth():null;
 auth?.onAuthStateChanged(async user=>{profileChanged(null);if(!user)return;const run=generation;try{const result=await window.employeeProfileApi();if(run!==generation||auth.currentUser?.uid!==user.uid)return;profileChanged({profile:result.profile,user});}catch{}});
 window.addEventListener('focus',()=>void refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});setInterval(()=>{if(!document.hidden)void refresh();},60000);
})();
