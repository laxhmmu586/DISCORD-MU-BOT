(()=>{
 const query=new URLSearchParams(location.search);
 if(query.has('quick')||query.has('embed'))return;
 const shell=document.querySelector('.briefing-shell'),host=document.createElement('div');
 host.id='briefing-employee-sheet';host.hidden=true;
 document.getElementById('arrival-content').append(host);
 let sequence=0,timer;
 window.addEventListener('briefing-direction',event=>{
  const context=event.detail,run=++sequence;
  clearTimeout(timer);
  const visible=context.ready&&!context.canEdit&&context.direction==='departure';
  shell.classList.toggle('employee-sheet-view',visible);host.hidden=!visible;
  if(!visible){host.replaceChildren();return;}
  const key=context.date+'|'+context.flight;
  if(host.dataset.key!==key){host.textContent='Loading departure briefing…';host.dataset.key=key;}
  timer=setTimeout(async()=>{
   try{
    const data=await peopleApi('/briefing-api/employee-sheet?'+new URLSearchParams({date:context.date,flight:context.flight,direction:'departure'}));
    if(run===sequence){host.innerHTML=data.html;window.dispatchEvent(new Event('resize'));}
   }catch(error){if(run===sequence){host.replaceChildren();const message=document.createElement('p'),retry=document.createElement('button');message.setAttribute('role','status');message.textContent='Briefing could not be loaded: '+error.message;retry.type='button';retry.textContent='Retry';retry.onclick=()=>window.dispatchEvent(new CustomEvent('briefing-direction',{detail:context}));host.append(message,retry);}}
  },100);
 });
})();
