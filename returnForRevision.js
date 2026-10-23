// Approval arrays describe the active path; history retains superseded decisions.
function returnForRevision(r, reviewer, note, at) {
 if (!note) throw Object.assign(Error('Enter a reason for returning this request.'), {status:400});
 const previous=r.step>0?r.approvals[r.step-1]:null;
 if(r.step>0&&!previous)throw Object.assign(Error('Previous approver is unavailable. Refresh this request.'),{status:409});
 require('./workflowEvents').append(r,{at,employeeId:reviewer.id,name:reviewer.name,position:reviewer.position,action:'return',note,targetId:previous?.employeeId||r.employee.id,targetName:previous?.name||r.employee.name});
 r.history=[...(r.history||[]),{at,employeeId:reviewer.id,name:reviewer.name,action:'Returned for revision',note,position:reviewer.position,submittedAt:r.submittedAt,fromStep:r.step,toStep:r.step-1,approvals:structuredClone(r.approvals),returnedTo:previous?.employeeId||r.employee.id}];
 r.returnedTo=previous?.employeeId||r.employee.id;
 if(previous){
  r.step--;r.approvals=r.approvals.slice(0,r.step);
  r.assignees=[...(r.assignees||r.stages.map(()=>null))];r.assignees[r.step]=previous.employeeId;
 }else{r.status='draft';r.step=0;r.approvals=[];}
 r.revision++;r.updatedAt=at;
 delete r.approvedAt;delete r.manager;
 return r;
}
module.exports={returnForRevision};
