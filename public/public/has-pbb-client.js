(() => {
 const $=id=>document.getElementById(id),esc=escapeHtml,view=$('has-view'),status=$('has-status');
 let context,record,role='spotter',draft={flightNo:'',gate:''},stage='gate',bridge='',strokes=[],busy=false,controller,streamKey='',gateTimer,serverOffset=0,slide=0,slidesTimer,reconnectTimer,contextTimer;
 const api=(path='',body)=>apiJson('/has-pbb-api'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const art=name=>'/assets/pbb/'+name;
 const savedFlightKey=()=>`has-pbb-flight:${context.employee.station}:${context.employee.account}:${context.employee.id}`;
 const heldGate=()=>context.gateLocks?.find(g=>g.flightNo===draft.flightNo.trim().toUpperCase()&&Date.parse(g.expiresAt)>Date.now()+serverOffset);
 function acceptGateState(state){serverOffset=Date.parse(state.serverTime)-Date.now();context.gateLocks=state.gateLocks;context.serverTime=state.serverTime;scheduleGateExpiry();}
 function scheduleGateExpiry(){clearTimeout(gateTimer);const locks=context.gateLocks||[];if(!locks.length)return;const delay=Math.min(...locks.map(g=>Date.parse(g.expiresAt)))-(Date.now()+serverOffset);gateTimer=setTimeout(()=>{const flight=draft.flightNo.trim().toUpperCase(),previous=context.gateLocks.find(g=>g.flightNo===flight);context.gateLocks=context.gateLocks.filter(g=>Date.parse(g.expiresAt)>Date.now()+serverOffset);if(previous&&!heldGate()){setGate('');stage='gate';if(!record)render();status.textContent='Gate number cleared after 2 hours. Confirm the gate again.';}scheduleGateExpiry();},Math.max(1,delay));}
 let saveFeedback='',saveError=false;
 const cursors=new Map();
 const getItems=phase=>HAS_PBB_ITEMS.filter(q=>q.role===role&&q.phase===phase&&!q.hidden);
 const answerValue=q=>{const values=[q.id,...(q.linkedAnswers||[])].map(id=>record.answers[role][id]);return values.includes(false)?false:values.every(v=>v===true)?true:undefined;};
 const complete=phase=>getItems(phase).every(q=>answerValue(q)===true);
 const cursorKey=phase=>record.id+':'+(record.resetToken||'')+':'+role+':'+phase;
 function cursor(phase){const key=cursorKey(phase),items=getItems(phase);if(!cursors.has(key)){const next=items.findIndex(q=>answerValue(q)===undefined);cursors.set(key,next<0?items.length:next);}return cursors.get(key);}
 const atEnd=phase=>cursor(phase)>=getItems(phase).length;
 function apply(r){if(record&&r.id===record.id&&r.revision<record.revision)return;if(record&&record.id===r.id&&record.resetToken!==r.resetToken){strokes=[];slide=0;draft.gate=r.gate;status.textContent='Gate changed. Checklist cleared; restart the checks.';}record=r;render();}
 function feedback(message,error=false){saveFeedback=message;saveError=error;status.textContent=message;const inline=$('has-question-status');if(inline){inline.textContent=message;inline.hidden=!message;inline.classList.toggle('has-save-error',error);}}
 function sameRun(r,before){return r?.id===before.id&&(r.resetToken||'')===(before.resetToken||'');}
 function savedAnswer(body,before){const q=HAS_PBB_ITEMS.find(q=>q.id===body.itemId);return body.action==='answer'&&sameRun(record,before)&&[q.id,...(q.linkedAnswers||[])].every(id=>record.answers[body.role][id]===body.value);}
 async function update(body){
  if(busy)return;const before=record,requestRole=role;body={...body,role:requestRole};busy=true;feedback('Saving…');view.querySelectorAll('[data-answer],[data-step]').forEach(b=>b.disabled=true);
  let failure;
  try{
   let result;
   try{result=await api('/records/'+before.id,{...body,revision:before.revision});}
   catch(error){
    const latest=await api('/records/'+before.id);apply(latest);
    const q=HAS_PBB_ITEMS.find(q=>q.id===body.itemId),unchanged=q&&[q.id,...(q.linkedAnswers||[])].every(id=>latest.answers[requestRole][id]===before.answers[requestRole][id]);
    if(body.action==='answer'&&/Checklist changed/.test(error.message)&&sameRun(latest,before)&&unchanged&&!latest.signatures[requestRole]&&!latest.completedAt&&Boolean(latest.movingAt)===Boolean(before.movingAt)&&Boolean(latest.dockedAt)===Boolean(before.dockedAt))result=await api('/records/'+before.id,{...body,revision:latest.revision});
    else if(savedAnswer(body,before))result=latest;else throw error;
   }
   apply(result);
   if(body.action==='answer'&&savedAnswer(body,before)&&role===requestRole){const q=HAS_PBB_ITEMS.find(q=>q.id===body.itemId);cursors.set(cursorKey(q.phase),getItems(q.phase).findIndex(item=>item.id===q.id)+1);}
   feedback(sameRun(record,before)?'Saved · Shared live':'Gate changed. Restart the checks.');
  }catch(error){failure=error;feedback(error.message,true);}
  finally{busy=false;if(!failure&&body.action==='answer')saveFeedback='';render();if(!failure&&body.action==='answer')view.querySelector('.has-question-progress,.has-question-summary')?.scrollIntoView({block:'start'});}
  return !failure;
 }
 function guide(){const slider=`<div class="has-slider" aria-label="Jet bridge height and distance references"><div class="has-slide-track" id="movement-track" style="transform:translateX(${slide?-50:0}%)"><figure><img src="${art('floor-level-lax-v2.webp')}" alt="Bridge floor height reference"><figcaption>Bridge floor height</figcaption></figure><figure><img src="${art('fuselage-gap-lax-v2.webp')}" alt="Maintain fuselage clearance"><figcaption>Maintain distance from the fuselage</figcaption></figure></div></div>`;return `<section class="has-panel has-guide">${!record.dockedAt&&(!atEnd('movement')||!complete('movement'))?questions('movement',false,slider):slider}</section>`;}
 function advanceSlide(){slide=1-slide;const track=$('movement-track');if(track)track.style.transform='translateX('+(slide?-50:0)+'%)';}
 function questions(phase,showPhoto=true,referenceHtml=''){
  const items=getItems(phase);if(atEnd(phase)&&!complete(phase))cursors.set(cursorKey(phase),items.findIndex(q=>answerValue(q)!==true));const index=cursor(phase),q=items[index];
  if(!q)return '';
  return `<p class="has-question-progress" aria-live="polite">Question ${index+1} of ${items.length}</p><div class="has-question" data-question="${q.id}"><p class="has-statement" id="question-${q.id}">${esc(q.text)}</p>${referenceHtml||(showPhoto?`<img src="${art(q.photo)}" alt="${esc(q.text)}">`:'')}<div class="has-question-actions"><div class="has-answer-buttons" role="group" aria-labelledby="question-${q.id}">${[true,false].map(value=>`<button data-answer="${q.id}" data-value="${value}" class="has-answer ${value?'yes':'no'} ${answerValue(q)===value?'selected':''}" aria-pressed="${answerValue(q)===value}" ${busy?'disabled':''}>${value?'✓ YES':'✕ NO'}</button>`).join('')}</div><p id="has-question-status" class="has-save-feedback ${saveError?'has-save-error':''}" role="status" aria-live="polite" ${!saveFeedback?'hidden':''}>${esc(saveFeedback)}</p></div></div><div class="has-question-nav"><button data-step="${phase}" data-index="${index-1}" ${index===0||busy?'disabled':''}>Previous</button><button data-step="${phase}" data-index="${index+1}" ${answerValue(q)===undefined||busy?'disabled':''}>Next</button></div>`;
 }
 function licenseMarkup(){const e=context.employee,qualification=pbbQualificationStatus(e.pbbExpiry,context.date),expired=qualification==='expired',style=!e.driver?'has-expired':qualification==='warning'?'has-warning':'';const label=expired?`PBB ID ${e.pbbId} · Expired ${e.pbbExpiry} — PBB qualification expired. Cannot drive PBB.`:e.pbbId?`PBB ID ${e.pbbId} · Valid through ${e.pbbExpiry}${!e.driver?' · Driver permission unavailable':qualification==='warning'?' · Warning: PBB qualification expires in less than 1 month.':''}`:'No PBB ID on file. Cannot drive PBB.';return `<p id="has-license" class="${style}" role="status">${esc(label)}</p>`;}
 function setGate(value){draft.gate=value;}
 function gatePicker(lock,e){
  if(lock)setGate(lock.gate);
  return `<div class="has-gate-entry"><span aria-hidden="true">GATE</span><div class="has-gate-controls"><input id="has-gate-number" name="gate" type="text" inputmode="numeric" pattern="[0-9]{3}" maxlength="3" autocomplete="off" aria-label="Gate number" placeholder="___" value="${esc(draft.gate)}" ${lock?'readonly':''}><button id="confirm-gate" type="submit" class="has-gate-confirm" ${lock?'hidden':''} ${!e[role]||!/^\d{3}$/.test(draft.gate)?'disabled':''}>Confirm ✓</button></div></div><button id="clear-gate" type="button" class="has-clear-gate has-gate-clear" ${!lock?'hidden':''}>Clear</button>`;
 }
 function bindClearGate(){if($('clear-gate'))$('clear-gate').onclick=async()=>{if(busy)return;busy=true;try{acceptGateState(await api('/gate/clear',{flightNo:draft.flightNo}));setGate('');stage='gate';render();status.textContent='Gate number cleared';}catch(e){status.textContent=e.message;}finally{busy=false;}};}
 function bindGateInput(){
  const input=$('has-gate-number');input.readOnly=!!heldGate();input.oninput=()=>{if(heldGate())return;input.value=input.value.replace(/[^0-9]/g,'').slice(0,3);setGate(input.value);$('confirm-gate').disabled=!context.employee[role]||!/^\d{3}$/.test(draft.gate);};
 }
 function signature(){return `<section class="has-panel"><h2>${role==='driver'?'Driver':'Spotter'} signature</h2><p>${esc(context.employee.name)} · EID ${esc(context.employee.eid||'—')}</p><canvas id="has-signature" width="900" height="255" aria-label="Handwritten signature"></canvas><button id="clear-signature">Clear signature</button><button id="sign" class="primary">${role==='driver'?'Sign & submit automatically':'Sign · Complete Spotter section'}</button></section>`;}
 function drawSignature(){const canvas=$('has-signature');if(!canvas)return;const c=canvas.getContext('2d');const draw=()=>{c.clearRect(0,0,canvas.width,canvas.height);c.strokeStyle='#173b62';c.lineWidth=2;for(const stroke of strokes){c.beginPath();stroke.forEach(([x,y],i)=>i?c.lineTo(x*canvas.width,y*canvas.height):c.moveTo(x*canvas.width,y*canvas.height));c.stroke();}};draw();let active;
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);active=[point(e)];strokes.push(active);};canvas.onpointermove=e=>{if(active){active.push(point(e));draw();}};canvas.onpointerup=canvas.onpointercancel=()=>{if(active?.length<2)strokes.pop();active=null;};
  $('clear-signature').onclick=()=>{strokes=[];draw();};$('sign').onclick=()=>update({action:'sign',strokes});
 }
 function peers(){return `<div class="has-peer">${['spotter','driver'].map(r=>`<span class="${record.ready[r]===true?'yes':record.ready[r]===false?'no':''}">${r==='driver'?'Driver':'Spotter'}: ${record.ready[r]===true?'Ready to move':record.ready[r]===false?'Not ready':'Awaiting checks'}${record.signatures[r]?' · Signed ✓':''}</span>`).join('')}</div>`;}
 function driverMovementCard(){
  const ready=record.ready.spotter===true&&!!record.signatures.spotter,icon=ready?'<path d="m7 16 6 6L26 9"/>':'<path d="M10 15V7a2 2 0 0 1 4 0v8-10a2 2 0 0 1 4 0v10-8a2 2 0 0 1 4 0v11l2-4a2 2 0 0 1 4 2l-3 10a10 10 0 0 1-19-1L4 18a2 2 0 0 1 4-2l2 3Z"/>';
  const copy=ready?'Your spotter has verified that all safety conditions have been met. You can now start moving the jet bridge.':record.ready.spotter===true?'Please wait until the spotter completes their signature.':'Please wait until the spotter confirms ready to move.';
  return `<section class="has-panel has-driver-movement ${ready?'is-ready':'is-waiting'}"><div class="has-movement-status-icon" aria-hidden="true"><svg viewBox="0 0 32 32">${icon}</svg></div><h2>${ready?'Ready to Go':'Waiting for spotter'}</h2><p class="has-movement-copy">${copy}</p><button id="move" ${!ready||busy?'disabled':''}><span aria-hidden="true">${ready?'':'▷ '}</span>Start Jet Bridge Movement <span aria-hidden="true">${ready?' →':''}</span></button><p id="has-question-status" class="has-save-feedback ${saveError?'has-save-error':''}" role="status" aria-live="polite" ${!saveFeedback?'hidden':''}>${esc(saveFeedback)}</p><div class="has-movement-footer"><span aria-hidden="true">${ready?'✓':'ⓘ'}</span>${ready?'Starting confirms Driver readiness.':'The spotter will confirm when all safety conditions have been met.'}</div></section>`;
 }
 function render(){
  clearInterval(slidesTimer);slidesTimer=null;
  const e=context.employee;let html='';
  if(!record){
   const lock=heldGate();if(lock){draft.gate=lock.gate;stage='bridge';}else if(stage==='bridge'){draft.gate='';stage='gate';}
   html=`<section class="has-gate-card"><div class="has-gate-hero"><div class="has-gate-heading"><span class="has-plane-mark" aria-hidden="true">✈</span><div><h2>Confirm gate number</h2><p>Match the assigned flight and gate before selecting.</p></div></div></div><form id="gate-form" class="has-gate-form"><div class="has-assigned-gate"><div class="has-gate-sign"><div class="has-assigned-label">ASSIGNED GATE</div>${gatePicker(lock,e)}</div><div class="has-gate-marker" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="has-gate-first-row"><div class="has-flight-field"><label for="has-flight-number">✈ &nbsp; Flight number</label><div class="has-flight-control"><input id="has-flight-number" name="flightNo" aria-label="Flight number" required maxlength="7" placeholder="MU583" autocomplete="off" value="${esc(draft.flightNo)}"><details id="has-flight-menu"><summary aria-label="Choose default flight">⌄</summary><div class="has-flight-options">${(context.defaultFlights||[]).length?(context.defaultFlights||[]).map(f=>`<div class="has-flight-option"><button type="button" data-flight="${esc(f)}">${esc(f)}</button>${context.canManageFlights?`<button type="button" data-remove-flight="${esc(f)}" aria-label="Delete default flight ${esc(f)}">×</button>`:""}</div>`).join(""):"<p>No default flights saved.</p>"}</div></details></div>${context.canManageFlights?`<button type="button" id="has-add-flight">＋ Add default flight</button>`:""}</div><div class="has-current-account"><div class="has-account-scope"><span>Current account</span><strong>${esc(e.account)}</strong><small>Station ${esc(e.station)}</small><small class="has-operation-date">▦ &nbsp; ${esc(context.date)} · Arrival</small></div><div class="has-account-person"><strong>${esc(e.name)}</strong><span>EID ${esc(e.eid||'—')}</span></div>${licenseMarkup()}</div></div><div class="has-gate-second-row"><fieldset class="has-role-picker"><legend>My role</legend><select id="has-role" aria-label="My role"><option value="spotter" ${role==='spotter'?'selected':''} ${!e.spotter?'disabled':''}>Spotter</option><option value="driver" ${role==='driver'?'selected':''} ${!e.driver?'disabled':''}>Driver</option></select><div class="has-role-buttons" role="group" aria-label="Select my role"><button type="button" data-role="spotter" aria-pressed="${role==='spotter'}" ${!e.spotter?'disabled':''}>♙ &nbsp; Spotter</button><button type="button" data-role="driver" aria-pressed="${role==='driver'}" ${!e.driver?'disabled':''}>◉ &nbsp; Driver</button></div></fieldset></div></form></section>`;
   html+=`<section id="has-bridges" class="has-panel" ${!lock?'hidden':''}><h2>Select jet bridge</h2><div class="has-grid">${['L1','L2','L3'].map(b=>`<button class="has-bridge ${bridge===b?'selected':''}" data-bridge="${b}">${b}</button>`).join('')}</div></section>`;

  }else{
   html=`<button id="back">← Today's bridges</button>`;if(role!=='driver')html+=`<section class="has-panel"><h2>${esc(record.flightNo)} · Gate ${esc(record.gate)} · ${record.bridge}</h2><p>${esc(record.date)} · ${esc(record.station)} / ${esc(record.account)} · ${role==='driver'?'Driver':'Spotter'}</p>${licenseMarkup()}${peers()}</section>`;
   if(record.completedAt){html+=`<section class="has-panel"><h2>Checklist submitted ✓</h2><p>Both sections are signed and saved.</p><p>Google Drive: ${esc(record.delivery.status)}</p>${record.delivery.status==='sent'?`<a class="has-button" href="${esc(record.delivery.url)}" target="_blank" rel="noopener">Open saved PDF</a>`:record.delivery.status==='failed'?`<p class="has-expired">${esc(record.delivery.error)}</p><button id="retry">Retry Google Drive save</button>`:'<p>Saving PDF to Google Drive…</p>'}</section>`;}
   else if(!e[role])html+='<p class="has-expired">You are not qualified for this role. Cannot drive PBB without a valid qualification.</p>';
   else if(record.owners[role]&&record.owners[role]!==e.id)html+='<p class="has-wait">This role belongs to another employee. You can view shared progress.</p>';
   else if(role==='spotter'&&record.signatures.spotter){html+=`<section class="has-panel"><h2>Spotter section complete ✓</h2><p>Your signature has been saved. The Driver can continue.</p>${!record.movingAt?'<button id="revoke-ready" class="danger">Not ready · Withdraw readiness & signature</button>':''}</section>`;}
   else if(!record.movingAt){
    if(!atEnd('pre')||!complete('pre'))html+=`<section class="has-panel"><h2>Pre-movement · ${role==='driver'?'Driver':'Spotter'}</h2>${questions('pre')}</section>`;
    if(atEnd('pre')&&role==='spotter')html+=`<section class="has-panel has-ready-panel"><h2>${role==='driver'?'My spotter has verified that all safety conditions have been met.':'All safety conditions have been met.'}</h2><img class="has-gate-art" src="${art('ready-lax-v2.webp')}" alt="Ready to move confirmation"><button data-ready="true" class="ready ${record.ready[role]===true?'selected':''}" ${!complete('pre')?'disabled':''}>Ready to move</button><button data-ready="false" class="danger ${record.ready[role]===false?'selected':''}">Not ready</button><small>Ready confirms communication with your partner. You can change your selection until movement starts.</small></section>`;
    if(atEnd('pre')&&role==='spotter'&&record.ready.spotter===true)html+=signature();
    if(atEnd('pre')&&role==='driver')html+=driverMovementCard();
   }else if(role==='driver'){
    if(!record.dockedAt)html+='<section class="has-panel"><h2>Moving…</h2><div class="has-moving" aria-label="Jet bridge moving"><svg viewBox="0 0 200 60" aria-hidden="true"><path d="M5 10h140v30H5zM145 25h45v15h-45" fill="#285a89"/><circle cx="30" cy="47" r="9" fill="#152d45"/><circle cx="140" cy="47" r="9" fill="#152d45"/></svg></div><p>Follow the height and distance references below.</p></section>';
    html+=guide();
    if(!record.dockedAt)html+='<section class="has-panel"><button id="dock" class="primary" '+(!record.answers.driver.floor?'disabled':'')+'>Docking complete · Continue to After docking</button></section>';
    else{if(!atEnd('after')||!complete('after'))html+=`<section class="has-panel"><h2>After docking</h2>${questions('after')}</section>`;if(atEnd('after')&&complete('after'))html+=signature();}
   }
  }
  view.innerHTML=html;view.dataset.revision=record?.revision||'';view.dataset.gate=record?.gate||'';
  if(!record){
   const form=$('gate-form');bindGateInput();form.oninput=()=>{draft.flightNo=form.elements.flightNo.value;};form.elements.flightNo.onchange=()=>{draft.flightNo=form.elements.flightNo.value.trim().toUpperCase();const lock=heldGate();setGate(lock?.gate||'');$('has-gate-number').value=draft.gate;$('confirm-gate').hidden=!!lock;$('confirm-gate').disabled=!e[role]||!/^\d{3}$/.test(draft.gate);$('clear-gate').hidden=!lock;bindGateInput();$('has-bridges').hidden=!lock;stage=lock?'bridge':'gate';};$('has-role').onchange=ev=>{role=ev.target.value;strokes=[];render();};
   view.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{role=b.dataset.role;strokes=[];render();});
   view.querySelectorAll('[data-flight]').forEach(b=>b.onclick=()=>{draft.flightNo=b.dataset.flight;setGate(heldGate()?.gate||'');render();});
   if($('has-add-flight'))$('has-add-flight').onclick=async()=>{const flightNo=form.elements.flightNo.value.trim().toUpperCase();try{context.defaultFlights=await api('/flights',{flightNo});draft.flightNo=flightNo;render();status.textContent='Default flight saved for '+e.station+' / '+e.account;}catch(err){status.textContent=err.message;}};
   view.querySelectorAll('[data-remove-flight]').forEach(b=>b.onclick=async()=>{try{context.defaultFlights=await api('/flights/'+encodeURIComponent(b.dataset.removeFlight)+'/delete',{});render();status.textContent='Default flight removed';}catch(err){status.textContent=err.message;}});

   bindClearGate();
   form.onsubmit=async ev=>{ev.preventDefault();if(busy||heldGate())return;draft={flightNo:form.elements.flightNo.value.trim().toUpperCase(),gate:form.elements.gate.value};if(!/^\d{3}$/.test(draft.gate))return;busy=true;try{acceptGateState(await api('/gate',{...draft,role}));try{localStorage.setItem(savedFlightKey(),draft.flightNo);}catch{}stage='bridge';render();status.textContent='Gate number locked for 2 hours';}catch(e){status.textContent=e.message;}finally{busy=false;}};
   view.querySelectorAll('[data-bridge]').forEach(b=>b.onclick=async()=>{if(busy||!heldGate())return;busy=true;b.disabled=true;try{bridge=b.dataset.bridge;strokes=[];apply(await api('/records',{...draft,bridge,role}));connect(record.id);status.textContent='Shared checklist opened';}catch(e){status.textContent=e.message;}finally{busy=false;b.disabled=false;}});

  }else{
   $('back').onclick=async()=>{if(busy)return;record=null;strokes=[];render();connect();};
   view.querySelectorAll('[data-answer]').forEach(el=>el.onclick=()=>update({action:'answer',itemId:el.dataset.answer,value:el.dataset.value==='true'}));
   view.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{if(busy)return;cursors.set(cursorKey(el.dataset.step),Number(el.dataset.index));render();});
   view.querySelectorAll('[data-ready]').forEach(el=>el.onclick=()=>update({action:'ready',value:el.dataset.ready==='true'}));
   if($('revoke-ready'))$('revoke-ready').onclick=()=>{strokes=[];update({action:'ready',value:false});};
   if($('move'))$('move').onclick=async()=>{if(busy)return;if(record.ready.driver!==true&&!await update({action:'ready',value:true}))return;await update({action:'move'});};if($('dock'))$('dock').onclick=()=>update({action:'dock'});
   if($('retry'))$('retry').onclick=async()=>{try{apply(await api('/records/'+record.id+'/retry',{}));}catch(e){status.textContent=e.message;}};
   if($('movement-track'))slidesTimer=setInterval(advanceSlide,4500);
   drawSignature();
  }
 }
 async function connect(id=''){
  clearTimeout(reconnectTimer);controller?.abort();controller=new AbortController();const signal=controller.signal;streamKey=id;if(!id){status.textContent='Ready to confirm gate';return;}
  try{
   const response=await fetch(resolveApiBase()+'/has-pbb-api/stream'+(id?'?id='+encodeURIComponent(id):''),{headers:await authHeaders(),signal});if(!response.ok)throw Error('Shared connection unavailable');status.textContent='Live · Shared state connected';
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let n;while((n=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,n);buffer=buffer.slice(n+2);const data=event.split('\n').find(s=>s.startsWith('data: '));if(data){const result=JSON.parse(data.slice(6));if(id){if(record?.id===id)apply(result);}}}}
   throw Error('Live connection interrupted');
  }catch(e){if(signal.aborted)return;status.textContent='Reconnecting shared state…';reconnectTimer=setTimeout(()=>{if(streamKey===id)connect(id);},3000);}
 }
 function showContext(){$('has-dashboard-link').hidden=!context.dashboard;}
 async function refreshContext(){try{const latest=await api('/context');if(latest.employee.station!==context.employee.station||latest.employee.account!==context.employee.account||latest.date!==context.date){location.reload();return;}const prior={...context,serverTime:''},next={...latest,serverTime:''};acceptGateState(latest);if(JSON.stringify(next)!==JSON.stringify(prior)){context=latest;if(!heldGate()){setGate('');stage='gate';}showContext();render();}}catch(e){controller?.abort();view.replaceChildren();status.textContent=e.message;}}
 requireServiceLogin(async()=>{try{context=await api('/context');acceptGateState(context);try{draft.flightNo=localStorage.getItem(savedFlightKey())||'';}catch{}if(!draft.flightNo&&context.gateLocks.length===1)draft.flightNo=context.gateLocks[0].flightNo;role=context.employee.driver?'driver':'spotter';showContext();render();connect();contextTimer=setInterval(refreshContext,30000);}catch(e){status.textContent=e.message;}});
 window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(reconnectTimer);clearTimeout(gateTimer);clearInterval(slidesTimer);clearInterval(contextTimer);});
})();
