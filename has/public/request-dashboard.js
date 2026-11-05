(()=>{
 const content=document.querySelector('#uniform-content'),picker=document.querySelector('.request-type-picker'),legacy=document.querySelector('#uniform-requests').closest('section');
 const tabs=document.createElement('nav');tabs.className='request-dashboard-tabs request-inbox-tabs';tabs.setAttribute('aria-label','Requests');
 tabs.innerHTML=[['new','New request','＋'],['pending','Pending approvals','!'],['mine','My requests','▤'],['approved','My approvals','✓']].map(([key,label,icon])=>`<button type="button" data-request-tab="${key}" aria-pressed="${key==='new'}"><span class="request-tab-icon"><img src="${document.body.classList.contains('workspace-glass')?'/assets/home-icon-'+({new:'request-v3',pending:'calendar-v2',mine:'report-v2',approved:'sign-v2'}[key])+'.webp':'/assets/request/'+key+'-glossy-v1.webp'}" alt="" width="64" height="64"></span><strong>${label}</strong>${['pending','mine'].includes(key)?'<span class="request-alert request-card-alert" hidden aria-label="Requests awaiting your review">!</span>':''}<small data-count="${key}">${key==='new'?'Request New Access':'Loading…'}</small></button>`).join('');
 content.before(tabs);document.querySelector('.my-approvals-entry')?.remove();
 const panel=document.createElement('section');panel.className='profile-panel personal-panel request-dashboard-list';panel.hidden=true;content.before(panel);
 let active='new',data=window.RequestInbox?.data,openedLink=false;
 function clearDetail(){legacy.hidden=true;content.querySelectorAll('.incident-report,.expense-report,.terrific-report,.new-access-report').forEach(h=>h.hidden=true);document.querySelector('#uniform-new-request').hidden=true;}
 function choose(key){active=key;clearDetail();tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.requestTab===key)));picker.hidden=key!=='new'||document.body.hasAttribute('data-access-only');content.hidden=key!=='new';panel.hidden=key==='new';if(key==='new'){document.querySelector('#request-type').value='';window.dispatchEvent(new Event('start-new-request'));}draw();}
 function openRecord(kind,r){clearDetail();content.hidden=false;picker.hidden=true;if(kind==='uniform'){legacy.hidden=false;window.dispatchEvent(new CustomEvent('open-uniform-request',{detail:r.id}));}else window.dispatchEvent(new CustomEvent('open-report-request',{detail:{kind,id:r.id}}));}
 function draw(){
  if(!data)return;
  const employeeId=data.profileId,rows=data.rows;
  const sets={pending:rows.filter(({r})=>r.canReview),mine:rows.filter(({r})=>r.employee?.id===employeeId),approved:rows.filter(({r})=>(r.approvals||[]).some(a=>a.employeeId===employeeId&&a.action==='approve')||(r.history||[]).some(h=>h.approvals?.some(a=>a.employeeId===employeeId&&a.action==='approve')))};
  for(const key of ['pending','mine','approved'])tabs.querySelector(`[data-count="${key}"]`).textContent=sets[key].length+(key==='pending'?' awaiting review':' requests');
  for(const key of ['pending','mine']){const count=key==='pending'?sets.pending.length:sets.mine.filter(({r})=>r.needsRevision||r.canComplete).length,alert=tabs.querySelector('[data-request-tab='+key+'] .request-card-alert');alert.hidden=!count;alert.setAttribute('aria-label',count+(key==='pending'?' requests awaiting your review':' requests requiring your action'));}
  if(active==='new')return;panel.replaceChildren();const heading=document.createElement('div');heading.className='profile-panel-title';const h=document.createElement('h2');h.textContent={pending:'Pending approvals',mine:'My requests',approved:'My approvals'}[active];const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';refresh.onclick=()=>window.RequestInbox.load().catch(()=>{});heading.append(h,refresh);panel.append(heading);
  const errors=data.groups.filter(g=>g.error);if(errors.length){const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='Unable to load: '+errors.map(g=>g.name).join(', ')+'. Use Refresh to retry.';panel.append(p);}
  panel.classList.add('request-mailbox');
  const search=document.createElement('input');search.type='search';search.className='request-mailbox-search';search.placeholder='Search requests';search.setAttribute('aria-label','Search requests');panel.append(search);
  const list=document.createElement('div');list.className='request-mailbox-messages';panel.append(list);
  const subjects={'new-access':'Request New Access',uniform:'Uniform replacement',incident:'Incident Investigation',expense:'Expense report',terrific:'Terrific Ten'};
  const ordered=[...sets[active]].sort((a,b)=>String(b.r.updatedAt||b.r.submittedAt||'').localeCompare(String(a.r.updatedAt||a.r.submittedAt||'')));
  for(const {kind,r} of ordered){
   const row=document.createElement('article');row.className='request-summary-item request-message';
   const header=document.createElement('header');header.className='request-message-header';
   const person=document.createElement('div');person.innerHTML=RequestVisuals.person(r.employee);header.append(person);
   const at=r.updatedAt||r.submittedAt||r.createdAt;
   if(at&&!Number.isNaN(Date.parse(at))){const date=document.createElement('time');date.dateTime=at;date.textContent=new Date(at).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT';header.append(date);}
   const badge=document.createElement('span');badge.className='request-message-state';badge.dataset.state=r.needsRevision?'revision':r.status;
   badge.textContent=r.needsRevision?'Needs revision':r.canComplete?'Complete request':({pending:'Pending',approved:'Approved',completed:'Completed',rejected:'Rejected',draft:'Draft'}[r.status]||r.status);header.append(badge);
   const button=document.createElement('button');button.type='button';button.className='request-summary-row request-message-open';
   const copy=document.createElement('span'),title=document.createElement('strong'),preview=document.createElement('small');title.textContent=subjects[kind]||'Request';
   const scope=[r.employee?.station,r.employee?.account].filter(Boolean).join(' / '),detail=r.fields?.name||r.fields?.summary||r.reason||r.reference||'';
   preview.textContent=[scope,detail].filter(Boolean).join(' · ');copy.append(title,preview);button.append(copy);
   const arrow=document.createElement('span');arrow.className='request-message-arrow';arrow.textContent='→';arrow.setAttribute('aria-hidden','true');button.append(arrow);button.setAttribute('aria-label','Open '+title.textContent+' from '+(r.employee?.nickname||r.employee?.name||'employee'));button.onclick=()=>openRecord(kind,r);
   row.append(header,button);list.append(row);
  }
  search.oninput=()=>{const query=search.value.trim().toLowerCase();for(const row of list.children)row.hidden=!row.textContent.toLowerCase().includes(query);};
  if(!sets[active].length&&!errors.length){const p=document.createElement('p');p.textContent={pending:'No requests awaiting your review.',mine:'No requests yet.',approved:'No requests approved by you yet.'}[active];panel.append(p);}
 }
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>choose(b.dataset.requestTab));if(new URLSearchParams(location.search).get('view')==='mine')choose('mine');
 window.addEventListener('request-inbox-updated',async event=>{data=event.detail;if(!data){panel.replaceChildren();return;}try{const profile=await window.requestProfileReady;data.profileId=profile.id;}catch{}draw();const requested=new URLSearchParams(location.search).get('request');if(requested&&!openedLink){const match=data.rows.find(({r})=>r.id===requested);if(match){openedLink=true;choose(match.r.canReview?'pending':match.r.employee.id===data.profileId?'mine':'approved');openRecord(match.kind,match.r);}}});
 legacy.querySelector('.profile-panel-title').hidden=true;legacy.hidden=true;if(data)window.requestProfileReady.then(p=>{data.profileId=p.id;draw();});
})();
