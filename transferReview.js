const routes=require('./uniformRoute');
function transferReview(r,reviewer,target,note,at){
 const fail=message=>{throw Object.assign(Error(message),{status:400});};
 if(!target||!target.name)fail('Choose an eligible employee to transfer this request to.');
 if(target.id===reviewer.id||target.id===r.employee.id||r.approvals.some(a=>a.employeeId===target.id))fail('Choose someone other than the requester or a completed reviewer.');
 const nodes=routes.nodes(r),existing=nodes.findIndex((n,i)=>i>r.step&&(n.employeeId===target.id||!n.employeeId&&require('./public/public/employee-positions').same(n.position,target.position)));
 const next=existing>=0?nodes.splice(existing,1)[0]:{id:require('node:crypto').randomUUID(),required:false};
 Object.assign(next,{position:target.position,employeeId:target.id,selectionRequired:false});nodes.splice(r.step+1,0,next);if(nodes.length>require('./public/public/employee-positions').maxWorkflowStages)fail('The approval flow already has the maximum number of nodes.');Object.assign(r,routes.fields(nodes));
 require('./workflowEvents').append(r,{at,employeeId:reviewer.id,name:reviewer.name,position:reviewer.position,action:'transfer',note,targetId:target.id,targetName:target.name});
 r.approvals.push({employeeId:reviewer.id,name:reviewer.name,position:reviewer.position,action:'transfer',note,at,targetId:target.id,targetName:target.name});
 r.history=[...(r.history||[]),{at,employeeId:reviewer.id,name:reviewer.name,action:'Transferred',note,targetId:target.id,targetName:target.name}];
 delete r.returnedTo;r.step++;r.revision++;r.updatedAt=at;return r;
}
module.exports={transferReview};
