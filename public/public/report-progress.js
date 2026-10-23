(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.bindReportNodes=(host,r,data,{api,onSaved})=>{
  const target=host.querySelector('.request-node-workbench');if(!target||!r||!data.reviewerDirectory)return;
  const route=r.approvalRoute?.length?r.approvalRoute:data.approvalRoute;
  target.replaceWith(RequestWorkflow.render({record:{...r,employee:r.employee||data.employee,stages:route.map(n=>n.position),approvalRoute:route,step:r.step||0},directory:data.reviewerDirectory,defaultRoute:data.approvalRoute,showForm:false,stateKey:r.id,
   onDraftChange:route=>{r.approvalRoute=route;window.bindReportNodes(host,r,data,{api,onSaved});},
   onSave:async(route,revision)=>{await api('/'+r.id+'/route',{route,revision});await onSaved();}
  }));
 };
 window.reportProgress=(r,data)=>{
  const draft=r.status==='draft',stages=(r.stages||data.stages||[]).map(position=>window.employeePositions?.normalize?employeePositions.normalize(position):position),approvals=r.approvals||[];
  const people=i=>approvals[i]?.name||(data.approvalRoute?.[i]?.reviewers||[]).map(p=>p.name).join(' / ')||'No eligible approver configured';
  const step=(position,name,i)=>{const approval=approvals[i],employee=i===-1,current=employee?draft:!draft&&r.status==='pending'&&r.step===i,done=employee?!draft:!!approval,state=approval?.action==='reject'?'rejected':done?'complete':current?'current':'upcoming',label=employee?draft?'Not submitted':'Submitted':approval?approval.action==='approve'?'Approved':'Rejected':current?'Pending approval':'';return `<li class="oa-${state}" ${current?'aria-current="step"':''}><span class="oa-dot">${state==='complete'?'✓':state==='rejected'?'×':employee?'1':i+2}</span><strong>${esc(position)}</strong><small>${esc(name)}</small>${label?`<span class="oa-badge">${esc(label)}</span>`:''}${approval?`<dl class="oa-node-audit"><div><dt>Operator</dt><dd>${esc(approval.name)}</dd></div><div><dt>Processed at</dt><dd>${esc(new Date(approval.at).toLocaleString('en-US',{timeZone:'America/Los_Angeles'}))} PT</dd></div><div><dt>Remark</dt><dd>${esc(approval.note||'—')}</dd></div></dl>`:''}</li>`;};
  const title=draft?'Complete and submit your request':r.status==='pending'?stages[r.step]+' review':r.status==='approved'?'Request approved':'Request rejected';
  const description=draft?'Complete the form above and confirm the approval nodes.':r.status==='pending'?'Waiting for '+people(r.step)+' to review this request.':r.status==='approved'?'All approval nodes are complete.':approvals.find(a=>a.action==='reject')?.note||'Please check the review remarks.';
  return `<section class="uniform-progress-panel"><div class="profile-panel-title"><h2>Request progress</h2><button type="button" data-progress-refresh class="profile-text-button">↻ Refresh status</button></div><p class="oa-subtitle">Track the approval flow for this request</p><div class="request-workbench request-node-workbench uniform-progress"><ol class="oa-track">${step('Employee',r.employee?.name||data.employee.name,-1)}${stages.map((position,i)=>step(position,people(i),i)).join('')}</ol><div class="oa-current-card"><span class="oa-current-icon" aria-hidden="true">▤</span><div class="oa-current-copy"><span class="oa-current-label">${r.status==='pending'||draft?'CURRENT STEP':'REQUEST STATUS'}</span><h3>${esc(title)}</h3><p>${esc(description)}</p></div></div></div></section>`;
 };
})();
