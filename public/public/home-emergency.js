(() => {
 const status=document.getElementById('home-emergency-status'),contact=document.getElementById('home-emergency-contact'),list=document.getElementById('home-emergency-list'),scope=document.getElementById('home-emergency-scope');
 if(!status||!contact)return;
 const preview=['127.0.0.1','localhost','[::1]'].includes(window.location?.hostname)&&new URLSearchParams(window.location.search).get('preview')==='1';
 let generation=0,context=window.hasReportContext;
 function clear(message){contact.hidden=true;list.replaceChildren();scope.textContent='';status.hidden=false;status.textContent=message;}
 async function refresh(){
  const current=++generation;
  if(!context?.canChecklist||context.error){clear(context?.error?'Sign in to view your account’s emergency contact.':'Emergency contact is unavailable for your account.');return;}
  clear('Loading emergency contact…');
  try{
   let data;
   if(preview){const values=JSON.parse(localStorage.getItem('has-emergency-design')||'null');data={revision:values?1:0,contacts:values||{},scope:{station:'LAX',account:'MU'}};}
   else data=await window.hasReportRequest('/checklist/emergency-notification/content');
   if(current!==generation)return;
   if(!data.revision){clear('Save your emergency contacts in Checklist to display all seven calls here.');return;}
   const model=window.emergencyNotification,contacts={...model.normalize(data.values),...data.contacts};
   for(const call of model.calls){
    const row=document.createElement('li');row.dataset.call=String(call.number);
    const heading=document.createElement('div');heading.className='home-emergency-call-heading';
    const order=document.createElement('span');order.className='home-emergency-order';order.textContent=call.ordinal+' CALL';
    const title=document.createElement('strong');title.className='home-emergency-role';title.textContent=call.title;heading.append(order,title);row.append(heading);
    if(call.name){const name=document.createElement('span');name.className='home-emergency-person';name.textContent=contacts[call.name]||'Name not set';row.append(name);}
    const phone=document.createElement('a'),number=String(contacts[call.phone]||'').trim();phone.className='home-emergency-phone';phone.textContent=number||'Phone not set';phone.setAttribute('aria-label',call.ordinal+' call '+call.title+' phone number');if(/^[+\d() .-]+$/.test(number))phone.href='tel:'+number.replace(/[^+\d]/g,'');row.append(phone);list.append(row);
   }
   scope.textContent=data.scope.station+' / '+data.scope.account;status.hidden=true;contact.hidden=false;
  }catch{if(current===generation)clear('Unable to load the emergency contact. Open Checklist to view the procedure.');}
 }
 window.addEventListener('has-report-context',event=>{context=event.detail;refresh();});
 window.addEventListener('focus',()=>{if(context?.canChecklist)refresh();});
 window.addEventListener('storage',event=>{if(event.key==='has-emergency-updated'&&context?.canChecklist)refresh();});
 if(context)refresh();
})();
