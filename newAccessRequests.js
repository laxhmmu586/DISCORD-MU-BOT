const accounts=require('./public/public/employee-account-groups');
const positions=require('./public/public/employee-positions');
const {LOGIN_ID_ADMIN_EMAILS}=require('./employees');
const normalize=value=>String(value||'').trim().toLowerCase();
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};

function createNewAccessStore({employees,profiles,now=()=>new Date()}){
 const db=employees.db;
 db.exec('CREATE TABLE IF NOT EXISTS new_access_requests(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const employee=user=>{const e=profiles.linked(user);if(!e?.name)fail('Link your employee profile first.',403);return e;};
 const owner=(user,e)=>LOGIN_ID_ADMIN_EMAILS.has(normalize(user.email))||LOGIN_ID_ADMIN_EMAILS.has(normalize(e.loginId));
 const canCreate=e=>require('./public/public/employee-permissions').allowed(e,'request.newAccess')&&!accounts.isHeadquarter(e);
 const get=id=>{const row=db.prepare('SELECT data FROM new_access_requests WHERE id=?').get(id);if(!row)fail('Request not found.',404);return JSON.parse(row.data);};
 const visible=(r,user,e)=>r.employee.id===e.id||owner(user,e);
 const view=(r,user,e)=>({...r,viewerId:e.id,canReview:r.status==='pending'&&owner(user,e),canComplete:r.status==='approved'&&r.employee.id===e.id});
 const read=(user,id)=>{const e=employee(user),r=get(id);if(!visible(r,user,e))fail('Request not found.',404);return view(r,user,e);};
 const put=r=>{db.prepare('INSERT OR REPLACE INTO new_access_requests VALUES(?,?)').run(r.id,JSON.stringify(r));return r;};
 const event=(r,e,action,label,note='')=>{const at=now().toISOString();r.updatedAt=at;r.history.push({employeeId:e.id,name:e.name,action,label,note,at});return at;};
 const cleanFields=(body,e)=>{
  const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x1f\x7f]/.test(value))fail('Enter a valid '+label+'.');return value.trim();};
  const name=text(body.name,'employee name',100),eid=body.eid===undefined||body.eid===''?'':text(body.eid,'EID',12),email=text(body.email,'Hallmark email or preferred username',254);
  if(eid&&!/^\d{1,12}$/.test(eid))fail('Enter a valid EID.');
  if(email.includes('@')?!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email):!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(email))fail('Enter a valid Hallmark email or preferred username.');
  const scope=accounts.scope(e);
  if(!body.station||!body.account||!accounts.same(body,scope))fail('Use your Main Account station and account.',403);
  const position=positions.normalize(body.position||'Agent');if(!['Duty Manager','Senior Supervisor','Supervisor','Lead','Agent'].includes(position))fail('Choose a requested title below Business Manager.',403);
  return {name,...(eid?{eid}:{}),...scope,email,position};
 };
 return {db,get,read,list(user){const e=employee(user);return {employee:{id:e.id,name:e.name,position:e.position,...accounts.scope(e)},canCreate:canCreate(e),requests:db.prepare('SELECT data FROM new_access_requests ORDER BY rowid DESC').all().map(row=>JSON.parse(row.data)).filter(r=>visible(r,user,e)).map(r=>view(r,user,e))};},
  create:db.transaction((user,body)=>{
   const e=employee(user);if(!canCreate(e))fail('Only the Main Account Business Manager can request new access.',403);
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId||''))fail('Invalid request reference.');
   const fields=cleanFields(body.fields||{},e),existing=db.prepare('SELECT data FROM new_access_requests WHERE id=?').get(body.requestId);
   if(existing){const old=JSON.parse(existing.data);if(old.employee.id!==e.id||JSON.stringify({...old.fields,position:old.fields.position||'Agent'})!==JSON.stringify(fields))fail('Request reference already used.',409);return view(old,user,e);}
   const scope=accounts.scope(e),r={id:body.requestId,title:scope.station+'/'+scope.account+' Request New Access',employee:{id:e.id,name:e.name,eid:e.eid||'',...scope},fields,status:'pending',revision:1,approvals:[],history:[]};
   r.submittedAt=event(r,e,'submit','Submitted to System Admin for approval');put(r);return view(r,user,e);
  }),
  decide:db.transaction((user,id,body)=>{
   const e=employee(user);if(!owner(user,e))fail('Only a System Admin can approve new access requests.',403);
   const r=get(id);if(body.revision!==r.revision)fail('Request changed. Refresh before reviewing.',409);
   if(r.status!=='pending')fail('This request is no longer awaiting approval.',409);
   if(!['approve','reject'].includes(body.action))fail('Choose approve or reject.');
   const note=String(body.note||'').trim();if(note.length>2000||body.action==='reject'&&!note)fail('Enter a rejection reason (up to 2,000 characters).');
   const at=event(r,e,body.action,body.action==='approve'?'Approved — awaiting requester completion':'Rejected',note);
   r.approvals.push({employeeId:e.id,name:e.name,position:e.position,action:body.action,note,at});r.status=body.action==='approve'?'approved':'rejected';if(r.status==='approved')r.approvedAt=at;r.revision++;
   put(r);return view(r,user,e);
  }),
  complete:db.transaction((user,id,body)=>{
   const e=employee(user),r=get(id);if(r.employee.id!==e.id)fail('Only the requester can complete this request.',403);
   if(body.revision!==r.revision)fail('Request changed. Refresh before completing.',409);
   if(r.status!=='approved')fail('A System Admin must approve this request before you can complete it.',409);
   r.completedAt=event(r,e,'complete','Completed by requester');r.status='completed';r.revision++;put(r);return view(r,user,e);
  })
 };
}
function registerNewAccess(app,{employees,profiles,authenticate,now}){
 const store=createNewAccessStore({employees,profiles,now});
 app.use('/new-access-api',require('express').json({limit:'16kb'}),async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.newAccessUser=await authenticate(req);next();}catch{res.status(401).json({error:'Sign in required.'});}});
 const handle=fn=>(req,res)=>{try{res.json(fn(req));}catch(e){res.status(e.status||400).json({error:e.message});}};
 app.get('/new-access-api',handle(req=>store.list(req.newAccessUser)));
 app.post('/new-access-api',handle(req=>store.create(req.newAccessUser,req.body)));
 app.get('/new-access-api/:id',handle(req=>store.read(req.newAccessUser,req.params.id)));
 app.post('/new-access-api/:id/decision',handle(req=>store.decide(req.newAccessUser,req.params.id,req.body)));
 app.post('/new-access-api/:id/complete',handle(req=>store.complete(req.newAccessUser,req.params.id,req.body)));
 return {store};
}
module.exports={createNewAccessStore,registerNewAccess};
