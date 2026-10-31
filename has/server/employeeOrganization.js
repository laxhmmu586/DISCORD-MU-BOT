const model=require('../public/organization-model');
const positions=require('../public/employee-positions');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function registerOrganization(app,{store,accessFor,scopedView,onChange}){
  const db=store.db;
  db.exec('CREATE TABLE IF NOT EXISTS employee_google_link_audit(id INTEGER PRIMARY KEY,uid TEXT NOT NULL,source_employee_id TEXT NOT NULL,target_employee_id TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL)');
  const googleAccounts=()=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='employee_accounts'").get()?db.prepare("SELECT uid,employee_id FROM employee_accounts WHERE provider='google.com'").all():[];
  db.exec('CREATE TABLE IF NOT EXISTS employee_reporting(employee_id TEXT PRIMARY KEY,manager_id TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS employee_organization_nodes(employee_id TEXT PRIMARY KEY,created INTEGER NOT NULL DEFAULT 0,inserted INTEGER NOT NULL DEFAULT 0,unassigned INTEGER NOT NULL DEFAULT 0)');
  db.exec('CREATE TABLE IF NOT EXISTS employee_membership_reporting(employee_id TEXT NOT NULL,station TEXT NOT NULL,account TEXT NOT NULL,manager_id TEXT NOT NULL,unassigned INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(employee_id,station,account))');
  const rows=()=>{const edges=new Map(db.prepare('SELECT employee_id,manager_id FROM employee_reporting').all().map(e=>[e.employee_id,e.manager_id])),flags=new Map(db.prepare('SELECT * FROM employee_organization_nodes').all().map(row=>[row.employee_id,row]));const memberships=db.prepare('SELECT * FROM employee_membership_reporting').all();const all=store.get().employees.filter(row=>!row.mergedInto).map(row=>({...row,membershipReporting:memberships.filter(value=>value.employee_id===row.id).map(value=>({station:value.station,account:value.account,reportsTo:value.manager_id,unassigned:!!value.unassigned})),reportsTo:edges.get(row.id)||'',isInserted:!!flags.get(row.id)?.inserted,createdForOrganization:!!flags.get(row.id)?.created,unassigned:!!flags.get(row.id)?.unassigned,isServerOwner:require('./serverOwners').isOwner(row.loginId),isAdministrator:require('./employees').ADMIN_EMAILS.has(String(row.loginId||'').toLowerCase())}));for(const row of all){const manager=all.find(r=>r.id===row.reportsTo);if(positions.normalize(row.position)==='Agent'&&manager?.position==='Supervisor'&&row.station===manager.station&&row.account===manager.account)row.reportsTo=model.supervisorGroup(row);if(positions.normalize(row.position)==='Agent'&&!row.reportsTo&&!row.unassigned&&all.some(manager=>manager.id!==row.id&&!manager.unassigned&&positions.normalize(manager.position)==='Supervisor'&&manager.station===row.station&&manager.account===row.account))row.reportsTo=model.supervisorGroup(row);}return model.applyDefaultReporting(all);};
  const view=access=>{
    const avatars=new Map(db.prepare("SELECT 1 FROM sqlite_master WHERE name='employee_avatars'").get()?db.prepare('SELECT employee_id,data FROM employee_avatars').all().map(row=>[row.employee_id,row.data]):[]);
    const data=store.get(),all=rows(),scoped=scopedView({...data,employees:all},access),googleIds=new Set(access.canManagePending?googleAccounts().map(link=>link.employee_id):[]);
    for(const row of [...scoped.employees]){const workspace=access.mode!=='admin'&&(access.scopes||[access]).find(value=>model.membershipIndex(row,value)>=0),context=workspace?model.forWorkspace(all,workspace):all;let next=context.find(value=>value.id===row.id);const seen=new Set();while(next&&!seen.has(next.id)){seen.add(next.id);const parents=model.reportingManagers(next,context);for(const parent of parents)if(!scoped.employees.some(person=>person.id===parent.id))scoped.employees.push(all.find(value=>value.id===parent.id));next=parents.length===1?parents[0]:null;}}
    // Only fields needed by HR are returned; private contacts and sign-in credentials stay out of this view.
    return {revision:data.revision,accounts:scoped.accounts.map(account=>({...account,employeeCount:all.filter(row=>require('../public/employee-account-groups').belongs(row,account)).length})),access,employees:scoped.employees.map(({id,name,nickname,position,station,account,additionalAccounts,membershipReporting,companyEmail,reportsTo,pbbId,pbbExpiry,pbbMscId,pbbMscExpiry,isInserted,createdForOrganization,unassigned,isAdministrator,isServerOwner,permissionOverrides})=>({id,avatar:avatars.get(id)||'',name,nickname,position,station,account,additionalAccounts,membershipReporting,companyEmail,reportsTo,pbbId,pbbExpiry,pbbMscId,pbbMscExpiry,isInserted,createdForOrganization,unassigned,isAdministrator,isServerOwner,permissionOverrides,...(access.canManagePending?{hasGoogleLogin:googleIds.has(id)}:{})}))};
  };
  app.get('/employee-admin-api/organization',(req,res)=>res.json(view(req.employeeAccess)));
  const save=db.transaction(req=>{
    const current=store.get(),access=accessFor(req.employeeAdmin),all=rows(),body=req.body;
    if(!access)fail('Employee administrator access required.',403);
    if(body.revision!==current.revision)fail('Organization changed. Reload before saving.',409);
    const original=all.find(r=>r.id===body.id);
    if(!original||!model.canEdit(original,access,all))fail('You can only edit people below you in your reporting line.',403);
    const allowed=['name','nickname','position','companyEmail','station','account','additionalAccounts','reportsTo','pbbId','pbbExpiry','pbbMscId','pbbMscExpiry'];
    if(!body.changes||Object.keys(body.changes).some(key=>!allowed.includes(key)))fail('Invalid employee changes.');
    if(access.mode!=='admin'&&Object.hasOwn(body.changes,'additionalAccounts'))fail('Only an administrator can change additional accounts.',403);
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
  const membershipReporting=db.transaction(req=>{
    const current=store.get(),access=accessFor(req.employeeAdmin),body=req.body||{},all=rows(),employee=all.find(row=>row.id===body.id),scope=body.scope;
    if(!access)fail('Employee administrator access required.',403);
    if(current.revision!==body.revision)fail('Organization changed. Reload before saving.',409);
    if(!employee||!scope||typeof scope.station!=='string'||typeof scope.account!=='string'||model.membershipIndex(employee,scope)<=0)fail('Choose an assigned second or third account.');
    const normalized={station:scope.station.trim().toUpperCase(),account:scope.account.trim().toUpperCase()},scopedAccess={...access,...normalized};
    if(access.mode!=='admin'&&!(access.scopes||[access]).some(value=>model.sameScope(value,normalized)))fail('This account is outside your management responsibility.',403);
    const projected=model.forWorkspace(all,normalized),row=projected.find(value=>value.id===employee.id);
    if(!model.canEdit(row,scopedAccess,projected))fail('You can only edit reporting lines within your account.',403);
    if(typeof body.reportsTo!=='string')fail('Choose a reporting manager.');const manager=model.validateLine(row,body.reportsTo,projected);
    if(access.mode!=='admin'&&(!manager||!model.managersFor(row,scopedAccess,projected).some(value=>value.id===manager)))fail('Choose a manager within your reporting team.',403);
    store.save({revision:current.revision,employees:current.employees},req.employeeAdmin);
    db.prepare('INSERT OR REPLACE INTO employee_membership_reporting VALUES(?,?,?,?,?)').run(employee.id,normalized.station,normalized.account,manager,Number(!manager));
    return view(accessFor(req.employeeAdmin));
  });
  app.post('/employee-admin-api/organization/membership-reporting',(req,res)=>{try{const data=membershipReporting(req);res.json(data);onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});
  const linkGoogle=db.transaction(req=>{
    const access=accessFor(req.employeeAdmin),body=req.body||{},current=store.get();
    if(access?.mode!=='admin'||!access.canManagePending)fail('Only the owner can link Google logins to existing employees.',403);
    if(body.revision!==current.revision)fail('Employee data changed. Reload before linking the Google login.',409);
    const all=rows(),source=all.find(row=>row.id===body.id),target=all.find(row=>row.id===body.employeeId);
    if(!source||!target||source.id===target.id)fail('Choose a different existing employee.');
    if(source.id===access.employeeId||target.id===access.employeeId||source.isAdministrator||source.isServerOwner||target.isAdministrator||target.isServerOwner||!model.canEdit(source,access,all)||!model.canEdit(target,access,all))fail('Administrator and owner logins cannot be linked through this action.',403);
    if(!target.name.trim()||target.createdForOrganization)fail('Choose a named existing employee profile.');
    const links=googleAccounts(),link=links.find(row=>row.employee_id===source.id);
    if(!link)fail('This employee no longer has a Google login. Reload before linking.',409);
    if(links.some(row=>row.employee_id===target.id))fail('The selected employee already has a Google login.',409);
    db.prepare("UPDATE employee_accounts SET employee_id=? WHERE uid=? AND employee_id=? AND provider='google.com'").run(target.id,link.uid,source.id);
    // Keep both employee records and all operational history intact. Only the
    // Google sign-in changes; the destination's password login remains valid.
    store.save({revision:current.revision,employees:current.employees},req.employeeAdmin);
    db.prepare('INSERT INTO employee_google_link_audit(uid,source_employee_id,target_employee_id,actor,at) VALUES(?,?,?,?,?)').run(link.uid,source.id,target.id,req.employeeAdmin.uid||req.employeeAdmin.email,new Date().toISOString());
    return {...view(accessFor(req.employeeAdmin)),selectedId:target.id};
  });
  app.post('/employee-admin-api/organization/link-google',(req,res)=>{try{const data=linkGoogle(req);res.json(data);onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});
  const mergeEmployee=db.transaction(req=>{
    const access=accessFor(req.employeeAdmin),body=req.body||{},current=store.get(),all=rows();
    if(access?.mode!=='admin'||!access.canManagePending)fail('Only the owner can merge employee profiles.',403);
    if(body.revision!==current.revision)fail('Employee data changed. Reload before merging.',409);
    const source=all.find(row=>row.id===body.id),target=all.find(row=>row.id===body.employeeId);
    if(!source||!target||source.id===target.id)fail('Choose a different existing employee.',400);
    if([source,target].some(row=>row.id===access.employeeId||row.isAdministrator||row.isServerOwner||row.createdForOrganization)||!target.name.trim())fail('Choose two employee profiles, excluding owner and administrator identities.',403);
    const groups=require('../public/employee-account-groups'),memberships=[...new Map([...groups.memberships(target),...groups.memberships(source)].map(scope=>[groups.key(scope),scope])).values()],additionalAccounts=memberships.filter(scope=>!groups.same(scope,target));
    if(additionalAccounts.length>2)fail('The merged employee would have more than three accounts. Adjust the account memberships first.',409);
    const links=googleAccounts();if(links.some(link=>link.employee_id===source.id)&&links.some(link=>link.employee_id===target.id))fail('Both employees already have a Google login. Resolve the duplicate Google logins before merging.',409);
    const merged={...target,additionalAccounts};for(const field of ['nickname','phone','email','companyEmail','code','eid'])if(!merged[field]&&source[field])merged[field]=source[field];
    for(const [id,expiry] of [['pbbId','pbbExpiry'],['pbbMscId','pbbMscExpiry']])if(!merged[id]&&source[id]){merged[id]=source[id];merged[expiry]=source[expiry];}
    const manager=target.reportsTo===source.id?(source.reportsTo||''):target.reportsTo,next=all.filter(row=>row.id!==source.id).map(row=>row.id===target.id?{...merged,reportsTo:manager}:row.reportsTo===source.id?{...row,reportsTo:target.id}:row);
    for(const person of next)if(person.reportsTo)model.validateLine(person,person.reportsTo,next);
    const hasAccounts=db.prepare("SELECT 1 FROM sqlite_master WHERE name='employee_accounts'").get();if(hasAccounts)db.prepare('UPDATE employee_accounts SET employee_id=? WHERE employee_id=?').run(target.id,source.id);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='employee_avatars'").get())db.prepare('INSERT OR IGNORE INTO employee_avatars SELECT ?,data FROM employee_avatars WHERE employee_id=?').run(target.id,source.id);
    store.save({revision:current.revision,employees:current.employees.map(row=>row.id===target.id?merged:row)},req.employeeAdmin);
    if(manager)db.prepare('INSERT OR REPLACE INTO employee_reporting VALUES(?,?)').run(target.id,manager);else db.prepare('DELETE FROM employee_reporting WHERE employee_id=?').run(target.id);
    db.prepare('UPDATE employee_reporting SET manager_id=? WHERE manager_id=? AND employee_id!=?').run(target.id,source.id,source.id);
    db.prepare('INSERT INTO employee_profile_merges VALUES(?,?,?,?,?)').run(source.id,target.id,JSON.stringify(source),req.employeeAdmin.uid||req.employeeAdmin.email,new Date().toISOString());
    return {...view(accessFor(req.employeeAdmin)),selectedId:target.id};
  });
  app.post('/employee-admin-api/organization/merge',(req,res)=>{try{const data=mergeEmployee(req);res.json(data);onChange();}catch(error){res.status(error.status||400).json({error:error.message});}});
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
