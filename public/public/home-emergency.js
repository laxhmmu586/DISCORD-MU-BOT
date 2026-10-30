(() => {
 const status=document.getElementById('home-emergency-status'),contact=document.getElementById('home-emergency-contact'),phone=document.getElementById('home-emergency-phone'),scope=document.getElementById('home-emergency-scope');
 if(!status||!contact)return;
 const preview=['127.0.0.1','localhost','[::1]'].includes(window.location?.hostname)&&new URLSearchParams(window.location.search).get('preview')==='1';
 let generation=0,context=window.hasReportContext;
 function clear(message){contact.hidden=true;phone.textContent='';phone.removeAttribute('href');scope.textContent='';status.hidden=false;status.textContent=message;}
 async function refresh(){
  const current=++generation;
  if(!context?.canChecklist||context.error){clear(context?.error?'Sign in to view your account’s emergency contact.':'Emergency contact is unavailable for your account.');return;}
  clear('Loading emergency contact…');
  try{
   let data;
   if(preview){const values=JSON.parse(localStorage.getItem('has-emergency-design')||'null');data={revision:values?1:0,contacts:values||{},scope:{station:'LAX',account:'MU'}};}
   else data=await window.hasReportRequest('/checklist/emergency-notification/content');
   if(current!==generation)return;
   const number=String(data.contacts?.call1Phone||'').trim();
   if(!data.revision||!number){clear('Save your emergency contacts in Checklist to display the first call here.');return;}
   phone.textContent=number;if(/^[+\d() .-]+$/.test(number))phone.href='tel:'+number.replace(/[^+\d]/g,'');
   scope.textContent=data.scope.station+' / '+data.scope.account;status.hidden=true;contact.hidden=false;
  }catch{if(current===generation)clear('Unable to load the emergency contact. Open Checklist to view the procedure.');}
 }
 window.addEventListener('has-report-context',event=>{context=event.detail;refresh();});
 window.addEventListener('focus',()=>{if(context?.canChecklist)refresh();});
 window.addEventListener('storage',event=>{if(event.key==='has-emergency-updated'&&context?.canChecklist)refresh();});
 if(context)refresh();
})();
