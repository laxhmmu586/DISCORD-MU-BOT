(()=>{
 const picker=document.getElementById('request-type');if(!picker)return;
 const host=document.createElement('section');host.className='profile-panel personal-panel new-access-report';host.hidden=true;document.getElementById('uniform-content').append(host);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=r=>r.canComplete||r.status==='approved'?'Approved — awaiting requester completion':({pending:'Awaiting Lake approval',completed:'Completed',rejected:'Rejected'}[r.status]||r.status);
 let data,selected,busy=false,requestId=crypto.randomUUID(),generation=0;
 const accessOnly=document.body.hasAttribute('data-access-only');
 const requestedTitles=['Duty Manager','Senior Supervisor','Supervisor','Lead','Agent'];
 async function api(path='',body){
  const user=firebase.auth().currentUser;if(!user)throw Error('Sign in required.');
  const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/new-access-api'+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(firebase.auth().currentUser!==user)throw Error('Your sign-in changed. Reload the page.');
  const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load access requests.');return result;
 }
 function updateType(){
  if(accessOnly){picker.replaceChildren(new Option('Request New Access','new-access'));picker.value='new-access';host.hidden=false;if(data){if(data.canCreate)draw();else host.innerHTML='<div class="profile-panel-title"><h2>Request New Access</h2></div><p class="info-note">Your Main Account Business Manager can submit this request. Use the tabs above to review your requests and approvals.</p>';}return;}

  let option=picker.querySelector('[value="new-access"]');
  if(data?.canCreate&&!option){option=new Option('Request New Access','new-access');picker.add(option,picker.querySelector('[value="uniform"]'));}
  if(!data?.canCreate&&option){if(picker.value==='new-access')picker.value='';option.remove();}
 }
 function progress(r,e){
  const history=r?.history||[],submitted=history.find(h=>h.action==='submit'),reviewed=history.find(h=>['approve','reject'].includes(h.action)),completed=history.find(h=>h.action==='complete');
  const audit=h=>h?`<dl class="oa-node-audit"><div><dt>Name</dt><dd>${esc(h.name)}</dd></div><div><dt>Processed at</dt><dd>${esc(new Date(h.at).toLocaleString('en-US',{timeZone:'America/Los_Angeles'}))} PT</dd></div><div><dt>Action</dt><dd>${esc(h.label)}</dd></div><div><dt>Remark</dt><dd>${esc(h.note||'—')}</dd></div></dl>`:'';
  const node=(index,title,name,state,badge,event,controls='')=>`<li class="oa-${state}" data-access-node="${index}" ${state==='current'?'aria-current="step"':''}><span class="oa-dot">${state==='complete'?'✓':state==='rejected'?'×':index}</span><span class="oa-badge">${esc(badge)}</span><strong>${esc(title)}</strong><small>${esc(name)}</small>${audit(event)}${controls}</li>`;
  const reviewControls=r?.canReview?'<div class="request-review-controls"><label>Review remarks<textarea data-access-note maxlength="2000"></textarea></label><div class="request-review-buttons"><button type="button" data-access-action="approve">Approve</button><button type="button" data-access-action="reject">Reject</button></div></div>':'';
  const completionControls=r?.canComplete?'<div class="request-review-controls"><p class="info-note">Confirm completion to close the approved request.</p><button type="button" data-access-complete class="profile-primary">Complete</button></div>':'';
  return `<section class="uniform-progress-panel new-access-progress" aria-label="Request progress"><div class="profile-panel-title"><h2>Request progress</h2>${r?'<button type="button" data-access-refresh class="profile-text-button">Refresh status</button>':''}</div><p class="oa-subtitle">Track the approval flow for this request</p><div class="request-workbench request-node-workbench uniform-progress"><ol class="oa-track">${node(1,'Employee',r?.employee.name||e.name,r?'complete':'current',r?'Submitted':'Not submitted',submitted)}${node(2,'Lake approval',reviewed?.name||'Lake',reviewed?r.status==='rejected'?'rejected':'complete':r?'current':'upcoming',reviewed?r.status==='rejected'?'Rejected':'Approved':r?'Pending approval':'Awaiting submission',reviewed,reviewControls)}${node(3,'Requester completion',r?.employee.name||e.name,completed?'complete':r?.status==='approved'?'current':'upcoming',completed?'Completed':r?.status==='rejected'?'Not required':r?.status==='approved'?'Awaiting completion':'Awaiting approval',completed,completionControls)}</ol></div></section>`;
 }
 function draw(){
  const r=selected,e=data?.employee,scope=r?.fields||e;if(!scope)return;
  const title=r?.title||scope.station+'/'+scope.account+' Request New Access';
  const field=(name,text,value,type='text',locked=false)=>`<label>${text}<input name="${name}" type="${type}" value="${esc(value||'')}" ${locked?'readonly':''} ${name==='eid'?'inputmode="numeric" pattern="[0-9]{1,12}" maxlength="12"':name==='email'?'maxlength="254"':'maxlength="100"'} required></label>`;
  host.innerHTML=`<div class="profile-panel-title"><h2>${esc(title)}</h2></div><p data-access-status role="status" aria-live="polite"></p>${r?`<p><strong>${esc(label(r))}</strong></p>`:'<p class="info-note">Submit to Lake for approval. After approval, return here and select Complete to finish the request.</p>'}<form data-access-form><div class="new-access-fields">${field('name','Employee name',r?.fields.name,'text',!!r)}<label>Position<select name="position" required ${r?'disabled':''}><option value="">Select a title</option>${requestedTitles.map(title=>`<option value="${esc(title)}" ${(r?.fields.position||'Agent')===title&&r?'selected':''}>${esc(title)}</option>`).join('')}</select></label>${r?.fields.eid?field('eid','EID',r.fields.eid,'text',true):''}${field('station','Station',scope.station,'text',true)}${field('account','Account',scope.account,'text',true)}${field('email','HALLMARK EMAIL or preferred username',r?.fields.email,'text',!!r)}</div>${!r&&data.canCreate?'<button type="submit" class="profile-primary">Submit request</button>':''}</form>${progress(r,e)}`;
  async function perform(work){if(busy)return;busy=true;const buttons=[...host.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{selected=await work();draw();window.dispatchEvent(new Event('request-changed'));}catch(error){host.querySelector('[data-access-status]').textContent=error.message;}finally{busy=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}}
  host.querySelector('[data-access-form]').onsubmit=event=>{event.preventDefault();if(selected||!data.canCreate)return;const fields=Object.fromEntries(new FormData(event.currentTarget));perform(()=>api('',{requestId,fields}));};
  host.querySelectorAll('[data-access-action]').forEach(b=>b.onclick=()=>{const note=host.querySelector('[data-access-note]').value.trim();if(b.dataset.accessAction==='reject'&&!note){host.querySelector('[data-access-status]').textContent='Enter a rejection reason.';return;}perform(()=>api('/'+r.id+'/decision',{revision:r.revision,action:b.dataset.accessAction,note}));});
  const complete=host.querySelector('[data-access-complete]');if(complete)complete.onclick=()=>perform(()=>api('/'+r.id+'/complete',{revision:r.revision}));
  const refresh=host.querySelector('[data-access-refresh]');if(refresh)refresh.onclick=()=>perform(()=>api('/'+r.id));
 }
 picker.addEventListener('change',()=>{host.hidden=picker.value!=='new-access';if(!host.hidden&&data?.canCreate){selected=null;requestId=crypto.randomUUID();draw();}});
 window.addEventListener('start-new-request',()=>{selected=null;requestId=crypto.randomUUID();host.hidden=!accessOnly;if(accessOnly&&data?.canCreate){picker.value='new-access';draw();}});
 window.addEventListener('open-report-request',async event=>{
  if(event.detail.kind!=='new-access')return;host.hidden=false;
  try{selected=await api('/'+event.detail.id);draw();host.scrollIntoView({block:'start'});}catch(error){host.textContent=error.message;}
 });
 if(accessOnly){host.hidden=false;host.innerHTML='<p class="info-note">Sign in to request new access.</p>';new MutationObserver(()=>{const other=[...picker.options].filter(option=>option.value!=='new-access');if(other.length)other.forEach(option=>option.remove());}).observe(picker,{childList:true});}
 firebase.auth().onAuthStateChanged(async user=>{
  const version=++generation;selected=null;data=null;host.hidden=true;host.replaceChildren();updateType();if(!user)return;
  try{const loaded=await api();if(version!==generation)return;data=loaded;updateType();}catch(error){if(version===generation){host.hidden=false;host.textContent=error.message;}}
 });
})();
