(() => {
 const $=id=>document.getElementById(id),esc=escapeHtml,view=$('has-view'),status=$('has-status');
 let context,record,role='spotter',draft={flightNo:'',gate:''},stage='gate',bridge='',strokes=[],busy=false,controller,streamKey='',slide=0,slidesTimer,reconnectTimer,contextTimer;
 const api=(path='',body)=>apiJson('/has-pbb-api'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const art=name=>'/assets/pbb/'+name;
 const cursors=new Map();
 const getItems=phase=>HAS_PBB_ITEMS.filter(q=>q.role===role&&q.phase===phase&&!q.hidden);
 const answerValue=q=>{const values=[q.id,...(q.linkedAnswers||[])].map(id=>record.answers[role][id]);return values.includes(false)?false:values.every(v=>v===true)?true:undefined;};
 const complete=phase=>getItems(phase).every(q=>answerValue(q)===true);
 const cursorKey=phase=>record.id+':'+(record.resetToken||'')+':'+role+':'+phase;
 function cursor(phase){const key=cursorKey(phase),items=getItems(phase);if(!cursors.has(key)){const next=items.findIndex(q=>answerValue(q)===undefined);cursors.set(key,next<0?items.length:next);}return cursors.get(key);}
 const atEnd=phase=>cursor(phase)>=getItems(phase).length;
 function apply(r){if(record&&r.id===record.id&&r.revision<record.revision)return;if(record&&record.id===r.id&&record.resetToken!==r.resetToken){strokes=[];slide=0;draft.gate=r.gate;status.textContent='Gate changed. Checklist cleared; restart the checks.';}record=r;render();}
 async function update(body){if(busy)return;busy=true;status.textContent='Saving…';try{const r=await api('/records/'+record.id,{...body,role,revision:record.revision});if(body.action==='answer'){const q=HAS_PBB_ITEMS.find(q=>q.id===body.itemId);cursors.set(cursorKey(q.phase),getItems(q.phase).findIndex(item=>item.id===q.id)+1);}apply(r);status.textContent='Saved · Shared live';}catch(e){status.textContent=e.message;try{apply(await api('/records/'+record.id));}catch{}}finally{busy=false;}}
 function guide(){return `<section class="has-panel has-guide"><div class="has-slider" aria-label="Jet bridge height and distance references"><div class="has-slide-track" id="movement-track" style="transform:translateX(${slide?-50:0}%)"><figure><img src="${art('floor-level-lax-v2.webp')}" alt="Bridge floor height reference"><figcaption>Bridge floor height</figcaption></figure><figure><img src="${art('fuselage-gap-lax-v2.webp')}" alt="Maintain fuselage clearance"><figcaption>Maintain distance from the fuselage</figcaption></figure></div></div>${!record.dockedAt?questions('movement',false):''}</section>`;}
 function advanceSlide(){slide=1-slide;const track=$('movement-track');if(track)track.style.transform='translateX('+(slide?-50:0)+'%)';}
 function questions(phase,showPhoto=true){
  const items=getItems(phase),index=cursor(phase),q=items[index];
  if(!q)return `<div class="has-question-summary"><p>${complete(phase)?'All checks answered YES.':'Checks saved. Every check must be YES before continuing.'}</p><button data-review="${phase}">Review answers</button></div>`;
  return `<p class="has-question-progress" aria-live="polite">Question ${index+1} of ${items.length}</p><div class="has-question" data-question="${q.id}">${showPhoto?`<img src="${art(q.photo)}" alt="${esc(q.text)}">`:''}<div><p class="has-statement" id="question-${q.id}">${esc(q.text)}</p><div class="has-answer-buttons" role="group" aria-labelledby="question-${q.id}">${[true,false].map(value=>`<button data-answer="${q.id}" data-value="${value}" class="has-answer ${value?'yes':'no'} ${answerValue(q)===value?'selected':''}" aria-pressed="${answerValue(q)===value}">${value?'✓ YES':'✕ NO'}</button>`).join('')}</div></div></div><div class="has-question-nav"><button data-step="${phase}" data-index="${index-1}" ${index===0?'disabled':''}>Previous</button><button data-step="${phase}" data-index="${index+1}" ${answerValue(q)===undefined?'disabled':''}>Next</button></div>`;
 }
 function signature(){return `<section class="has-panel"><h2>${role==='driver'?'Driver':'Spotter'} signature</h2><p>${esc(context.employee.name)} · EID ${esc(context.employee.eid||'—')}</p><canvas id="has-signature" width="900" height="255" aria-label="Handwritten signature"></canvas><button id="clear-signature">Clear signature</button><button id="sign" class="primary">${role==='driver'?'Sign & submit automatically':'Sign · Complete Spotter section'}</button></section>`;}
 function drawSignature(){const canvas=$('has-signature');if(!canvas)return;const c=canvas.getContext('2d');const draw=()=>{c.clearRect(0,0,canvas.width,canvas.height);c.strokeStyle='#173b62';c.lineWidth=2;for(const stroke of strokes){c.beginPath();stroke.forEach(([x,y],i)=>i?c.lineTo(x*canvas.width,y*canvas.height):c.moveTo(x*canvas.width,y*canvas.height));c.stroke();}};draw();let active;
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);active=[point(e)];strokes.push(active);};canvas.onpointermove=e=>{if(active){active.push(point(e));draw();}};canvas.onpointerup=canvas.onpointercancel=()=>{if(active?.length<2)strokes.pop();active=null;};
  $('clear-signature').onclick=()=>{strokes=[];draw();};$('sign').onclick=()=>update({action:'sign',strokes});
 }
 function peers(){return `<div class="has-peer">${['spotter','driver'].map(r=>`<span class="${record.ready[r]===true?'yes':record.ready[r]===false?'no':''}">${r==='driver'?'Driver':'Spotter'}: ${record.ready[r]===true?'Ready to move':record.ready[r]===false?'Not ready':'Awaiting checks'}${record.signatures[r]?' · Signed ✓':''}</span>`).join('')}</div>`;}
 function render(){
  clearInterval(slidesTimer);slidesTimer=null;
  const e=context.employee;let html='';
  if(!record){
   html=`<section class="has-gate-card"><div class="has-gate-hero"><div class="has-gate-heading"><span class="has-plane-mark" aria-hidden="true">✈</span><div><h2>Confirm gate number</h2><p>Match the assigned flight and gate before selecting.</p></div></div></div><form id="gate-form" class="has-gate-form"><div class="has-assigned-gate"><div class="has-gate-sign"><label for="has-gate-number">ASSIGNED GATE</label><div class="has-gate-entry"><span aria-hidden="true">GATE</span><input id="has-gate-number" name="gate" aria-label="Gate number" required maxlength="20" placeholder="___" autocomplete="off" value="${esc(draft.gate)}"></div></div><div class="has-gate-marker" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="has-gate-first-row"><div class="has-flight-field"><label for="has-flight-number">✈ &nbsp; Flight number</label><div class="has-flight-control"><input id="has-flight-number" name="flightNo" aria-label="Flight number" required maxlength="7" placeholder="MU583" autocomplete="off" value="${esc(draft.flightNo)}"><details id="has-flight-menu"><summary aria-label="Choose default flight">⌄</summary><div class="has-flight-options">${(context.defaultFlights||[]).length?(context.defaultFlights||[]).map(f=>`<div class="has-flight-option"><button type="button" data-flight="${esc(f)}">${esc(f)}</button>${context.canManageFlights?`<button type="button" data-remove-flight="${esc(f)}" aria-label="Delete default flight ${esc(f)}">×</button>`:""}</div>`).join(""):"<p>No default flights saved.</p>"}</div></details></div>${context.canManageFlights?`<button type="button" id="has-add-flight">＋ Add default flight</button>`:""}</div><div class="has-current-account"><span>Current account</span><strong>${esc(e.account)}</strong><small class="has-current-station">Station ${esc(e.station)}</small><small class="has-operation-date">▦ &nbsp; ${esc(context.date)} · Arrival</small></div></div><div class="has-gate-second-row"><fieldset class="has-role-picker"><legend>My role</legend><select id="has-role" aria-label="My role"><option value="spotter" ${role==='spotter'?'selected':''} ${!e.spotter?'disabled':''}>Spotter</option><option value="driver" ${role==='driver'?'selected':''} ${!e.driver?'disabled':''}>Driver</option></select><div class="has-role-buttons" role="group" aria-label="Select my role"><button type="button" data-role="spotter" aria-pressed="${role==='spotter'}" ${!e.spotter?'disabled':''}>♙ &nbsp; Spotter</button><button type="button" data-role="driver" aria-pressed="${role==='driver'}" ${!e.driver?'disabled':''}>◉ &nbsp; Driver</button></div></fieldset><div class="has-gate-submit"><button id="confirm-gate" type="submit" class="primary" ${!e[role]?'disabled':''}>✓ &nbsp; Confirm gate number <span aria-hidden="true">→</span></button></div></div></form></section>`;
   if(stage==='bridge')html+=`<section class="has-panel"><h2>Select jet bridge</h2><div class="has-grid">${['L1','L2','L3'].map(b=>`<button class="has-bridge ${bridge===b?'selected':''}" data-bridge="${b}">${b}</button>`).join('')}</div></section>`;

  }else{
   html=`<button id="back">← Today's bridges</button><section class="has-panel"><h2>${esc(record.flightNo)} · Gate ${esc(record.gate)} · ${record.bridge}</h2><p>${esc(record.date)} · ${esc(record.station)} / ${esc(record.account)} · ${role==='driver'?'Driver':'Spotter'}</p>${peers()}</section>`;
   if(record.completedAt){html+=`<section class="has-panel"><h2>Checklist submitted ✓</h2><p>Both sections are signed and saved.</p><p>Google Drive: ${esc(record.delivery.status)}</p>${record.delivery.status==='sent'?`<a class="has-button" href="${esc(record.delivery.url)}" target="_blank" rel="noopener">Open saved PDF</a>`:record.delivery.status==='failed'?`<p class="has-expired">${esc(record.delivery.error)}</p><button id="retry">Retry Google Drive save</button>`:'<p>Saving PDF to Google Drive…</p>'}</section>`;}
   else if(!e[role])html+='<p class="has-expired">You are not qualified for this role. Cannot drive PBB without a valid qualification.</p>';
   else if(record.owners[role]&&record.owners[role]!==e.id)html+='<p class="has-wait">This role belongs to another employee. You can view shared progress.</p>';
   else if(role==='spotter'&&record.signatures.spotter){html+=`<section class="has-panel"><h2>Spotter section complete ✓</h2><p>Your signature has been saved. The Driver can continue.</p>${!record.movingAt?'<button id="revoke-ready" class="danger">Not ready · Withdraw readiness & signature</button>':''}</section>`;}
   else if(!record.movingAt){
    html+=`<section class="has-panel"><h2>Pre-movement · ${role==='driver'?'Driver':'Spotter'}</h2>${questions('pre')}</section>`;
    if(atEnd('pre'))html+=`<section class="has-panel"><img class="has-gate-art" src="${art('ready-lax-v2.webp')}" alt="Ready to move confirmation"><h2>${role==='driver'?'My spotter has verified that all safety conditions have been met.':'All safety conditions have been met.'}</h2><button data-ready="true" class="ready ${record.ready[role]===true?'selected':''}" ${!complete('pre')?'disabled':''}>Ready to move</button><button data-ready="false" class="danger ${record.ready[role]===false?'selected':''}">Not ready</button><small>Ready confirms communication with your partner. You can change your selection until movement starts.</small></section>`;
    if(atEnd('pre')&&role==='spotter'&&record.ready.spotter===true)html+=signature();
    if(atEnd('pre')&&role==='driver')html+=`<section class="has-panel">${record.ready.spotter===true?'<p>Spotter is Ready to move ✓</p>':'<p class="has-wait">Waiting for Spotter: Ready to move.</p>'}<button id="move" class="primary" ${record.ready.driver!==true||record.ready.spotter!==true||!record.signatures.spotter?'disabled':''}>Start jet bridge movement</button><small>Both Ready confirmations and the Spotter signature are required.</small></section>`;
   }else if(role==='driver'){
    if(!record.dockedAt)html+='<section class="has-panel"><h2>Moving…</h2><div class="has-moving" aria-label="Jet bridge moving"><svg viewBox="0 0 200 60" aria-hidden="true"><path d="M5 10h140v30H5zM145 25h45v15h-45" fill="#285a89"/><circle cx="30" cy="47" r="9" fill="#152d45"/><circle cx="140" cy="47" r="9" fill="#152d45"/></svg></div><p>Follow the height and distance references below.</p></section>';
    html+=guide();
    if(!record.dockedAt)html+='<section class="has-panel"><button id="dock" class="primary" '+(!record.answers.driver.floor?'disabled':'')+'>Docking complete · Continue to After docking</button></section>';
    else{html+=`<section class="has-panel"><h2>After docking</h2>${questions('after')}</section>`;if(atEnd('after')&&complete('after'))html+=signature();}
   }
  }
  view.innerHTML=html;
  if(!record){
   const form=$('gate-form');form.oninput=()=>{draft={flightNo:form.elements.flightNo.value,gate:form.elements.gate.value};};$('has-role').onchange=ev=>{role=ev.target.value;strokes=[];render();};
   view.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{role=b.dataset.role;strokes=[];render();});
   view.querySelectorAll('[data-flight]').forEach(b=>b.onclick=()=>{draft.flightNo=b.dataset.flight;render();});
   if($('has-add-flight'))$('has-add-flight').onclick=async()=>{const flightNo=form.elements.flightNo.value.trim().toUpperCase();try{context.defaultFlights=await api('/flights',{flightNo});draft.flightNo=flightNo;render();status.textContent='Default flight saved for '+e.station+' / '+e.account;}catch(err){status.textContent=err.message;}};
   view.querySelectorAll('[data-remove-flight]').forEach(b=>b.onclick=async()=>{try{context.defaultFlights=await api('/flights/'+encodeURIComponent(b.dataset.removeFlight)+'/delete',{});render();status.textContent='Default flight removed';}catch(err){status.textContent=err.message;}});

   form.onsubmit=ev=>{ev.preventDefault();draft={flightNo:form.elements.flightNo.value.trim().toUpperCase(),gate:form.elements.gate.value.trim().toUpperCase()};stage='bridge';render();};
   view.querySelectorAll('[data-bridge]').forEach(b=>b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{bridge=b.dataset.bridge;strokes=[];apply(await api('/records',{...draft,bridge,role}));connect(record.id);status.textContent='Shared checklist opened';}catch(e){status.textContent=e.message;}finally{busy=false;b.disabled=false;}});

  }else{
   $('back').onclick=async()=>{if(busy)return;record=null;strokes=[];render();connect();};
   view.querySelectorAll('[data-answer]').forEach(el=>el.onclick=()=>update({action:'answer',itemId:el.dataset.answer,value:el.dataset.value==='true'}));
   view.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{if(busy)return;cursors.set(cursorKey(el.dataset.step),Number(el.dataset.index));render();});
   view.querySelectorAll('[data-review]').forEach(el=>el.onclick=()=>{if(busy)return;const phase=el.dataset.review,first=getItems(phase).findIndex(q=>answerValue(q)!==true);cursors.set(cursorKey(phase),Math.max(0,first));render();});
   view.querySelectorAll('[data-ready]').forEach(el=>el.onclick=()=>update({action:'ready',value:el.dataset.ready==='true'}));
   if($('revoke-ready'))$('revoke-ready').onclick=()=>{strokes=[];update({action:'ready',value:false});};
   if($('move'))$('move').onclick=()=>update({action:'move'});if($('dock'))$('dock').onclick=()=>update({action:'dock'});
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
 function showContext(){const e=context.employee;$('has-context').innerHTML=`<span class="has-scope">${esc(e.station)} / ${esc(e.account)}</span>`;const qualification=pbbQualificationStatus(e.pbbExpiry,context.date),expired=qualification==='expired';$('has-license').className=!e.driver?'has-expired':qualification==='warning'?'has-warning':'';$('has-license').textContent=expired?`PBB ID ${e.pbbId} · Expired ${e.pbbExpiry} — PBB qualification expired. Cannot drive PBB.`:e.pbbId?`PBB ID ${e.pbbId} · Valid through ${e.pbbExpiry}${!e.driver?' · Driver permission unavailable':qualification==='warning'?' · Warning: PBB qualification expires in less than 1 month.':''}`:'No PBB ID on file. Cannot drive PBB.';$('has-dashboard-link').hidden=!context.dashboard;}
 async function refreshContext(){try{const latest=await api('/context');if(latest.employee.station!==context.employee.station||latest.employee.account!==context.employee.account||latest.date!==context.date){location.reload();return;}if(JSON.stringify(latest)!==JSON.stringify(context)){context=latest;showContext();render();}}catch(e){controller?.abort();view.replaceChildren();status.textContent=e.message;}}
 requireServiceLogin(async()=>{try{context=await api('/context');role=context.employee.driver?'driver':'spotter';showContext();render();connect();contextTimer=setInterval(refreshContext,30000);}catch(e){status.textContent=e.message;}});
 window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(reconnectTimer);clearInterval(slidesTimer);clearInterval(contextTimer);});
})();
