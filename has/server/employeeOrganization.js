const model=require('../public/organization-model');
const positions=require('../public/employee-positions');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function registerOrganization(app,{store,accessFor,scopedView,onChange}){
  const db=store.db;
  db.exec('CREATE TABLE IF NOT EXISTS employee_reporting(employee_id TEXT PRIMARY KEY,manager_id TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS employee_organization_nodes(employee_id TEXT PRIMARY KEY,created INTEGER NOT NULL DEFAULT 0,inserted INTEGER NOT NULL DEFAULT 0,unassigned INTEGER NOT NULL DEFAULT 0)');
  const rows=()=>{const edges=new Map(db.prepare('SELECT employee_id,manager_id FROM employee_reporting').all().map(e=>[e.employee_id,e.manager_id])),flags=new Map(db.prepare('SELECT * FROM employee_organization_nodes').all().map(row=>[row.employee_id,row]));const all=store.get().employees.map(row=>({...row,reportsTo:edges.get(row.id)||'',isInserted:!!flags.get(row.id)?.inserted,createdForOrganization:!!flags.get(row.id)?.created,unassigned:!!flags.get(row.id)?.unassigned,isServerOwner:require('./serverOwners').isOwner(row.loginId),isAdministrator:require('./employees').ADMIN_EMAILS.has(String(row.loginId||'').toLowerCase())}));for(const row of all){const manager=all.find(r=>r.id===row.reportsTo);if(positions.normalize(row.position)==='Agent'&&manager?.position==='Supervisor'&&row.station===manager.station&&row.account===manager.account)row.reportsTo=model.supervisorGroup(row);if(positions.normalize(row.position)==='Agent'&&!row.reportsTo&&!row.unassigned&&all.some(manager=>manager.id!==row.id&&!manager.unassigned&&positions.normalize(manager.position)==='Supervisor'&&manager.station===row.station&&manager.account===row.account))row.reportsTo=model.supervisorGroup(row);}return model.applyDefaultReporting(all);};
  const view=access=>{
    const data=store.get(),all=rows(),scoped=scopedView({...data,employees:all},access);
    for(const row of [...scoped.employees]){let next=row;const seen=new Set();while(next&&!seen.has(next.id)){seen.add(next.id);const parents=model.reportingManagers(next,all);for(const parent of parents)if(!scoped.employees.some(person=>person.id===parent.id))scoped.employees.push(parent);next=parents.length===1?parents[0]:null;}}
    // Only fields needed by HR are returned; private contacts and sign-in credentials stay out of this view.
    return {revision:data.revision,accounts:scoped.accounts.map(account=>({...account,employeeCount:all.filter(row=>require('../public/employee-account-groups').belongs(row,account)).length})),access,employees:scoped.employees.map(({id,name,nickname,position,station,account,companyEmail,reportsTo,pbbId,pbbExpiry,pbbMscId,pbbMscExpiry,isInserted,createdForOrganization,unassigned,isAdministrator,isServerOwner,permissionOverrides})=>({id,name,nickname,position,station,account,companyEmail,reportsTo,pbbId,pbbExpiry,pbbMscId,pbbMscExpiry,isInserted,createdForOrganization,unassigned,isAdministrator,isServerOwner,permissionOverrides}))};
  };
  app.get('/employee-admin-api/organization',(req,res)=>res.json(view(req.employeeAccess)));
  const save=db.transaction(req=>{
    const current=store.get(),access=accessFor(req.employeeAdmin),all=rows(),body=req.body;
    if(!access)fail('Employee administrator access required.',403);
    if(body.revision!==current.revision)fail('Organization changed. Reload before saving.',409);
    const original=all.find(r=>r.id===body.id);
    if(!original||!model.canEdit(original,access,all))fail('You can only edit people below you in your reporting line.',403);
    const allowed=['name','nickname','position','companyEmail','station','account','reportsTo','pbbId','pbbExpiry','pbbMscId','pbbMscExpiry'];
    if(!body.changes||Object.keys(body.changes).some(key=>!allowed.includes(key)))fail('Invalid employee changes.');
    const next={...original,...body.changes};
    if(!model.titlesFor(original,access,all).includes(positions.normalize(next.position)))fail('Choose a permitted title below the reporting manager and above direct reports.',403);
    if(!String(next.name||'').trim())fail('Enter the employee name.');
    if(access.mode!=='admin'&&(next.station!==original.station||next.account!==original.account))fail('Only an administrator can change main accounts.',403);
    if((next.station!==original.station||next.account!==original.account)&&!current.accounts.some(a=>a.station===next.station&&a.account===next.account))fail('Choose an existing main account.');
    const nextRows=all.map(row=>row.id===next.id?next:row);
    const managerId=model.validateLine(next,String(next.reportsTo||''),nextRows);
    if(access.mode!=='admin'&&(!managerId||!model.managersFor(next,access,all).some(r=>r.id===managerId)))fail('Choose a manager within your reporting team.',403);
    // Reassignment must not move descendants out of their main account without review.
    if((next.station!==original.station||next.account!==original.account)&&model.descendants(next.id,all).size)fail('Reassign direct reports before moving this person to another account.');
    for(const child of all.filter(r=>model.reportingManagers(r,all).some(manager=>manager.id===next.id)))model.validateLine(child,child.reportsTo,nextRows);
    store.save({revision:current.revision,employees:current.employees.map(row=>row.id===next.id?{...row,...Object.fromEntries(allowed.filter(key=>key!=='reportsTo').map(key=>[key,next[key]]))}:row)},req.employeeAdmin);
    if(managerId)db.prepare('INSERT OR REPLACE INTO employee_reporting VALUES(?,?)').run(next.id,managerId);else db.prepare('DELETE FROM employee_reporting WHERE employee_id=?').run(next.id);
    if(Object.hasOwn(body.changes,'reportsTo'))db.prepare('INSERT OR REPLACE INTO employee_organization_nodes VALUES(?,?,?,?)').run(next.id,Number(!!original.createdForOrganization),Number(!!original.isInserted),Number(!managerId));
    return view(accessFor(req.employeeAdmin));
  });
  app.post('/employee-admin-api/organization',(req,res)=>{try{const data=save(req);res.json(data);onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});
  const insert=db.transaction(req=>{
    const current=store.get(),access=accessFor(req.employeeAdmin);if(!access)fail('Employee administrator access required.',403);
    if(req.body.revision!==current.revision)fail('Organization changed. Reload before inserting a level.',409);
    const plan=model.insertionPlan(req.body.targetId,req.body.position,req.body.name,access,rows()),id=require('node:crypto').randomUUID();
    const {reportsTo,...employee}=plan.employee;
    store.save({revision:current.revision,employees:[...current.employees,{...employee,id,attach:false,detach:false,spotter:false}]},req.employeeAdmin);
    const write=db.prepare('INSERT OR REPLACE INTO employee_reporting VALUES(?,?)');write.run(id,reportsTo);for(const target of plan.targets)write.run(target,id);
    db.prepare('INSERT INTO employee_organization_nodes VALUES(?,1,1,0)').run(id);
    return view(accessFor(req.employeeAdmin));
  });
  app.post('/employee-admin-api/organization/insert',(req,res)=>{try{res.json(insert(req));onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});

  const savePermissions=db.transaction(req=>{
    const current=store.get(),access=accessFor(req.employeeAdmin),all=rows(),body=req.body;
    if(!access||!model.canEdit(all.find(row=>row.id===body.id),access,all))fail('You can only set permissions for people below you.',403);
    if(body.revision!==current.revision)fail('Permissions changed. Reload before saving.',409);
    const policy=require('../public/employee-permissions'),values=body.permissions;
    if(!values||Array.isArray(values)||Object.entries(values).some(([key,value])=>!policy.catalog.some(item=>item.key===key)||typeof value!=='boolean'))fail('Choose valid permission settings.');
    const actor=all.find(row=>row.id===access.employeeId),target=all.find(row=>row.id===body.id);
    if(access.mode!=='admin')for(const key of new Set([...Object.keys(values),...Object.keys(target.permissionOverrides||{})])){
      const before=policy.allowed(target,key),after=policy.allowed({...target,permissionOverrides:values},key);
      if(before!==after&&!policy.allowed(actor,key))fail('You cannot change permissions you do not hold yourself.',403);
    }
    db.prepare('INSERT OR REPLACE INTO employee_permission_overrides VALUES(?,?)').run(body.id,JSON.stringify(values));
    store.save({revision:current.revision,employees:current.employees},req.employeeAdmin);
    return view(accessFor(req.employeeAdmin));
  });
  app.post('/employee-admin-api/organization/permissions',(req,res)=>{try{res.json(savePermissions(req));onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});
  for(const action of ['assign','remove']){
    const change=db.transaction(req=>{
      const current=store.get(),access=accessFor(req.employeeAdmin),all=rows();if(!access)fail('Employee administrator access required.',403);
      if(req.body.revision!==current.revision)fail('Organization changed. Reload before changing this position.',409);
      const target=all.find(row=>row.id===req.body.id);
      if(target?.createdForOrganization){const linked=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_accounts'").get();if(target.loginId||linked&&db.prepare('SELECT uid FROM employee_accounts WHERE employee_id=?').get(target.id))fail('This position has a linked account. Ask an administrator to manage it.',409);}
      const plan=action==='assign'?model.assignmentPlan(req.body.id,req.body.employeeId,access,all):model.removalPlan(req.body.id,access,all);
      store.save({revision:current.revision,employees:plan.employees},req.employeeAdmin);
      const edge=db.prepare('INSERT OR REPLACE INTO employee_reporting VALUES(?,?)'),flag=db.prepare('INSERT OR REPLACE INTO employee_organization_nodes VALUES(?,?,?,?)');
      for(const row of plan.employees){if(row.reportsTo)edge.run(row.id,row.reportsTo);else db.prepare('DELETE FROM employee_reporting WHERE employee_id=?').run(row.id);flag.run(row.id,Number(!!row.createdForOrganization),Number(!!row.isInserted),Number(!!row.unassigned));}
      for(const row of all)if(!plan.employees.some(next=>next.id===row.id)){db.prepare('DELETE FROM employee_reporting WHERE employee_id=?').run(row.id);db.prepare('DELETE FROM employee_organization_nodes WHERE employee_id=?').run(row.id);}
      return {...view(accessFor(req.employeeAdmin)),selectedId:plan.selectedId};
    });
    app.post('/employee-admin-api/organization/'+action,(req,res)=>{try{res.json(change(req));onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});
  }
}
module.exports={registerOrganization};
