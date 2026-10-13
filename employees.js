const {StandardFontEmbedder,StandardFonts}=require('./vendor/pdf-lib/pdf-lib');
const employeeFont=StandardFontEmbedder.for(StandardFonts.Helvetica);
const ADMIN_EMAILS=new Set(['lake@mu.com','tamsun@hm.com']);
function createEmployeeStore(db,{seed=require('./employeeSeed')()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS pbb_employees (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO pbb_employees(singleton,data) VALUES (1,?)').run(JSON.stringify({revision:1,employees:seed}));
 const get=()=>JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data);
 const save=db.transaction((body,user)=>{
  const current=get();if(body.revision!==current.revision){const e=new Error('Employee list changed. Reload before saving.');e.status=409;throw e;}
  if(!Array.isArray(body.employees)||body.employees.length>500)throw new Error('Invalid employee list');
  const ids=new Set(),discordIds=new Set();
  const employees=body.employees.map(row=>{
   const code=String(row.code??'').trim(),phone=String(row.phone??'').trim(),email=String(row.email??'').trim();
   if(code.length>40||phone.length>40||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Check employee codes, phone numbers and email addresses');
   const id=String(row.id||''),name=String(row.name||'').trim(),eid=String(row.eid||'').trim(),discordId=String(row.discordId||'').trim();
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id)||name.length>100||(eid&&!/^\d{1,12}$/.test(eid))||(discordId&&!/^\d{17,20}$/.test(discordId))||(discordId&&discordIds.has(discordId))||typeof row.driver!=='boolean'||typeof row.spotter!=='boolean'||((row.driver||row.spotter)&&!name))throw new Error('Check employee names, EIDs and unique Discord IDs');
   try{employeeFont.encodeText(name);}catch{throw new Error('Use employee names in English spelling for the original PDF');}
   ids.add(id);if(discordId)discordIds.add(discordId);return {id,code,name,eid,phone,email,discordId,driver:row.driver,spotter:row.spotter};
  });
  const next={revision:current.revision+1,employees,updatedAt:new Date().toISOString(),updatedBy:user.email};db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(next));return next;
 });return {get,save,eligible(role,id){return get().employees.find(e=>e.id===id&&e.name&&e[role]);},options(){return get().employees.filter(e=>e.name&&(e.driver||e.spotter)).map(({id,name,eid,driver,spotter})=>({id,name,eid,driver,spotter}));}};
}
function registerEmployees(app,{store,authenticate,onChange=()=>{}}){
 app.use('/employee-admin-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.employeeAdmin=await authenticate(req);if(!ADMIN_EMAILS.has(req.employeeAdmin.email.toLowerCase()))return res.status(403).json({error:'Only lake@mu.com and tamsun@hm.com can access employee records'});next();}catch{res.status(401).json({error:'Sign in required'});}});
 app.get('/employee-admin-api',(_req,res)=>res.json(store.get()));
 app.post('/employee-admin-api',(req,res)=>{try{const saved=store.save(req.body,req.employeeAdmin);res.json(saved);onChange();}catch(e){res.status(e.status||400).json({error:e.message});}});
}
module.exports={ADMIN_EMAILS,createEmployeeStore,registerEmployees};
