// Shared owner actions retain a tombstone so stale submissions cannot recreate deleted requests.
function requestLifecycle({db,employee,get,put,view,now}){
 const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
 return db.transaction((user,id,body)=>{
  const e=employee(user),r=get(id);
  if(r.employee.id!==e.id)fail('Only the requester can withdraw or delete this request.',403);
  if(body.revision!==r.revision)fail('Request changed. Refresh before continuing.',409);
  if(!['withdraw','delete'].includes(body.action))fail('Choose withdraw or delete.',400);
  if(body.action==='withdraw'&&r.status==='draft')fail('Request is already a draft.',409);
  const at=now().toISOString();
  r.history=[...(r.history||[]),{at,name:e.name,employeeId:e.id,action:body.action==='withdraw'?'Withdrawn to draft':'Deleted',previousStatus:r.status,approvals:r.approvals||[],submittedAt:r.submittedAt}];
  r.status=body.action==='delete'?'deleted':'draft';r.step=0;r.approvals=[];r.revision++;r.updatedAt=at;
  delete r.submittedAt;delete r.approvedAt;delete r.manager;
  put(r);
  return body.action==='delete'?{id:r.id,deleted:true}:view(r,e);
 });
}
module.exports={requestLifecycle};
