const crypto=require('node:crypto');
const positions=require('./public/public/employee-positions');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function nodes(record){return record.stages.map((position,i)=>({id:record.nodeIds?.[i]||'legacy-'+i,position,employeeId:record.assignees?.[i]||null,required:record.requiredNodeIds?record.requiredNodeIds.includes(record.nodeIds[i]):true}));}
function template(workflow){return workflow.stages.map((position,i)=>({id:'template-'+workflow.revision+'-'+i,position,employeeId:null,required:true}));}
function validate(input,{base,completed=0,employees,approvals=[]}){
 if(!Array.isArray(input)||!input.length||input.length>positions.maxWorkflowStages)fail('Choose 1–20 approval nodes.');
 const ids=new Set(),assigned=new Set(),required=base.filter(n=>n.required),rows=employees.get().employees;
 const result=input.map(n=>{const id=String(n.id||crypto.randomUUID()),position=n.position,employeeId=n.employeeId||null;
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id)||!positions.valid(position))fail('Check approval node references and positions.');ids.add(id);
  if(employeeId&&(!rows.some(e=>e.id===employeeId&&e.name)||assigned.has(employeeId)))fail('Choose existing, distinct employees for approval nodes.');
  if(employeeId)assigned.add(employeeId);
  return {id,position,employeeId,required:required.some(b=>b.id===id)};
 });
 let last=-1;
 for(const n of required){const index=result.findIndex(row=>row.id===n.id);if(index<=last||result[index]?.position!==n.position)fail('Keep the default approval nodes and their order. You may add nodes and change their people.');last=index;}
 for(let i=0;i<completed;i++)if(JSON.stringify(result[i])!==JSON.stringify(base[i]))fail('Completed approval nodes cannot be changed.');
 for(let i=completed;i<result.length;i++)if(result[i].employeeId&&approvals.some(a=>a.employeeId===result[i].employeeId))fail('An employee who already approved cannot approve another node.');
 if(result.length<=completed)fail('Keep at least one unfinished approval node.');
 return result;
}
function fields(route){return {stages:route.map(n=>n.position),nodeIds:route.map(n=>n.id),assignees:route.map(n=>n.employeeId),requiredNodeIds:route.filter(n=>n.required).map(n=>n.id)};}
module.exports={nodes,template,validate,fields};
