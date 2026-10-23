const routes=require('./uniformRoute');
const positions=require('./public/public/employee-positions');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function reportRoutes({employees,stages,now,put,view,employee,get,db,eligible}){
 const template=()=>stages.map((position,i)=>({id:'report-default-'+i,position,employeeId:null,required:false}));
 const nodes=r=>routes.nodes(r);
 const directory=()=>employees.get().employees.filter(e=>e.name&&eligible(e.position));
 const route=r=>nodes(r).map(n=>({...n,reviewers:directory().filter(e=>n.employeeId?e.id===n.employeeId:positions.same(e.position,n.position)).map(({id,name,position})=>({id,name,position}))}));
 const review=(r,e)=>r.status==='pending'&&r.employee.id!==e.id&&(r.assignees?.[r.step]?r.assignees[r.step]===e.id:positions.same(e.position,r.stages[r.step]))&&!r.approvals.some(a=>a.employeeId===e.id);
 const validate=(input,base,completed=0,approvals=[])=>routes.validate(input,{base,completed,approvals,employees:{get:()=>({employees:directory()})}});
 return {template,route,review,directory,fields:routes.fields,
  chosen:(body,old)=>routes.fields(validate(body.route|| (old?nodes(old):template()),old?nodes(old):template())),
  update:db.transaction((user,id,body)=>{const e=employee(user),r=get(id);if(r.employee.id!==e.id)fail('Only the requester can adjust approval nodes.',403);if(r.status!=='pending')fail('Only unfinished reports can be adjusted.',409);if(body.revision!==r.revision)fail('Report changed. Refresh before adjusting nodes.',409);const before=nodes(r),after=validate(body.route,before,r.step,r.approvals),at=now().toISOString();r.routeHistory=[...(r.routeHistory||[]),{at,name:e.name,employeeId:e.id,before,after}];r.history.push({at,name:e.name,action:'Approval nodes adjusted',note:after.map(n=>n.position+(n.employeeId?' / '+directory().find(e=>e.id===n.employeeId)?.name:'')).join(' → ')});Object.assign(r,routes.fields(after));r.revision++;r.updatedAt=at;return view(put(r),e);})
 };
}
module.exports=reportRoutes;
