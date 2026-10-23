const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),Database=require('better-sqlite3'),fs=require('node:fs'),path=require('node:path');
const {PDFDocument}=require('../vendor/pdf-lib/pdf-lib');
test('all four forms export real PDFs after first submission and after return, with authenticated record access',async t=>{
 const db=new Database(':memory:'),seed=['Supervisor','Business Manager','General Manager','President','Accounting','Badge Coordinator','Supervisor'].map((position,i)=>({id:'pdf-'+i,name:'FICTIONAL EMPLOYEE '+i,position,eid:'100'+i,station:'LAX',account:'MU',phone:'6265550100',loginId:'pdf'+i+'@example.test',companyEmail:'pdf'+i+'@company.test',attach:false,detach:false,spotter:false}));
 const employees={...require('../employees').createEmployeeStore(db,{seed}),db},profiles={linked:user=>employees.get().employees.find(e=>e.id===user.uid)},app=express();app.use(express.json());
 const authenticate=async req=>{const uid=req.headers['x-user'];if(!seed.some(e=>e.id===uid))throw Error('Sign in required');return {uid,email:uid+'@example.test'};};
 const uniform=require('../uniformRequests').registerUniform(app,{employees,profiles,authenticate,notify:async()=>{},send:async()=>{throw Error('PDF download must not send email');}}),stores={uniform:uniform.store};
 for(const kind of ['incident','expense','terrific'])stores[kind]=require('../'+kind+'Reports')['register'+kind[0].toUpperCase()+kind.slice(1)+'Reports'](app,{employees,profiles,authenticate});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{uniform.close();server.closeAllConnections();server.close();db.close();});
 const get=(kind,id,user='pdf-0')=>fetch('http://127.0.0.1:'+server.address().port+'/'+kind+'-api/'+id+'/pdf',{headers:user?{'x-user':user}:{}}),owner={uid:'pdf-0'},reviewer={uid:'pdf-1'};
 const formFields={incident:Object.fromEntries(Object.keys(require('../incidentReports').fields).map(k=>[k,/Date$/.test(k)?'2026-10-23':'Fictional incident detail.'])),expense:{nameTitleDepartment:'FICTIONAL EMPLOYEE 0 / Supervisor',reportDate:'2026-10-23',period:'October 2026',departmentReason:'LAX / MU - Station supplies',expenseType:'Company Expense',currency:'USD',advance:'5',lines:{general:[{date:'2026-10-23',reason:'Station supplies',amount:'25'}],hotel:[{city:'Los Angeles',hotel:'Fictional hotel',days:'2',dailyRate:'120',companyCard:'200'}]}},terrific:{reportDate:'2026-10-23',preparedBy:'FICTIONAL EMPLOYEE 0',account:'LAX / MU',lines:{general:[{amount:'10',recipient:'Fictional Recipient',email:'recipient@example.test',reason:'Excellent service',issuedBy:'FICTIONAL EMPLOYEE 0',account:'MU',message:'Thank you for assisting our passengers.'}]}}};
 for(const kind of ['uniform','incident','expense','terrific']){
  const store=stores[kind];let r;
  if(kind==='uniform'){
   const flow=store.workflow(),route=require('../uniformRoute').template(flow);route[1].employeeId='pdf-2';route[1].position='General Manager';
   r=store.create(owner,{requestId:crypto.randomUUID(),reason:'annual',items:Array.from({length:6},(_,i)=>({size:i?'':'38',pieces:i?'':1,order:'',reusable:'',nonReusable:''})),route,workflowRevision:flow.revision});
  }else{
   r=store.save(owner,{id:crypto.randomUUID(),action:'save',fields:formFields[kind]});assert.equal((await get(kind,r.id)).status,409,kind+' initial draft');r=store.save(owner,{id:r.id,revision:r.revision,action:'submit',fields:formFields[kind]});
  }
  assert.equal(r.status,'pending');assert.equal(r.approvals.length,0);assert.equal((await get(kind,r.id,null)).status,401);assert.equal((await get(kind,r.id,'pdf-6')).status,403);
  let response=await get(kind,r.id);assert.equal(response.status,200,kind+' initial submission');assert.match(response.headers.get('content-type'),/application\/pdf/);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');const doc=await PDFDocument.load(bytes);assert(doc.getPageCount()>=(kind==='uniform'?2:1));
  if(process.env.PDF_PREVIEW_DIR){fs.mkdirSync(process.env.PDF_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PDF_PREVIEW_DIR,kind+'-submitted.pdf'),bytes);}
  if(kind==='uniform'){const cached=db.prepare('SELECT pdf,delivered FROM uniform_requests WHERE id=?').get(r.id);assert.equal(cached.pdf,null);assert.equal(cached.delivered,0);}
  r=store.decide(reviewer,r.id,{revision:r.revision,action:'return',note:'Please revise the submitted form.'});assert.equal(r.status,'draft');assert.equal((await get(kind,r.id)).status,200,kind+' returned draft retains export');
 }
});
