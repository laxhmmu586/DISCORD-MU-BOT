const path=require('node:path'),fs=require('node:fs/promises');
const groups=require('../public/employee-account-groups'),positions=require('../public/employee-positions');
const allowed=employee=>Boolean(employee&&(employee.isServerOwner||require('./serverOwners').isOwner(employee.loginId)||!groups.isHeadquarter(employee)&&['Agent','Lead','Supervisor','Senior Supervisor','Duty Manager','Business Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'].includes(positions.normalize(employee.position))));
const items=[
 {id:'bomb-threat',title:'Bomb Threat Checklist',version:'v3.0',file:'bomb-threat-checklist.pdf',format:'pdf'},
 {id:'emergency-notification',title:'Emergency Procedure Notification',version:'v 012025',file:'emergency-procedure-notification.docx',format:'pdf'},
 {id:'incident-occurrence',title:'Incident / Occurrence Report Package',version:'v 012025',file:'incident-occurrence-report-package.pdf',format:'pdf'},
 {id:'concentra',title:'Concentra Authorization Form',version:'',file:'concentra-authorization-form.pdf',format:'pdf',category:'Workers Comp'},
 {id:'lax-reliant',title:'LAX Reliant Authorization for Treatment',version:'',file:'lax-reliant-authorization-for-treatment.pdf',format:'pdf',category:'Workers Comp'},
 {id:'ca-mpn',title:'CA MPN Acknowledgement Form',version:'9.1.13',file:'ca-mpn-acknowledgement-form.pdf',format:'pdf',category:'Workers Comp'}
];
function register(app,{context,handler,supervisor,database,read,key,employees}){
 supervisor=employee=>require('../public/employee-permissions').allowed(employee,'checklist.supervisor');
 const auth=req=>{const ctx=context(req.reportUser);if(!allowed(ctx.employee))throw Object.assign(Error('Checklist requires Agent or above in your Main Account.'),{status:403});return ctx;};
 const visible=(ctx,item)=>['bomb-threat','emergency-notification'].includes(item.id)||supervisor(ctx.employee);
 app.get('/has-report-api/checklist',handler(async(req,res)=>{const ctx=auth(req);res.json({scope:ctx.scope,categories:['SAFETY','Workers Comp'].map(name=>({name,items:items.filter(item=>(item.category||'SAFETY')===name&&visible(ctx,item)).map(({file,...item})=>({...item,canEdit:item.id==='emergency-notification'&&supervisor(ctx.employee)}))})).filter(category=>category.items.length)});}));
 require('./hasEmergencyChecklist').register(app,{context,handler,supervisor,allowed,database,read,key,employees});
 app.get('/has-report-api/checklist/:id/:action',handler(async(req,res)=>{
  const ctx=auth(req),item=items.find(i=>i.id===req.params.id),preview=req.params.action==='preview';
  if(!item||!['preview','export'].includes(req.params.action))throw Object.assign(Error('Checklist not found.'),{status:404});
  if(!visible(ctx,item))throw Object.assign(Error('This checklist requires Supervisor or above.'),{status:403});
  if(item.id==='emergency-notification')throw Object.assign(Error('Open the emergency procedure to view its current content.'),{status:404});
  const file=item.file;
  const buffer=await fs.readFile(path.join(require('node:path').resolve(__dirname,'../..'),'has/resources/has-checklists',file));
  const latest=auth(req);if(!visible(latest,item)||JSON.stringify(latest.scope)!==JSON.stringify(ctx.scope))throw Object.assign(Error('Your Main Account access changed. Reload the page.'),{status:403});
  res.type('application/pdf');
  res.set('Content-Disposition',(preview?'inline':'attachment')+'; filename="'+(preview?item.id+'.pdf':item.file)+'"');res.send(buffer);
 }));
}
module.exports={items,allowed,register};
