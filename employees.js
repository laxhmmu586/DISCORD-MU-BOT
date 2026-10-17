const {StandardFontEmbedder,StandardFonts}=require('./vendor/pdf-lib/pdf-lib');
const employeeFont=StandardFontEmbedder.for(StandardFonts.Helvetica);
const formatEmployeePhone=require('./public/public/employee-phone');
const ADMIN_EMAILS=new Set(['lake@mu.com','tamsun@hm.com','nextweek1216@gmail.com','tamsun10@gmail.com']);
const LOGIN_ID_ADMIN_EMAILS=new Set(['lake@mu.com','nextweek1216@gmail.com']);
const normalizeLoginId=value=>String(value??'').trim().toLowerCase();
function loginIdForbidden(){throw Object.assign(new Error('Only authorized Lake administrators can change Original Login IDs.'),{status:403});}
function createEmployeeStore(db,{seed=require('./employeeSeed')()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS pbb_employees (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO pbb_employees(singleton,data) VALUES (1,?)').run(JSON.stringify({revision:1,employees:seed}));
 // Legacy driver qualification grants both permissions until an administrator splits them.
 const permissions=row=>({attach:row.attach===undefined?row.driver:row.attach,detach:row.detach===undefined?row.driver:row.detach});
 const get=()=>{const data=JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data);data.employees=data.employees.map(({driver,...row})=>({...row,...permissions({...row,driver})}));return data;};
 const save=db.transaction((body,user)=>{
  const current=get();if(body.revision!==current.revision){const e=new Error('Employee list changed. Reload before saving.');e.status=409;throw e;}
  if(!Array.isArray(body.employees)||body.employees.length>500)throw new Error('Invalid employee list');
  const canEditLoginId=LOGIN_ID_ADMIN_EMAILS.has(normalizeLoginId(user?.email));
  if(!canEditLoginId&&current.employees.some(old=>normalizeLoginId(old.loginId)&&!body.employees.some(row=>row.id===old.id)))loginIdForbidden();
  const ids=new Set(),discordIds=new Set(),loginIds=new Set();
  const employees=body.employees.map(input=>{
   const row={...input,...permissions(input)};
   const nickname=String(row.nickname??'').trim();
   if(nickname.length>60||/[\x00-\x1f\x7f]/.test(nickname))throw new Error('Check employee nicknames (maximum 60 characters)');
   const code=String(row.code??'').trim(),phone=formatEmployeePhone(row.phone),email=String(row.email??'').trim();
   const previousLoginId=normalizeLoginId(current.employees.find(old=>old.id===row.id)?.loginId);
   const loginId=normalizeLoginId(row.loginId??previousLoginId);
   if(!canEditLoginId&&loginId!==previousLoginId)loginIdForbidden();
   if(loginId&&(loginId.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId)||loginIds.has(loginId)))throw new Error('Original Login IDs must be valid, unique sign-in email addresses');
   if(code.length>40||phone.length>40||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Check employee codes, phone numbers and email addresses');
   const id=String(row.id||''),name=String(row.name||'').trim(),eid=String(row.eid||'').trim(),discordId=String(row.discordId||'').trim();
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id)||name.length>100||(eid&&!/^\d{1,12}$/.test(eid))||(discordId&&!/^\d{17,20}$/.test(discordId))||(discordId&&discordIds.has(discordId))||(typeof row.attach!=='boolean'||typeof row.detach!=='boolean')||typeof row.spotter!=='boolean'||((row.attach||row.detach||row.spotter)&&!name))throw new Error('Check employee names, EIDs and unique Discord IDs');
   try{employeeFont.encodeText(name);}catch{throw new Error('Use employee names in English spelling for the original PDF');}
   ids.add(id);if(discordId)discordIds.add(discordId);if(loginId)loginIds.add(loginId);return {id,code,name,nickname,eid,phone,email,discordId,loginId,attach:row.attach,detach:row.detach,spotter:row.spotter};
  });
  const next={revision:current.revision+1,employees,updatedAt:new Date().toISOString(),updatedBy:user.email};db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(next));return next;
 });return {get,save,eligible(role,id,type){const permission=role==='spotter'?'spotter':role==='driver'?(type==='arrival'?'attach':type==='departure'?'detach':null):null;return permission&&get().employees.find(e=>e.id===id&&e.name&&e[permission]);},options(){return get().employees.filter(e=>e.name&&(e.attach||e.detach||e.spotter)).map(({id,name,eid,attach,detach,spotter})=>({id,name,eid,attach,detach,spotter}));}};
}
function registerEmployees(app,{store,authenticate,onChange=()=>{}}){
 app.use('/employee-admin-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.employeeAdmin=await authenticate(req);if(!ADMIN_EMAILS.has(req.employeeAdmin.email.toLowerCase()))return res.status(403).json({error:'Employee administrator access required'});next();}catch{res.status(401).json({error:'Sign in required'});}});
 app.get('/employee-admin-api',(_req,res)=>res.json(store.get()));
 app.post('/employee-admin-api',(req,res)=>{try{const saved=store.save(req.body,req.employeeAdmin);res.json(saved);onChange();}catch(e){res.status(e.status||400).json({error:e.message});}});
}
module.exports={ADMIN_EMAILS,LOGIN_ID_ADMIN_EMAILS,createEmployeeStore,registerEmployees};
