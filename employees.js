const employeeAccounts=require('./public/public/employee-account-groups');
const employeePositions=require('./public/public/employee-positions');
const {StandardFontEmbedder,StandardFonts}=require('./vendor/pdf-lib/pdf-lib');
const employeeFont=StandardFontEmbedder.for(StandardFonts.Helvetica);
const formatEmployeePhone=require('./public/public/employee-phone');
const ADMIN_EMAILS=new Set(['lake@mu.com','tamsun@hm.com','nextweek1216@gmail.com','tamsun10@gmail.com']);
const LOGIN_ID_ADMIN_EMAILS=new Set(['lake@mu.com','nextweek1216@gmail.com']);
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
 const syncAccounts=rows=>{for(const row of rows)if(!employeeAccounts.isHeadquarter(row)){const scope=employeeAccounts.scope(row);db.prepare('INSERT OR IGNORE INTO employee_account_groups VALUES(?,?)').run(scope.station,scope.account);}};
 syncAccounts(initial.employees);
 const accounts=()=>db.prepare('SELECT station,account FROM employee_account_groups ORDER BY station,account').all();
 const permissions=row=>({attach:row.attach===undefined?row.driver:row.attach,detach:row.detach===undefined?row.driver:row.detach});
 const get=()=>{const data=JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data);data.employees=data.employees.map(({driver,...row})=>({...row,...permissions({...row,driver})}));data.accounts=accounts();return data;};
 const save=db.transaction((body,user)=>{
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
   const position=row.position??old?.position??'Agent';if(!employeePositions.valid(position))throw new Error('Select a valid employee position');
   const nickname=String(row.nickname??'').trim();if(nickname.length>60||/[\x00-\x1f\x7f]/.test(nickname))throw new Error('Check employee nicknames (maximum 60 characters)');
   const companyEmail=String(row.companyEmail??old?.companyEmail??'').trim();if(companyEmail&&(companyEmail.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(companyEmail)))throw new Error('Company email must be a valid email address');
   const code=String(row.code??old?.code??'').trim(),phone=formatEmployeePhone(row.phone),email=String(row.email??'').trim();
   const previousLoginId=normalizeLoginId(old?.loginId),loginId=normalizeLoginId(row.loginId??previousLoginId);if(!canEditLoginId&&loginId!==previousLoginId)loginIdForbidden();
   if(loginId&&(loginId.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId)||loginIds.has(loginId)))throw new Error('Original Login IDs must be valid, unique sign-in email addresses');
   if(code.length>40||phone.length>40||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Check employee codes, phone numbers and email addresses');
   const id=String(row.id||''),name=String(row.name||'').trim(),eid=String(row.eid||'').trim(),discordId=String(row.discordId||'').trim();
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id)||name.length>100||(eid&&!/^\d{1,12}$/.test(eid))||(discordId&&!/^\d{17,20}$/.test(discordId))||(discordId&&discordIds.has(discordId))||(typeof row.attach!=='boolean'||typeof row.detach!=='boolean')||typeof row.spotter!=='boolean'||((row.attach||row.detach||row.spotter)&&!name))throw new Error('Check employee names, EIDs and unique Discord IDs');
   try{employeeFont.encodeText(name);}catch{throw new Error('Use employee names in English spelling for the original PDF');}
   ids.add(id);if(discordId)discordIds.add(discordId);if(loginId)loginIds.add(loginId);
   return {id,code,position,name,nickname,eid,phone,email,companyEmail,discordId,loginId,station,account,pbbId,pbbExpiry,pbbMscId,pbbMscExpiry,attach:row.attach,detach:row.detach,spotter:row.spotter};
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
   if(current.employees.some(row=>!employeeAccounts.isHeadquarter(row)&&employeeAccounts.same(row,{station,account})))throw Object.assign(Error('Remove all employees from this account and save before deleting it.'),{status:409});
   db.prepare('DELETE FROM employee_account_groups WHERE station=? AND account=?').run(station,account);
  }else{if(existing)throw Object.assign(Error('This station/account already exists.'),{status:409});db.prepare('INSERT INTO employee_account_groups VALUES(?,?)').run(station,account);}
  const {accounts:ignored,...data}=current;data.revision++;data.updatedAt=new Date().toISOString();data.updatedBy=user.email;db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(data));return get();
 });
 return {get,save,changeAccount,eligible(role,id,type){const permission=role==='spotter'?'spotter':role==='driver'?(type==='arrival'?'attach':type==='departure'?'detach':null):null;return permission&&get().employees.find(e=>e.id===id&&e.name&&e[permission]);},options(){return get().employees.filter(e=>e.name&&(e.attach||e.detach||e.spotter)).map(({id,name,eid,attach,detach,spotter})=>({id,name,eid,attach,detach,spotter}));}};
}
function registerEmployees(app,{store,authenticate,onChange=()=>{}}){
 const accessFor=user=>{
  const email=normalizeLoginId(user?.email);if(ADMIN_EMAILS.has(email))return {mode:'admin'};
  const me=store.get().employees.find(row=>normalizeLoginId(row.loginId)===email&&employeePositions.normalize(row.position)==='Business Manager');
  return me?{mode:'business-manager',station:String(me.station||'').toUpperCase(),account:String(me.account||'').toUpperCase()}:null;
 };
 const scopedView=(data,access)=>access.mode==='admin'?{...data,access}:{...data,access,accounts:(data.accounts||[]).filter(row=>employeeAccounts.same(row,access)),employees:data.employees.filter(row=>!employeeAccounts.isHeadquarter(row)&&employeeAccounts.same(row,access))};
 app.use('/employee-admin-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.employeeAdmin=await authenticate(req);req.employeeAccess=accessFor(req.employeeAdmin);if(!req.employeeAccess)return res.status(403).json({error:'Employee administrator access required'});next();}catch{res.status(401).json({error:'Sign in required'});}});
 app.get('/employee-admin-api',(req,res)=>res.json(scopedView(store.get(),req.employeeAccess)));
 for(const [path,remove] of [['/accounts',false],['/accounts/delete',true]])app.post('/employee-admin-api'+path,(req,res)=>{try{if(req.employeeAccess.mode!=='admin')return res.status(403).json({error:'Only an employee administrator can add or delete accounts.'});const saved=store.changeAccount(req.body,req.employeeAdmin,remove);res.json({...saved,access:req.employeeAccess});onChange();}catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/employee-admin-api',(req,res)=>{try{
  if(req.employeeAccess.mode==='admin'){const saved=store.save(req.body,req.employeeAdmin);res.json({...saved,access:req.employeeAccess});onChange();return;}
  const current=store.get();if(req.body.revision!==current.revision){const e=new Error('Employee list changed. Reload before saving.');e.status=409;throw e;}
  if(!Array.isArray(req.body.employees))throw new Error('Invalid employee list');
  const updates=new Map(req.body.employees.map(row=>[String(row.id||''),row]));
  for(const [id] of updates){const target=current.employees.find(row=>row.id===id);if(!target||employeeAccounts.isHeadquarter(target)||employeePositions.normalize(target.position)!=='Agent'||String(target.station||'').toUpperCase()!==req.employeeAccess.station||String(target.account||'').toUpperCase()!==req.employeeAccess.account){const e=new Error('You can only edit PBB information for Agents in your own station and account.');e.status=403;throw e;}}
  const employees=current.employees.map(row=>{const update=updates.get(row.id);return update?{...row,pbbId:update.pbbId,pbbExpiry:update.pbbExpiry,pbbMscId:update.pbbMscId,pbbMscExpiry:update.pbbMscExpiry}:row;});
  const saved=store.save({revision:current.revision,employees},req.employeeAdmin);res.json(scopedView(saved,req.employeeAccess));onChange();
 }catch(e){res.status(e.status||400).json({error:e.message});}});
}
module.exports={ADMIN_EMAILS,LOGIN_ID_ADMIN_EMAILS,createEmployeeStore,registerEmployees,hasPbbLicense};
