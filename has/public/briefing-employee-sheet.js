(()=>{
 const query=new URLSearchParams(location.search);
 if(query.has('quick')||query.has('embed'))return;
 const shell=document.querySelector('.briefing-shell'),host=document.createElement('div');
 host.id='briefing-employee-sheet';host.hidden=true;
 const content=document.createElement('div');host.append(content);
 document.getElementById('arrival-content').append(host);
 const mobile=matchMedia('(max-width:700px)'),time=document.getElementById('panel-time'),timeHome=document.createComment('Arrival time record home');time.before(timeHome);
 let sequence=0,timer,lastContext,selectedTeam='counter',renderedHtml='',selectedTier='platinum',selectedCabin='business';
 function teamTabs(){
  for(const button of content.querySelectorAll('[data-employee-team]')){const active=button.dataset.employeeTeam===selectedTeam;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  for(const panel of content.querySelectorAll('[data-employee-team-panel]'))panel.hidden=panel.dataset.employeeTeamPanel!==selectedTeam;
 }
 function membershipTabs(){
  for(const button of content.querySelectorAll('[data-employee-tier]')){const active=button.dataset.employeeTier===selectedTier;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  for(const panel of content.querySelectorAll('[data-employee-tier-panel]')){panel.hidden=panel.dataset.employeeTierPanel!==selectedTier;for(const button of panel.querySelectorAll('[data-employee-cabin]'))button.setAttribute('aria-pressed',String(button.dataset.employeeCabin===selectedCabin));for(const row of panel.querySelectorAll('[data-employee-benefits]'))row.hidden=!['all',selectedCabin].includes(row.dataset.employeeBenefits);}
 }
 host.addEventListener('click',event=>{const tier=event.target.closest('[data-employee-tier]'),cabin=event.target.closest('[data-employee-cabin]');if(tier){selectedTier=tier.dataset.employeeTier;selectedCabin='business';}else if(cabin)selectedCabin=cabin.dataset.employeeCabin;else return;membershipTabs();});
 host.addEventListener('keydown',event=>{const tier=event.target.closest('[data-employee-tier]');if(!tier||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=[...content.querySelectorAll('[data-employee-tier]')].map(button=>button.dataset.employeeTier),index=keys.indexOf(selectedTier);selectedTier=keys[event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:keys.length-1))%keys.length];selectedCabin='business';membershipTabs();content.querySelector('[data-employee-tier="'+selectedTier+'"]').focus();});
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
  if(host.dataset.key!==key){content.textContent='Loading briefing…';host.dataset.key=key;selectedTeam='counter';selectedTier='platinum';selectedCabin='business';renderedHtml='';}
  timer=setTimeout(async()=>{
   try{
    const data=await peopleApi('/briefing-api/employee-sheet?'+new URLSearchParams({date:context.date,flight:context.flight,direction:context.direction}));
    if(run===sequence&&data.html!==renderedHtml){const active=content.contains(document.activeElement)?document.activeElement:null,focusedTeam=active?.dataset.employeeTeam,focusedTier=active?.dataset.employeeTier,focusedCabin=active?.dataset.employeeCabin;content.innerHTML=data.html;renderedHtml=data.html;teamTabs();membershipTabs();if(focusedTeam)content.querySelector('[data-employee-team="'+selectedTeam+'"]').focus();else if(focusedTier)content.querySelector('[data-employee-tier="'+selectedTier+'"]').focus();else if(focusedCabin)content.querySelector('[data-employee-tier-panel="'+selectedTier+'"] [data-employee-cabin="'+selectedCabin+'"]').focus();window.dispatchEvent(new Event('briefing-sheet-rendered'));}
   }catch(error){if(run===sequence){content.replaceChildren();renderedHtml='';const message=document.createElement('p'),retry=document.createElement('button');message.setAttribute('role','status');message.textContent='Briefing could not be loaded: '+error.message;retry.type='button';retry.textContent='Retry';retry.onclick=()=>update(lastContext);content.append(message,retry);}}
  },100);
 }
 window.addEventListener('briefing-direction',event=>update(event.detail));
 mobile.addEventListener('change',()=>{if(lastContext)update(lastContext);});
})();
