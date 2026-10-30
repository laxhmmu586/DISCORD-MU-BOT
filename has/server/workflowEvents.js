const labels={submit:'Submitted',approve:'Approved',reject:'Rejected',return:'Returned for revision',transfer:'Transferred',revision:'Revision saved'};
function events(record){
 if(Array.isArray(record.timeline))return structuredClone(record.timeline);
 const rows=[],seen=new Set();
 const add=e=>{if(!e.at)return;const key=[e.at,e.action,e.employeeId,e.name,e.note].join('|');if(!seen.has(key)){seen.add(key);rows.push(e);}};
 const submit=at=>add({at,action:'submit',employeeId:record.employee.id,name:record.employee.name,position:'Employee',note:''});
 for(const h of record.history||[]){
  if(h.submittedAt)submit(h.submittedAt);
  for(const a of h.approvals||[])add({...a});
  if(h.action==='Submitted')submit(h.at);
  if(h.action==='Returned for revision')add({...h,action:'return',position:h.position||'Reviewer',targetId:h.returnedTo});
  if(h.action==='Revision saved')add({...h,action:'revision',position:h.position||'Reviewer'});
 }
 if(record.submittedAt)submit(record.submittedAt);
 for(const a of record.approvals||[])add({...a});
 return rows.sort((a,b)=>String(a.at).localeCompare(String(b.at))).map(e=>({...e,label:labels[e.action]||e.action}));
}
function append(record,event){record.timeline=events(record);record.timeline.push({...event,label:labels[event.action]||event.action});}
module.exports={events,append};
