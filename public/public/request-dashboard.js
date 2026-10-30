(()=>{
 const content=document.querySelector('#uniform-content'),picker=document.querySelector('.request-type-picker'),legacy=document.querySelector('#uniform-requests').closest('section');
 const tabs=document.createElement('nav');tabs.className='request-dashboard-tabs';tabs.setAttribute('aria-label','Requests');
 tabs.innerHTML=[['new','New request','＋'],['pending','Pending approvals','!'],['mine','My requests','▤'],['approved','My approvals','✓']].map(([key,label,icon])=>`<button type="button" data-request-tab="${key}" aria-pressed="${key==='new'}"><span class="request-tab-icon"><img src="${document.body.classList.contains('workspace-glass')?'/assets/home-icon-'+({new:'request-v3',pending:'calendar-v2',mine:'report-v2',approved:'sign-v2'}[key])+'.webp':'/assets/request/'+key+'-glossy-v1.webp'}" alt="" width="64" height="64"></span><strong>${label}</strong>${['pending','mine'].includes(key)?'<span class="request-alert request-card-alert" hidden aria-label="Requests awaiting your review">!</span>':''}<small data-count="${key}">${key==='new'?'Create a form':'Loading…'}</small></button>`).join('');
 content.before(tabs);document.querySelector('.my-approvals-entry')?.remove();
 const panel=document.createElement('section');panel.className='profile-panel personal-panel request-dashboard-list';panel.hidden=true;content.before(panel);
 let active='new',data=window.RequestInbox?.data,openedLink=false;
 function clearDetail(){legacy.hidden=true;content.querySelectorAll('.incident-report,.expense-report,.terrific-report,.new-access-report').forEach(h=>h.hidden=true);document.querySelector('#uniform-new-request').hidden=true;}
 function choose(key){active=key;clearDetail();tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.requestTab===key)));picker.hidden=key!=='new';content.hidden=key!=='new';panel.hidden=key==='new';if(key==='new'){document.querySelector('#request-type').value='';window.dispatchEvent(new Event('start-new-request'));}draw();}
 function openRecord(kind,r){clearDetail();content.hidden=false;picker.hidden=true;if(kind==='uniform'){legacy.hidden=false;window.dispatchEvent(new CustomEvent('open-uniform-request',{detail:r.id}));}else window.dispatchEvent(new CustomEvent('open-report-request',{detail:{kind,id:r.id}}));}
 function draw(){
  if(!data)return;
  const employeeId=data.profileId,rows=data.rows;
  const sets={pending:rows.filter(({r})=>r.canReview),mine:rows.filter(({r})=>r.employee?.id===employeeId),approved:rows.filter(({r})=>(r.approvals||[]).some(a=>a.employeeId===employeeId&&a.action==='approve')||(r.history||[]).some(h=>h.approvals?.some(a=>a.employeeId===employeeId&&a.action==='approve')))};
  for(const key of ['pending','mine','approved'])tabs.querySelector(`[data-count="${key}"]`).textContent=sets[key].length+(key==='pending'?' awaiting review':' requests');
  for(const key of ['pending','mine']){const count=key==='pending'?sets.pending.length:sets.mine.filter(({r})=>r.needsRevision||r.canComplete).length,alert=tabs.querySelector('[data-request-tab='+key+'] .request-card-alert');alert.hidden=!count;alert.setAttribute('aria-label',count+(key==='pending'?' requests awaiting your review':' requests requiring your action'));}
  if(active==='new')return;panel.replaceChildren();const heading=document.createElement('div');heading.className='profile-panel-title';const h=document.createElement('h2');h.textContent={pending:'Pending approvals',mine:'My requests',approved:'My approvals'}[active];const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';refresh.onclick=()=>window.RequestInbox.load().catch(()=>{});heading.append(h,refresh);panel.append(heading);
  const errors=data.groups.filter(g=>g.error);if(errors.length){const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='Unable to load: '+errors.map(g=>g.name).join(', ')+'. Use Refresh to retry.';panel.append(p);}
  for(const {kind,r} of sets[active]){
   const row=document.createElement('div');row.className='request-summary-item';
   const action=document.createElement('div');action.className='request-action-box';action.dataset.state=r.needsRevision?'revision':r.status;
   const actionLabel=document.createElement('span');actionLabel.className='request-action-label';actionLabel.textContent='Action';
   const value=document.createElement('span');value.className='request-action-value';
   if(r.status==='pending'&&!r.needsRevision){value.classList.add('request-case-status');const ring=document.createElement('span');ring.className='request-status-ring';ring.setAttribute('aria-hidden','true');value.append(ring);}
   value.append(document.createTextNode(r.needsRevision?'Returned for revision':({pending:'In Progress',approved:kind==='new-access'?'Awaiting requester completion':'Approved',completed:'Completed',rejected:'Rejected',draft:'Draft'}[r.status]||r.status)));
   action.append(actionLabel,value);
   const button=document.createElement('button');button.type='button';button.className='request-summary-row';
   const title=document.createElement('strong');title.textContent=RequestInbox.title(kind,r);button.append(title);button.onclick=()=>openRecord(kind,r);
   row.append(action,button);panel.append(row);
  }
  if(!sets[active].length&&!errors.length){const p=document.createElement('p');p.textContent={pending:'No requests awaiting your review.',mine:'No requests yet.',approved:'No requests approved by you yet.'}[active];panel.append(p);}
 }
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>choose(b.dataset.requestTab));if(new URLSearchParams(location.search).get('view')==='mine')choose('mine');
 window.addEventListener('request-inbox-updated',async event=>{data=event.detail;try{const profile=await window.requestProfileReady;data.profileId=profile.id;}catch{}draw();const requested=new URLSearchParams(location.search).get('request');if(requested&&!openedLink){const match=data.rows.find(({r})=>r.id===requested);if(match){openedLink=true;choose(match.r.canReview?'pending':match.r.employee.id===data.profileId?'mine':'approved');openRecord(match.kind,match.r);}}});
 legacy.querySelector('.profile-panel-title').hidden=true;legacy.hidden=true;if(data)window.requestProfileReady.then(p=>{data.profileId=p.id;draw();});
})();
