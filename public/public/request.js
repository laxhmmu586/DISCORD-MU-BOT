(() => {
 const $=id=>document.getElementById(id);
 const base=(window.MU_API_BASE||(['localhost','127.0.0.1'].includes(location.hostname)?location.origin:'https://api.mufcapp.net')).replace(/\/$/,'');
 let screen='choose',type='',employees=[],requestId=crypto.randomUUID(),busy=false,pendingPayload=null;
 const label=t=>t==='late'?'Coming Late':'Call Off / Sick';
 const dateLabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'});
 const timeLabel=t=>new Date('2000-01-01T'+t+':00Z').toLocaleTimeString('en-US',{timeZone:'UTC',hour:'numeric',minute:'2-digit'});
 function historyState(next){return{attendanceRequest:requestId,screen:next};}
 function show(next,mode='push'){if(mode!=='none')history[mode==='replace'?'replaceState':'pushState'](historyState(next),'');screen=next;for(const n of ['choose','details','review','success'])$(n).hidden=n!==next;$('back').hidden=next==='choose'||next==='success';$('step-caption').textContent={choose:'ATTENDANCE',details:'YOUR DETAILS',review:'ONE LAST LOOK',success:'ALL SET'}[next];const step={choose:0,details:1,review:2,success:3}[next];[...$('progress').children].forEach((n,i)=>n.classList.toggle('active',i<=step));$('status').textContent='';const h=$(next).querySelector('h2');h.tabIndex=-1;h.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
 async function api(path,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(base+path,{...options,signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',...options.headers}});
   if([502,503,504].includes(response.status)){const error=Error(path.endsWith('/employees')?'The employee service is temporarily unavailable. Please try again shortly.':'Could not confirm your request was saved to Google Sheets. Please retry with this page open.');error.status=response.status;throw error;}
   const data=await response.json().catch(()=>{throw Error('The service is unavailable. Please try again.');});
   if(!response.ok){const error=Error(data.error||'Could not complete your request. Please try again.');error.status=response.status;throw error;}
   return data;
  }catch(error){if(controller.signal.aborted)throw Error('The service took too long to respond. Please retry with this page open; the same request reference will be used.');throw error;}
  finally{clearTimeout(timer);}
 }
 async function loadEmployees(){ $('employee').disabled=true;$('continue').disabled=true;$('retry-employees').hidden=true;try{const data=await api('/attendance-api/employees');employees=data.employees;if(!employees.length)throw Error('No employees are available. Please contact your supervisor.');$('employee').replaceChildren(new Option('Select your name',''),...employees.map(e=>new Option(e.name,e.id)));$('employee').disabled=false;$('continue').disabled=false;$('status').textContent='';}catch(e){$('employee').replaceChildren(new Option('Unable to load employees',''));$('status').textContent=e.message;$('retry-employees').hidden=false;}}
 function updateTime(){if(!$('arrival').value)return;const[h,m]=$('arrival').value.split(':').map(Number);$('arrival-slider').value=h*60+m;const parts=timeLabel($('arrival').value).split(' ');$('time-display').replaceChildren(document.createTextNode(parts[0]+' '),Object.assign(document.createElement('small'),{textContent:parts[1]}));$('arrival-slider').style.setProperty('--arrival-progress',((h*60+m)/1435*100)+'%');}
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function reset(){requestId=crypto.randomUUID();pendingPayload=null;$('details-form').reset();$('note').value='';$('reason-count').textContent='0/1000';$('date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('arrival').value='10:00';$('arrival-slider').value='600';updateTime();}
 function fill(dl,fields){dl.replaceChildren(...fields.map(([name,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;row.append(dt,dd);return row;}));}
 function payload(){return{requestId,employeeId:$('employee').value,type,date:type==='late'?today():$('date').value,arrivalTime:type==='late'?$('arrival').value:'',reason:$('reason').value.trim(),note:$('note').value.trim()};}
 document.querySelectorAll('[data-type]').forEach(button=>button.onclick=()=>{type=button.dataset.type;document.querySelector('.panel').classList.toggle('sick-theme',type==='sick');$('detail-title').textContent=label(type);$('type-icon').textContent=type==='late'?'◷':'✚';$('date-field').hidden=type==='late';if(type==='late')$('date').value=today();$('late-fields').hidden=type!=='late';$('arrival').required=type==='late';$('reason-label').textContent=type==='late'?'Why?':'Reason';$('reason').placeholder=type==='sick'?'Any details you’d like to share…':'Anything you’d like your supervisor to know…';show('details');});
 $('back').onclick=()=>{if(!busy&&!pendingPayload)history.back();else if(pendingPayload)$('status').textContent='Please retry this submission before changing the request. Its save status is not yet confirmed.';};
 $('reason').oninput=()=>{$('reason').setCustomValidity('');$('reason-count').textContent=$('reason').value.length+'/1000';};$('retry-employees').onclick=loadEmployees;$('arrival').oninput=updateTime;
 $('arrival-slider').oninput=()=>{const m=Number($('arrival-slider').value);$('arrival').value=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;updateTime();};
 $('details-form').onsubmit=e=>{e.preventDefault();const p=payload(),employee=employees.find(e=>e.id===p.employeeId);if(!p.reason){$('reason').setCustomValidity('Please explain why you are submitting this request.');$('reason').reportValidity();return;}if(!employee)return;const fields=[['Employee',employee.name],['Date',dateLabel(p.date)]];if(type==='late')fields.push(['Arrival',timeLabel(p.arrivalTime)]);fields.push(['Reason',p.reason||'No reason provided']);$('review-type').textContent=(type==='late'?'◷  ':'✚  ')+label(type);fill($('review-fields'),fields);show('review');};
 $('submit').onclick=async()=>{if(busy)return;busy=true;pendingPayload??=payload();$('submit').disabled=true;$('back').disabled=true;$('note').disabled=true;$('sending').hidden=false;$('status').textContent='';try{const data=await api('/attendance-api/requests',{method:'POST',body:JSON.stringify(pendingPayload)}),r=data.record;const fields=[['Reference',r.reference],['Type',label(r.type)],['Employee',r.employeeName],['Date',dateLabel(r.date)]];if(r.arrivalTime)fields.push(['Arrival',timeLabel(r.arrivalTime)]);fields.push(['Submitted',new Date(r.submittedAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'})+' PT']);fill($('receipt'),fields);$('notification-status').textContent=data.notificationPending?'Saved to Google Sheets. Your Discord notification is pending delivery.':'Saved to Google Sheets and sent to your team.';show('success','replace');}catch(e){if(e.status===400){pendingPayload=null;$('note').disabled=false;}$('status').textContent=e.message;}finally{busy=false;$('submit').disabled=false;$('back').disabled=false;$('sending').hidden=true;}};
 $('home').onclick=()=>{reset();$('note').disabled=false;show('choose','replace');loadEmployees();};
 window.addEventListener('popstate',event=>{
  if(busy||pendingPayload||screen==='success'){
   history.replaceState(historyState(screen),'');
   if(screen!=='success')$('status').textContent='Please retry this submission before changing the request. Its save status is not yet confirmed.';
   return;
  }
  const state=event.state;
  if(state?.attendanceRequest===requestId&&['choose','details','review'].includes(state.screen))show(state.screen,'none');
  else show('choose','replace');
 });
 reset();show('choose','replace');loadEmployees();
})();
