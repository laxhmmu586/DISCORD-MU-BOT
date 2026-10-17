const sharp=require('sharp');
const normalize=value=>String(value||'').trim().toLowerCase();
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function createProfileStore(employees){
 const db=employees.db;
 db.exec(`CREATE TABLE IF NOT EXISTS employee_accounts(uid TEXT PRIMARY KEY,employee_id TEXT NOT NULL,provider TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS employee_google_account ON employee_accounts(employee_id) WHERE provider='google.com';
 CREATE TABLE IF NOT EXISTS employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS employee_link_attempts(uid TEXT PRIMARY KEY,count INTEGER NOT NULL,started INTEGER NOT NULL);`);
 const account=uid=>db.prepare('SELECT * FROM employee_accounts WHERE uid=?').get(uid);
 const linked=user=>{const link=account(user.uid);return link&&employees.get().employees.find(row=>row.id===link.employee_id);};
 const profile=row=>({id:row.id,name:row.name,nickname:row.nickname||'',eid:row.eid||'',phone:row.phone||'',email:row.email||'',avatar:db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?').get(row.id)?.data||''});
 function candidate(user,eid){
  if(user.provider==='google.com'&&!user.emailVerified)fail('A verified Google email is required.',403);
  const rows=employees.get().employees;
  const emailRows=rows.filter(row=>normalize(row.email)&&normalize(row.email)===normalize(user.email));
  const matches=emailRows.length?emailRows:(eid?rows.filter(row=>row.eid&&row.eid===String(eid).trim()):[]);
  if(matches.length!==1){if(!eid&&!emailRows.length)return null;fail('Employee record not found or ambiguous. Please contact an administrator.',403);}
  const row=matches[0];
  if(user.provider==='google.com'){
   const owner=db.prepare("SELECT uid FROM employee_accounts WHERE employee_id=? AND provider='google.com'").get(row.id);
   if(owner&&owner.uid!==user.uid)fail('This employee already has a Google account. Please contact an administrator.',403);
  }
  return row;
 }
 function status(user){
  const row=linked(user);
  if(row)return {state:'ready',profile:profile(row),revision:employees.get().revision};
  if(account(user.uid))fail('Employee record is unavailable. Please contact an administrator.',403);
  const match=candidate(user);
  return match?{state:'confirm',profile:profile(match),revision:employees.get().revision}:{state:'needs_eid'};
 }
 function attempt(user){
  const now=Date.now(),old=db.prepare('SELECT * FROM employee_link_attempts WHERE uid=?').get(user.uid);
  if(old&&now-old.started<900000&&old.count>=5)fail('Too many employee ID attempts. Try again in 15 minutes or contact an administrator.',429);
  db.prepare('INSERT OR REPLACE INTO employee_link_attempts VALUES(?,?,?)').run(user.uid,old&&now-old.started<900000?old.count+1:1,old&&now-old.started<900000?old.started:now);
 }
 const link=db.transaction((user,body)=>{
  if(linked(user))return status(user);
  if(account(user.uid))fail('Employee record is unavailable. Please contact an administrator.',403);
  if(body.revision!==employees.get().revision)fail('Employee details changed. Check your details again.',409);
  const row=candidate(user,body.eid);if(!row)fail('Enter your employee ID. Please contact an administrator if it cannot be found.',403);
  db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run(user.uid,row.id,user.provider||'password',new Date().toISOString());
  return status(user);
 });
 async function update(user,body){
  const row=linked(user);if(!row)fail('Link your employee account first.',403);
  if(Object.keys(body).some(key=>!['revision','nickname','phone','email','avatar'].includes(key)))fail('Only nickname, phone, email and avatar can be changed.');
  let avatar;
  if(body.avatar!==undefined){
   if(body.avatar==='')avatar='';
   else{
    if(typeof body.avatar!=='string'||body.avatar.length>2800000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.avatar))fail('Choose a PNG, JPEG or WebP image up to 2 MB.');
    try{const bytes=Buffer.from(body.avatar.split(',')[1],'base64');if(bytes.length>2*1024*1024)fail('Image is too large.');avatar='data:image/jpeg;base64,'+(await sharp(bytes,{limitInputPixels:16000000}).rotate().resize(256,256,{fit:'cover'}).jpeg({quality:85}).toBuffer()).toString('base64');}catch{fail('Choose a valid image up to 2 MB and 16 megapixels.');}
   }
  }
  return db.transaction(()=>{
   const current=employees.get();if(body.revision!==current.revision)fail('Employee details changed. Reload before saving.',409);
   const target=current.employees.find(item=>item.id===row.id);if(!target)fail('Employee record is unavailable.',403);
   for(const key of ['nickname','phone','email'])if(body[key]!==undefined){if(typeof body[key]!=='string')fail('Invalid personal information.');target[key]=body[key].trim();}
   if(target.email&&current.employees.some(item=>item.id!==row.id&&normalize(item.email)===normalize(target.email)))fail('Email is already used by another employee.');
   employees.save(current,user);
   if(avatar!==undefined)db.prepare('INSERT OR REPLACE INTO employee_avatars VALUES(?,?)').run(row.id,avatar);
   return status(user);
  })();
 }
 return {status,linked,link,update,preview(user,eid){attempt(user);const row=candidate(user,eid);if(!row)fail('Enter your employee ID.',400);return {state:'confirm',profile:profile(row),revision:employees.get().revision};},attempt};
}
function registerProfiles(app,{employees,authenticate,onChange=()=>{}}){
 const profiles=createProfileStore(employees);
 require('./pbbAuth').setEmployeeAccessVerifier(user=>Boolean(profiles.linked(user)));
 app.use('/profile-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.profileUser=await authenticate(req,{allowUnlinkedGoogle:true});next();}catch{res.status(401).json({error:'Sign in required.'});}});
 const handler=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(error){res.status(error.status||400).json({error:error.message});}};
 app.get('/profile-api',handler(req=>profiles.status(req.profileUser)));
 app.post('/profile-api/lookup',handler(req=>profiles.preview(req.profileUser,req.body.eid)));
 app.post('/profile-api/link',handler(req=>{profiles.attempt(req.profileUser);return profiles.link(req.profileUser,req.body);}));
 app.post('/profile-api',handler(async req=>{const saved=await profiles.update(req.profileUser,req.body);onChange();return saved;}));
 return profiles;
}
module.exports={createProfileStore,registerProfiles};
