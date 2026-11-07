(()=>{
 const query=new URLSearchParams(location.search);
 if(query.has('quick')||query.has('embed'))return;
 const shell=document.querySelector('.briefing-shell'),host=document.createElement('div');
 host.id='briefing-employee-sheet';host.hidden=true;
 const content=document.createElement('div');host.append(content);
 document.getElementById('arrival-content').append(host);
 const mobile=matchMedia('(max-width:700px)'),time=document.getElementById('panel-time'),timeHome=document.createComment('Arrival time record home');time.before(timeHome);
 let sequence=0,timer,lastContext,selectedTeam='counter',renderedHtml='';
 function teamTabs(){
  for(const button of content.querySelectorAll('[data-employee-team]')){const active=button.dataset.employeeTeam===selectedTeam;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  for(const panel of content.querySelectorAll('[data-employee-team-panel]'))panel.hidden=panel.dataset.employeeTeamPanel!==selectedTeam;
 }
 host.addEventListener('click',event=>{const button=event.target.closest('[data-employee-team]');if(button){selectedTeam=button.dataset.employeeTeam;teamTabs();}});
 host.addEventListener('keydown',event=>{const button=event.target.closest('[data-employee-team]');if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();selectedTeam=event.key==='Home'?'counter':event.key==='End'?'gate':selectedTeam==='counter'?'gate':'counter';teamTabs();content.querySelector('[data-employee-team="'+selectedTeam+'"]').focus();});
 function update(context){
  lastContext=context;const run=++sequence;
  clearTimeout(timer);
  const visible=context.ready&&!context.canEdit&&(context.direction==='departure'||mobile.matches);
  shell.classList.toggle('employee-sheet-view',visible);host.hidden=!visible;
  if(visible&&context.direction==='arrival'){if(time.parentElement!==host)host.append(time);}else if(time.parentElement===host)timeHome.after(time);
  if(!visible){content.replaceChildren();host.dataset.key='';renderedHtml='';return;}
  const key=context.date+'|'+context.flight+'|'+context.direction;
  if(host.dataset.key!==key){content.textContent='Loading briefing…';host.dataset.key=key;selectedTeam='counter';renderedHtml='';}
  timer=setTimeout(async()=>{
   try{
    const data=await peopleApi('/briefing-api/employee-sheet?'+new URLSearchParams({date:context.date,flight:context.flight,direction:context.direction}));
    if(run===sequence&&data.html!==renderedHtml){const focusedTeam=content.contains(document.activeElement)&&document.activeElement.dataset.employeeTeam;content.innerHTML=data.html;renderedHtml=data.html;teamTabs();if(focusedTeam)content.querySelector('[data-employee-team="'+selectedTeam+'"]').focus();window.dispatchEvent(new Event('briefing-sheet-rendered'));}
   }catch(error){if(run===sequence){content.replaceChildren();renderedHtml='';const message=document.createElement('p'),retry=document.createElement('button');message.setAttribute('role','status');message.textContent='Briefing could not be loaded: '+error.message;retry.type='button';retry.textContent='Retry';retry.onclick=()=>update(lastContext);content.append(message,retry);}}
  },100);
 }
 window.addEventListener('briefing-direction',event=>update(event.detail));
 mobile.addEventListener('change',()=>{if(lastContext)update(lastContext);});
})();
