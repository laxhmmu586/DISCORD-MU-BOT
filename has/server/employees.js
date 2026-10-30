const employeeAccounts=require('../public/employee-account-groups');
const employeePositions=require('../public/employee-positions');
const {StandardFontEmbedder,StandardFonts}=require('../../vendor/pdf-lib/pdf-lib');
const employeeFont=StandardFontEmbedder.for(StandardFonts.Helvetica);
const formatEmployeePhone=require('../public/employee-phone');
const LOGIN_ID_ADMIN_EMAILS=require('./serverOwners').emails;
const ADMIN_EMAILS=new Set([...LOGIN_ID_ADMIN_EMAILS,'tamsun10@gmail.com']);
const normalizeLoginId=value=>String(value??'').trim().toLowerCase();
const hasPbbLicense=(row,date=new Date().toISOString().slice(0,10))=>Boolean(row?.pbbId&&row?.pbbExpiry&&row.pbbExpiry>=date);
function loginIdForbidden(){throw Object.assign(new Error('Only authorized Lake administrators can change Original Login IDs.'),{status:403});}
function createEmployeeStore(db,{seed=require('./employeeSeed')()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS pbb_employees (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO pbb_employees(singleton,data) VALUES (1,?)').run(JSON.stringify({revision:1,employees:seed.map(row=>({...row,station:row.station??'LAX',account:row.account??'MU'}))}));
 const initial=JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data);
 if(initial.employees.some(row=>row.station===undefined||row.account===undefined)){
  initial.employees=initial.employees.map(row=>({...row,station:row.station??'LAX',account:row.account??'MU'}));initial.revision++;
  db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(initial));
 }
 db.exec('CREATE TABLE IF NOT EXISTS employee_account_groups(station TEXT NOT NULL,account TEXT NOT NULL,PRIMARY KEY(station,account))');
 const syncAccounts=rows=>{for(const row of rows){for(const scope of employeeAccounts.memberships(row))db.prepare('INSERT OR IGNORE INTO employee_account_groups VALUES(?,?)').run(scope.station,scope.account);}};
 syncAccounts(initial.employees);
 const accounts=()=>db.prepare('SELECT station,account FROM employee_account_groups ORDER BY station,account').all();
 const permissions=row=>({attach:row.attach===undefined?row.driver:row.attach,detach:row.detach===undefined?row.driver:row.detach});
 db.exec('CREATE TABLE IF NOT EXISTS employee_permission_overrides(employee_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const get=()=>{const data=JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data);data.employees=data.employees.map(({driver,...row})=>({...row,...permissions({...row,driver})}));data.accounts=accounts();const overrides=new Map(db.prepare('SELECT employee_id,data FROM employee_permission_overrides').all().map(row=>[row.employee_id,JSON.parse(row.data)]));data.employees=data.employees.map(row=>({...row,permissionOverrides:overrides.get(row.id)||{}}));return data;};
 const save=db.transaction((body,user,options={})=>{
  const current=get();if(body.revision!==current.revision){const e=new Error('Employee list changed. Reload before saving.');e.status=409;throw e;}
  if(!Array.isArray(body.employees)||body.employees.length>500)throw new Error('Invalid employee list');
  const canEditLoginId=LOGIN_ID_ADMIN_EMAILS.has(normalizeLoginId(user?.email));
  if(!canEditLoginId&&current.employees.some(old=>normalizeLoginId(old.loginId)&&!body.employees.some(row=>row.id===old.id)))loginIdForbidden();
  const ids=new Set(),discordIds=new Set(),loginIds=new Set();
  const employees=body.employees.map(input=>{
   const row={...input,...permissions(input)},old=current.employees.find(old=>old.id===row.id);
   const station=String(row.station??old?.station??'LAX').trim().toUpperCase(),account=String(row.account??old?.account??'MU').trim().toUpperCase();
   const pbbId=String(row.pbbId??old?.pbbId??'').trim(),pbbExpiry=String(row.pbbExpiry??old?.pbbExpiry??'');
   if(!/^[A-Z0-9-]{2,20}$/.test(station)||! /^[A-Z0-9-]{1,20}$/.test(account))throw new Error('Valid station and account are required');
   if(pbbId.length>80||/[^\x20-\x7e]/.test(pbbId)||Boolean(pbbId)!==Boolean(pbbExpiry)||pbbExpiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(pbbExpiry)||Number.isNaN(Date.parse(pbbExpiry))||new Date(pbbExpiry).toISOString().slice(0,10)!==pbbExpiry))throw new Error('Enter a PBB ID and valid expiry date together');
   const pbbMscId=String(row.pbbMscId??old?.pbbMscId??'').trim(),pbbMscExpiry=String(row.pbbMscExpiry??old?.pbbMscExpiry??'');
   if(pbbMscId.length>80||/[^\x20-\x7e]/.test(pbbMscId)||Boolean(pbbMscId)!==Boolean(pbbMscExpiry)||pbbMscExpiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(pbbMscExpiry)||Number.isNaN(Date.parse(pbbMscExpiry))||new Date(pbbMscExpiry).toISOString().slice(0,10)!==pbbMscExpiry))throw new Error('Enter an MSC PBB ID and valid expiry date together');
   const position=row.position??old?.position??'Agent';if(old&&normalizeLoginId(user?.email)&&normalizeLoginId(old.loginId)===normalizeLoginId(user?.email)&&!LOGIN_ID_ADMIN_EMAILS.has(normalizeLoginId(user?.email))&&employeePositions.normalize(position)!==employeePositions.normalize(old.position??'Agent'))throw Object.assign(Error('Only the owner can change their own title.'),{status:403});if(!employeePositions.valid(position))throw new Error('Select a valid employee position');
   const nickname=String(row.nickname??'').trim();if(nickname.length>60||/[\x00-\x1f\x7f]/.test(nickname))throw new Error('Check employee nicknames (maximum 60 characters)');
   const companyEmail=String(row.companyEmail??old?.companyEmail??'').trim();if(companyEmail&&(companyEmail.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(companyEmail)))throw new Error('HAS email must be a valid email address');
   const code=String(row.code??old?.code??'').trim(),phone=formatEmployeePhone(row.phone),email=String(row.email??'').trim();
   const previousLoginId=normalizeLoginId(old?.loginId),loginId=normalizeLoginId(row.loginId??previousLoginId);if(!canEditLoginId&&loginId!==previousLoginId&&!options.editableLoginIds?.has(row.id))loginIdForbidden();
   if(loginId&&(loginId.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId)||loginIds.has(loginId)))throw new Error('Original Login IDs must be valid, unique sign-in email addresses');
   if(code.length>40||phone.length>40||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Check employee codes, phone numbers and email addresses');
   const id=String(row.id||''),name=String(row.name||'').trim(),eid=String(row.eid||'').trim(),discordId=String(row.discordId||'').trim();
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id)||name.length>100||(eid&&!/^\d{1,12}$/.test(eid))||(discordId&&!/^\d{17,20}$/.test(discordId))||(discordId&&discordIds.has(discordId))||(typeof row.attach!=='boolean'||typeof row.detach!=='boolean')||typeof row.spotter!=='boolean'||((row.attach||row.detach||row.spotter)&&!name))throw new Error('Check employee names, EIDs and unique Discord IDs');
   try{employeeFont.encodeText(name);}catch{throw new Error('Use employee names in English spelling for the original PDF');}
   ids.add(id);if(discordId)discordIds.add(discordId);if(loginId)loginIds.add(loginId);
   const additionalAccounts=row.additionalAccounts===undefined?(old?.additionalAccounts||[]):row.additionalAccounts;
   if(!Array.isArray(additionalAccounts)||additionalAccounts.length>2)throw Error('Choose at most two additional accounts.');
   if(additionalAccounts.some(a=>!a||typeof a.station!=='string'||typeof a.account!=='string'||!a.station.trim()||!a.account.trim()))throw Error('Choose existing additional accounts.');const normalizedAccounts=additionalAccounts.map(employeeAccounts.scope),memberships=[...(employeeAccounts.isHeadquarter({position,station,account})?[]:[{station,account}]),...normalizedAccounts];
   if(new Set(memberships.map(employeeAccounts.key)).size!==memberships.length||normalizedAccounts.some(s=>!accounts().some(a=>employeeAccounts.same(a,s))||employeeAccounts.isHeadquarter(s)))throw Error('Choose distinct existing additional accounts.');
   return {additionalAccounts:normalizedAccounts,id,code,position,name,nickname,eid,phone,email,companyEmail,discordId,loginId,station,account,pbbId,pbbExpiry,pbbMscId,pbbMscExpiry,attach:row.attach,detach:row.detach,spotter:row.spotter};
  });
  const next={revision:current.revision+1,employees,updatedAt:new Date().toISOString(),updatedBy:user.email};db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(next));syncAccounts(employees);return {...next,accounts:accounts()};
 });
 const changeAccount=db.transaction((body,user,remove=false)=>{
  const current=get();if(body.revision!==current.revision)throw Object.assign(Error('Employee list changed. Reload before changing accounts.'),{status:409});
  const {station,account}=employeeAccounts.scope(body);
  if(!body.station||!body.account||!/^[A-Z0-9-]{2,20}$/.test(station)||!/^[A-Z0-9-]{1,20}$/.test(account)||employeeAccounts.isHeadquarter({station,account}))throw Error('Enter a valid station and account. HeadQuarter is a separate permanent group.');
  const existing=db.prepare('SELECT station FROM employee_account_groups WHERE station=? AND account=?').get(station,account);
  if(remove){
   if(!existing)throw Object.assign(Error('Account not found.'),{status:404});
   if(current.employees.some(row=>employeeAccounts.belongs(row,{station,account})))throw Object.assign(Error('Remove all employees from this account and save before deleting it.'),{status:409});
   db.prepare('DELETE FROM employee_account_groups WHERE station=? AND account=?').run(station,account);
  }else{if(existing)throw Object.assign(Error('This station/account already exists.'),{status:409});db.prepare('INSERT INTO employee_account_groups VALUES(?,?)').run(station,account);}
  const {accounts:ignored,...data}=current;data.revision++;data.updatedAt=new Date().toISOString();data.updatedBy=user.email;db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(data));return get();
 });
 return {db,get,save,changeAccount,eligible(role,id,type){const permission=role==='spotter'?'spotter':role==='driver'?(type==='arrival'?'attach':type==='departure'?'detach':null):null;return permission&&get().employees.find(e=>e.id===id&&e.name&&e[permission]);},options(){return get().employees.filter(e=>e.name&&(e.attach||e.detach||e.spotter)).map(({id,name,eid,attach,detach,spotter})=>({id,name,eid,attach,detach,spotter}));}};
}
function registerEmployees(app,{store,authenticate,profiles,onChange=()=>{},firebaseDirectory}){
 const accessFor=user=>{
  const email=normalizeLoginId(user?.email);if(ADMIN_EMAILS.has(email))return {mode:'admin',isServerOwner:require('./serverOwners').isOwner(user),employeeId:profiles?.linked(user)?.id||store.get().employees.find(row=>normalizeLoginId(row.loginId)===email)?.id,canManagePending:LOGIN_ID_ADMIN_EMAILS.has(email),canEditOwnTitle:LOGIN_ID_ADMIN_EMAILS.has(email)};
  const linked=profiles?.linked(user);
  const matches=email?store.get().employees.filter(row=>normalizeLoginId(row.loginId)===email):[];
  const me=linked||(matches.length===1?matches[0]:null);
  if(!me||!['Business Manager','Supervisor'].includes(employeePositions.normalize(me.position)))return null;
  return me?{mode:'business-manager',employeeId:me.id,canEditEmployeeInfo:true,canAddEmployee:employeePositions.normalize(me.position)==='Supervisor',canAssignAccounts:employeePositions.normalize(me.position)==='Supervisor',editablePositions:employeePositions.normalize(me.position)==='Business Manager'?['Duty Manager','Senior Supervisor','Supervisor','Lead','Agent']:['Lead','Agent'],pbbPositions:employeePositions.normalize(me.position)==='Supervisor'?['Lead','Agent']:['Agent'],...employeeAccounts.scope(me),scopes:employeePositions.normalize(me.position)==='Business Manager'?[employeeAccounts.scope(me)]:employeeAccounts.memberships(me)}:null;
 };
 const editableBy=(row,access)=>(row.id===access.employeeId||access.canEditEmployeeInfo&&!employeeAccounts.isHeadquarter(row)&&(access.editablePositions||['Lead','Agent']).includes(employeePositions.normalize(row.position))&&!ADMIN_EMAILS.has(normalizeLoginId(row.loginId))&&(access.scopes||[access]).some(scope=>employeeAccounts.belongs(row,scope)));
 const scopedView=(data,access)=>access.mode==='admin'?{...data,access}:{...data,access:{...access,editableEmployeeIds:data.employees.filter(row=>editableBy(row,access)).map(row=>row.id)},accountChoices:access.canAssignAccounts?data.accounts||[]:[employeeAccounts.scope(access)],accounts:(data.accounts||[]).filter(row=>(access.scopes||[access]).some(scope=>employeeAccounts.belongs(row,scope))),employees:data.employees.filter(row=>(access.scopes||[access]).some(scope=>employeeAccounts.belongs(row,scope)))};
 app.use('/employee-admin-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.employeeAdmin=await authenticate(req);req.employeeAccess=accessFor(req.employeeAdmin);if(!req.employeeAccess)return res.status(403).json({error:'Employee administrator access required'});next();}catch{res.status(401).json({error:'Sign in required'});}});
 app.get('/employee-admin-api',(req,res)=>res.json(scopedView(store.get(),req.employeeAccess)));
 app.get('/employee-admin-api/access',(req,res)=>res.json({canAccess:true}));
 if(store.db)require('./employeeOrganization').registerOrganization(app,{store,accessFor,scopedView,onChange});
 if(store.db)require('./employeePending').registerEmployeePending(app,{store,onChange,directory:firebaseDirectory});
 for(const [path,remove] of [['/accounts',false],['/accounts/delete',true]])app.post('/employee-admin-api'+path,(req,res)=>{try{if(req.employeeAccess.mode!=='admin')return res.status(403).json({error:'Only an employee administrator can add or delete accounts.'});const saved=store.changeAccount(req.body,req.employeeAdmin,remove);res.json({...saved,access:req.employeeAccess});onChange();}catch(e){res.status(e.status||400).json({error:e.message});}});
 const employeeTarget=(req,body)=>{if(req.employeeAccess.mode!=='admin'&&!req.employeeAccess.canAddEmployee)throw Object.assign(Error('Business Managers can only manage existing employees in their Main Account.'),{status:403});if(!body||typeof body.station!=='string'||typeof body.account!=='string'||!body.station.trim()||!body.account.trim())throw Error('Choose an account.');const scope=employeeAccounts.scope(body);if(!store.get().accounts.some(a=>employeeAccounts.same(a,scope)))throw Error('Account not found.');if(req.employeeAccess.mode!=='admin'&&!(req.employeeAccess.scopes||[req.employeeAccess]).some(a=>employeeAccounts.same(a,scope)))throw Object.assign(Error('Choose one of your own accounts.'),{status:403});return scope;};
 const findEmployee=(data,eid)=>{if(!/^\d{1,12}$/.test(String(eid||'')))throw Error('Enter a valid Employee ID.');const matches=data.employees.filter(e=>e.eid===String(eid));if(matches.length>1)throw Object.assign(Error('Multiple records use this Employee ID. Ask an administrator to resolve them.'),{status:409});return matches[0];};
 app.post('/employee-admin-api/employee-check',(req,res)=>{try{const scope=employeeTarget(req,req.body),data=store.get(),existing=findEmployee(data,req.body.eid);if(existing&&employeePositions.normalize(existing.position)!=='Agent')throw Object.assign(Error('Ask an administrator to manage this employee record.'),{status:403});res.json({revision:data.revision,existing:existing?{id:existing.id,name:existing.name,eid:existing.eid,alreadyMember:employeeAccounts.belongs(existing,scope),full:(existing.additionalAccounts||[]).length>=2,slot:(existing.additionalAccounts||[]).length?'third':'second'}:null});}catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/employee-admin-api/add-employee',(req,res)=>{try{const scope=employeeTarget(req,req.body),data=store.get();if(data.revision!==req.body.revision)throw Object.assign(Error('Employee list changed. Check the Employee ID again.'),{status:409});const existing=req.body.eid?findEmployee(data,req.body.eid):null;let id;
  if(existing){if(!req.body.existingId||existing.id!==req.body.existingId)throw Object.assign(Error('This employee already exists. Check the Employee ID and confirm adding an account.'),{status:409});if(employeePositions.normalize(existing.position)!=='Agent')throw Object.assign(Error('Ask an administrator to manage this employee record.'),{status:403});if(!employeeAccounts.belongs(existing,scope)){if((existing.additionalAccounts||[]).length>=2)throw Object.assign(Error('This employee already has three accounts. Ask an administrator to update them.'),{status:409});existing.additionalAccounts=[...(existing.additionalAccounts||[]),scope];}id=existing.id;
  }else{if(req.body.existingId)throw Object.assign(Error('Employee record changed. Check the Employee ID again.'),{status:409});const name=String(req.body.name||'').trim();if(!name)throw Error('Enter the full employee name.');id=require('node:crypto').randomUUID();data.employees.push({id,name,eid:String(req.body.eid||''),phone:String(req.body.phone||''),position:'Agent',...scope,additionalAccounts:[],attach:false,detach:false,spotter:false});}
  const saved=store.save(data,req.employeeAdmin);res.json({...scopedView(saved,req.employeeAccess),employeeAddedId:id});onChange();
 }catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/employee-admin-api',(req,res)=>{try{
  if(req.employeeAccess.mode==='admin'){const saved=store.save(req.body,req.employeeAdmin);res.json({...saved,access:req.employeeAccess});onChange();return;}
  const current=store.get();if(req.body.revision!==current.revision){const e=new Error('Employee list changed. Reload before saving.');e.status=409;throw e;}
  if(!Array.isArray(req.body.employees))throw new Error('Invalid employee list');
  const updates=new Map(req.body.employees.map(row=>[String(row.id||''),row]));
  for(const [id] of updates){const target=current.employees.find(row=>row.id===id);if(!target||!editableBy(target,req.employeeAccess)&&(req.employeeAccess.canEditEmployeeInfo||employeeAccounts.isHeadquarter(target)||!req.employeeAccess.pbbPositions.includes(employeePositions.normalize(target.position))||!(req.employeeAccess.scopes||[req.employeeAccess]).some(scope=>employeeAccounts.belongs(target,scope)))){const e=new Error('You can only edit PBB information for permitted titles in your own station and account.');e.status=403;throw e;}}
  const editableLoginIds=new Set();
  const employees=current.employees.map(row=>{const update=updates.get(row.id);if(!update)return row;
   if(editableBy(row,req.employeeAccess)){
    const deny=message=>{throw Object.assign(Error(message),{status:403});};
    if(!editableBy(row,req.employeeAccess))deny('You can only edit lower-level employees in your own accounts.');
    if(row.id===req.employeeAccess.employeeId&&(employeePositions.normalize(update.position??row.position)!==employeePositions.normalize(row.position)||normalizeLoginId(update.loginId??row.loginId)!==normalizeLoginId(row.loginId)))deny('Your own title and original sign-in must remain unchanged.');
    if(row.id!==req.employeeAccess.employeeId&&!req.employeeAccess.editablePositions.includes(employeePositions.normalize(update.position??row.position)))deny('Choose a permitted lower-level title.');
    if(ADMIN_EMAILS.has(normalizeLoginId(update.loginId??row.loginId)))deny('An administrator sign-in cannot be assigned to this employee.');
    if(!req.employeeAccess.canAssignAccounts&&(!employeeAccounts.same(row,{...row,...update})||JSON.stringify(update.additionalAccounts??row.additionalAccounts??[])!==JSON.stringify(row.additionalAccounts||[])))deny('Only an administrator can change your account assignments.');
    const destination=employeeAccounts.scope({...row,...update});if(!employeeAccounts.isHeadquarter(destination)&&!current.accounts.some(a=>employeeAccounts.same(a,destination)))deny('Choose an existing main account.');
    editableLoginIds.add(row.id);return {...row,...update,id:row.id};
   }
   return {...row,pbbId:update.pbbId,pbbExpiry:update.pbbExpiry,pbbMscId:update.pbbMscId,pbbMscExpiry:update.pbbMscExpiry};
  });
  const saved=store.save({revision:current.revision,employees},req.employeeAdmin,{editableLoginIds});res.json(scopedView(saved,accessFor(req.employeeAdmin)));onChange();
 }catch(e){res.status(e.status||400).json({error:e.message});}});
}
module.exports={ADMIN_EMAILS,LOGIN_ID_ADMIN_EMAILS,createEmployeeStore,registerEmployees,hasPbbLicense};
