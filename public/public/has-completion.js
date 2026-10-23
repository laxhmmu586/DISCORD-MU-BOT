(()=>{
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const portraits={waiting:['wait-man','wait-woman','wait-asian-man'],ready:['ready-woman','complete-man','ready-asian-woman'],signed:['signed-woman','complete-man','signed-asian-woman'],complete:['complete-man','signed-woman','complete-asian-man']};
 const chosen=new Map(),last=new Map();
 // Choose once per visit/run/status so live updates cannot flicker between employees.
 window.hasEmployeeStatusArt=(status,run='')=>{
  const options=portraits[status];if(!Array.isArray(options))return '';
  const key=JSON.stringify([status,run]);
  if(!chosen.has(key)){
   const storageKey='has-pbb-portrait-v1:'+status;
   let previous=last.get(status);
   try{const saved=sessionStorage.getItem(storageKey);if(saved!==null&&/^\d+$/.test(saved))previous=Number(saved);}catch{}
   const next=Number.isInteger(previous)?(previous+1)%options.length:Math.floor(Math.random()*options.length);
   last.set(status,next);chosen.set(key,options[next]);
   try{sessionStorage.setItem(storageKey,String(next));}catch{}
  }
  return `<div class="has-employee-art" aria-hidden="true"><img src="/assets/pbb/staff/${chosen.get(key)}-v1.webp" alt="" width="600" height="600" decoding="async"></div>`;
 };
 window.resetHasEmployeeStatusArt=()=>chosen.clear();
 window.hasChecklistComplete=r=>`<section class="has-checklist-complete" aria-labelledby="checklist-complete-title">${window.hasEmployeeStatusArt('complete',r.id+':'+(r.resetToken||''))}<h2 id="checklist-complete-title">Checklist completed!<br><span>Both operators signed</span></h2><p class="has-final-flight">${escape(r.flightNo)} · ${escape(r.date)} · Gate ${escape(r.gate)} · ${escape(r.bridge)}</p><p class="has-final-subtitle">Both signatures are included in the PDF.</p><dl class="has-final-details">${['driver','spotter'].map(role=>`<div><dt>${role==='driver'?'PBB Driver':'Spotter'}</dt><dd>✓ ${escape(r.signatures[role].name)} · EID ${escape(r.signatures[role].eid||'—')}</dd></div>`).join('')}<div><dt>Google Drive archive</dt><dd class="${r.delivery.status==='sent'?'is-sent':r.delivery.status==='failed'?'is-failed':''}">${r.delivery.status==='sent'?'✓ Sent':r.delivery.status==='failed'?'Failed':'Saving…'}</dd></div>${r.station==='LAX'&&r.account==='MU'&&r.discordDelivery?`<div><dt>Discord notification</dt><dd class="${r.discordDelivery.status==='sent'?'is-sent':r.discordDelivery.status==='failed'?'is-failed':''}">${r.discordDelivery.status==='sent'?'✓ Sent':r.discordDelivery.status==='failed'?'Failed':'Sending…'}</dd></div>`:''}</dl>${r.delivery.status==='failed'?`<p class="has-final-error" role="status">${escape(r.delivery.error||'Delivery failed. Please retry.')}</p>`:''}<div class="has-final-actions">${r.delivery.status==='failed'||r.station==='LAX'&&r.account==='MU'&&r.discordDelivery?.status==='failed'?'<button id="retry" type="button">Retry delivery</button>':''}<button id="download-pdf" type="button">↓ Download PDF</button></div><p id="has-download-status" role="status" aria-live="polite"></p><button id="back" class="has-final-new" type="button">+ New checklist</button></section>`;
})();
