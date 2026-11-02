(()=>{
 const button=document.getElementById('briefing-express');if(!button)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.className='arrival-express-dialog';dialog.setAttribute('aria-labelledby','express-title');
 dialog.innerHTML=`<header class="express-heading"><div><small>ARRIVAL</small><h2 id="express-title">Express</h2></div><button type="button" data-close aria-label="Close Express">×</button></header>
  <div class="express-summary"><div><span>Short Connection PAX</span><strong data-total>0</strong></div><div><span>Arrival</span><strong data-flight></strong></div><div><span>ETA · ETAB</span><strong data-eta>—</strong></div></div>
  <p class="express-status" role="status" aria-live="polite"></p>
  <section data-list-view><div class="express-toolbar"><button type="button" data-add>Add passenger</button><button type="button" data-save>Save changes</button><button type="button" data-reload>Reload list</button><button type="button" data-posters>Print preview</button><button type="button" data-email>Email</button></div>
   <p class="express-help">Add the passengers who need Express Connection. Destination can include the onward flight, for example DL555/JFK.</p>
   <form data-passenger-form><div data-passengers></div></form><p data-empty>No Short Connection passengers have been added.</p>
  </section>
  <section data-preview-view hidden><div class="express-toolbar"><button type="button" data-back>Back to list</button><button type="button" data-print>Print all</button><a data-download target="_blank" rel="noopener">Open PDF</a><button type="button" data-send>Send email</button></div>
   <div class="express-email-details" hidden><label>To<input data-recipient readonly></label><label>Subject<input data-subject readonly></label><label>Message<textarea data-body readonly rows="9"></textarea></label></div>
   <p class="express-preview-help"></p><iframe class="express-pdf-preview" title="Express PDF preview"></iframe>
  </section>`;
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),cache=new Map();let context=null,state=null,rows=[],dirty=false,busy=false,ready=false,generation=0,preview=null,blobUrl=null,view='list',sent=false,pdfReady=false;
 const selected=()=>({date:document.getElementById('briefing-date').value,flight:document.getElementById('briefing-flight').value.trim().toUpperCase()});
 const cacheKey=key=>key.date+'|'+key.flight,query=key=>'?'+new URLSearchParams(key),request=(suffix='',body,blob=false)=>peopleApi('/briefing-api/express'+suffix,body,blob);
 const status=(message,error=false)=>{$('.express-status').textContent=message;$('.express-status').classList.toggle('is-error',error);};
 function controls(){
  const editable=Boolean(state?.canEdit);$('[data-add]').hidden=$('[data-save]').hidden=!editable;
  for(const node of dialog.querySelectorAll('button'))node.disabled=busy;
  for(const input of $('[data-passengers]').querySelectorAll('input'))input.readOnly=!editable||busy;
  $('[data-save]').disabled=busy||!dirty;$('[data-posters]').disabled=busy||!rows.length;$('[data-email]').disabled=busy||!rows.length||!state?.eta||!editable;
  $('[data-send]').disabled=busy||!preview||sent||!pdfReady;$('[data-print]').disabled=busy||!pdfReady;
  $('[data-total]').textContent=String(view==='email'&&preview?preview.total:rows.length);$('[data-flight]').textContent=context?context.flight+' · '+context.date:'';$('[data-eta]').textContent=state?.eta?state.eta.clock+'L':'Waiting for ETAB';
 }
 function render(){
  $('[data-passengers]').innerHTML=rows.map((row,i)=>`<div class="express-passenger" data-id="${esc(row.id)}"><span class="express-row-number">${i+1}</span>${[['name','Name',120,'Passenger name'],['destination','Destination / connection',120,'DL555/JFK']].map(([field,label,max,placeholder])=>`<label>${label}<input data-field="${field}" value="${esc(row[field])}" maxlength="${max}" placeholder="${placeholder}" required ${state?.canEdit?'':'readonly'}></label>`).join('')}${state?.canEdit?'<button type="button" data-remove>Remove</button>':''}</div>`).join('');
  $('[data-empty]').hidden=rows.length>0;controls();
 }
 function apply(result){state=result;rows=result.passengers.map(row=>({...row}));dirty=false;cache.set(cacheKey(context),result);render();status(result.canEdit?'Shared Arrival list · Save changes before printing or sending.':'View only · You can view and print this Arrival list.');}
 async function refresh(force=false){
  const run=++generation,key={...context},cached=cache.get(cacheKey(key));if(cached&&!dirty&&(!state||cacheKey(state)!==cacheKey(key)))apply(cached);
  const quiet=Boolean(state&&cached&&!force);if(!quiet){busy=true;controls();if(!cached)status('Loading Express…');}
  try{
   if(cached&&!force){const version=await request('/version'+query(key));if(run!==generation||!dialog.open||busy||view!=='list')return;if(version.revision===cached.revision&&version.eta?.clock===cached.eta?.clock&&version.canEdit===cached.canEdit)return;if(dirty||document.activeElement?.closest('[data-passenger-form]')){status('The shared list changed. Save your changes or reload the list.');return;}}
   const result=await request(query(key));if(run===generation&&dialog.open&&!dirty&&(!quiet||!busy&&view==='list'))apply(result);
  }catch(error){if(run===generation)status(error.message,true);}finally{if(run===generation&&!quiet){busy=false;controls();}}
 }

 async function save(){
  if(!dirty)return true;if(!state?.canEdit)return false;if(!$('[data-passenger-form]').reportValidity())return false;
  const run=generation,key={...context};busy=true;controls();status('Saving Express list…');
  try{const result=await request('',{...key,revision:state.revision,passengers:rows});if(run!==generation||!dialog.open)return false;apply(result);status('Changes saved.');return true;}
  catch(error){if(run===generation)status(error.message,true);return false;}finally{if(run===generation){busy=false;controls();}}
 }
 function releasePdf(){if(blobUrl){const old=blobUrl;setTimeout(()=>URL.revokeObjectURL(old),30000);blobUrl=null;}}
 function showList(){view='list';pdfReady=false;$('[data-list-view]').hidden=false;$('[data-preview-view]').hidden=true;$('.express-pdf-preview').src='about:blank';releasePdf();preview=null;sent=false;controls();}
 function showPdf(blob,mode){
  releasePdf();pdfReady=false;blobUrl=URL.createObjectURL(blob);$('.express-pdf-preview').src=blobUrl;$('[data-download]').href=blobUrl;
  view=mode;$('[data-list-view]').hidden=true;$('[data-preview-view]').hidden=false;$('.express-email-details').hidden=mode!=='email';$('[data-send]').hidden=mode!=='email';$('[data-print]').hidden=mode!=='posters';
  $('.express-preview-help').textContent=mode==='email'?'Review the exact attachment and message below, then choose Send email.':rows.length+' passengers · One A4 landscape sheet per person · Name and destination only.';controls();
 }
 $('.express-pdf-preview').onload=()=>{pdfReady=Boolean(blobUrl)&&$('.express-pdf-preview').src===blobUrl;controls();};
 button.onclick=async()=>{
  if(!ready||dialog.open)return;const key=selected(),same=context&&cacheKey(key)===cacheKey(context);context=key;dialog.showModal();
  if(same&&dirty){showList();status('Unsaved changes are still available.');render();return;}
  state=null;rows=[];dirty=false;showList();render();await refresh();
 };
 $('[data-close]').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 let outside=false;dialog.addEventListener('pointerdown',event=>{const r=dialog.getBoundingClientRect();outside=event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);});dialog.addEventListener('click',event=>{if(outside&&event.target===dialog&&!busy)dialog.close();outside=false;});
 dialog.addEventListener('close',()=>{generation++;showList();busy=false;});
 $('[data-add]').onclick=()=>{rows.push({id:crypto.randomUUID(),name:'',seat:'',flight:context.flight,destination:''});dirty=true;render();$('[data-passengers]').lastElementChild.querySelector('input').focus();status('Unsaved changes.');};
 $('[data-passengers]').addEventListener('input',event=>{const field=event.target.dataset.field,row=rows.find(item=>item.id===event.target.closest('[data-id]')?.dataset.id);if(!row||!field||!state?.canEdit)return;row[field]=event.target.value;dirty=true;status('Unsaved changes.');controls();});
 $('[data-passengers]').addEventListener('click',event=>{if(!event.target.closest('[data-remove]')||!state?.canEdit)return;const id=event.target.closest('[data-id]').dataset.id;rows=rows.filter(row=>row.id!==id);dirty=true;render();status('Unsaved changes.');});
 $('[data-passenger-form]').onsubmit=event=>{event.preventDefault();void save();};$('[data-save]').onclick=()=>void save();$('[data-reload]').onclick=()=>{dirty=false;void refresh(true);};
 $('[data-back]').onclick=showList;
 $('[data-email]').onclick=async()=>{
  if(!await save())return;const run=generation,key={...context};busy=true;controls();status('Preparing email and attachment preview…');
  try{const result=await request('/preview',{...key,revision:state.revision});if(run!==generation||!dialog.open)return;const blob=await request('/previews/'+encodeURIComponent(result.id)+'/pdf',null,true);if(run!==generation||!dialog.open)return;preview=result;state.eta=preview.eta;$('[data-recipient]').value=preview.recipient;$('[data-subject]').value=preview.subject;$('[data-body]').value=preview.text;sent=false;showPdf(blob,'email');status('Email preview ready.');}
  catch(error){if(run===generation){preview=null;status(error.message,true);}}finally{if(run===generation){busy=false;controls();}}
 };
 $('[data-send]').onclick=async()=>{if(!preview||busy||sent)return;const prepared=preview,key={...context},run=generation;busy=true;controls();status('Sending email. Please wait…');try{const result=await request('/send',{...key,previewId:prepared.id,confirm:true});if(run!==generation||!dialog.open)return;sent=true;status(result.alreadySent?'This application email has already been sent.':'Email sent to '+prepared.recipient+'.');}catch(error){if(run===generation)status(error.message,true);}finally{if(run===generation){busy=false;controls();}}};
 $('[data-posters]').onclick=async()=>{if(!await save())return;const run=generation,key={...context};busy=true;controls();status('Preparing all passenger posters…');try{const blob=await request('/posters',{...key,revision:state.revision},true);if(run!==generation||!dialog.open)return;showPdf(blob,'posters');status('Print preview ready.');}catch(error){if(run===generation)status(error.message,true);}finally{if(run===generation){busy=false;controls();}}};
 $('[data-print]').onclick=()=>{try{const frame=$('.express-pdf-preview');frame.contentWindow.focus();frame.contentWindow.print();}catch{window.open(blobUrl,'_blank','noopener');}};
 window.addEventListener('briefing-direction',event=>{ready=Boolean(event.detail.ready)&&event.detail.direction==='arrival';button.disabled=!ready;if(dialog.open&&(!ready||cacheKey(selected())!==cacheKey(context)))dialog.close();});
 setInterval(()=>{if(dialog.open&&!document.hidden&&!busy&&!dirty&&view==='list')void refresh();},60000);
 ready=!button.hidden;button.disabled=!ready;
 if(window.firebase?.auth)firebase.auth().onAuthStateChanged(()=>{cache.clear();if(dialog.open)dialog.close();state=null;rows=[];dirty=false;});
})();
