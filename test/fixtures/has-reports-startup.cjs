const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const mode=process.argv[2],originalLoad=Module._load;
if(mode==='missing-excel')Module._load=function(name,...rest){if(name==='exceljs')throw Object.assign(Error("Cannot find module 'exceljs'"),{code:'MODULE_NOT_FOUND'});return originalLoad.call(this,name,...rest);};
const express=require('express'),{createStore,registerPbb}=require('../../pbb');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'has-report-startup-')),blocker=path.join(tmp,'blocked');
 delete process.env.HAS_REPORT_DB_PATH;delete process.env.PBB_EMPLOYEE_DB_PATH;
 if(mode==='database-recovery'){fs.writeFileSync(blocker,'not a directory');process.env.HAS_REPORT_DB_PATH=path.join(blocker,'reports.db');}
 if(mode==='new-directory')process.env.HAS_REPORT_DB_PATH=path.join(blocker,'reports.db');
 const app=express();app.use(express.json());const store=createStore(':memory:'),user={uid:'one',email:'one@example.test',provider:'password'};
 let service,server;
 try{
  service=registerPbb(app,{store,employeeSeed:[{id:'one',name:'Test Employee',eid:'123456',station:'LAX',account:'MU',position:'Supervisor',loginId:user.email}],authenticate:async()=>user,drive:{},client:{},gateService:{read:async()=>({status:'unavailable'}),today:async()=>({flights:[]})}});
  service.profiles.status(user);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  for(const endpoint of ['/profile-api','/read-sign-api','/has-pbb-api/context','/has-report-api/context'])assert.equal((await fetch(base+endpoint)).status,200,endpoint);
  const unavailable=await fetch(base+'/has-report-api/da/2026-10');
  if(mode==='new-directory'){assert.equal(unavailable.status,200);assert(fs.existsSync(process.env.HAS_REPORT_DB_PATH));}
  else{assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('Retry-After'),'30');assert.match((await unavailable.json()).error,/temporarily unavailable/i);}
  for(const endpoint of ['/profile-api','/read-sign-api','/has-pbb-api/context'])assert.equal((await fetch(base+endpoint)).status,200,endpoint+' after report failure');
  if(mode==='missing-excel'){Module._load=originalLoad;assert.equal((await fetch(base+'/has-report-api/da/2026-10')).status,200,'report recovers after dependency becomes available');}
  if(mode==='database-recovery'){
   fs.unlinkSync(blocker);fs.mkdirSync(blocker);const recovered=await fetch(base+'/has-report-api/da/2026-10');assert.equal(recovered.status,200);assert.equal((await recovered.json()).revision,0);
   const dbFile=process.env.HAS_REPORT_DB_PATH;assert(fs.existsSync(dbFile));
   // Verify missing parent directories are provisioned for a newly configured DB.
   service.close();service.employees.close();store.db.close();service=null;
  }
  console.log(mode+': core APIs remain available');
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(service){service.close();service.employees.close();store.db.close();}
  Module._load=originalLoad;
  // Only remove files created by this fixture in its unique temporary directory.
  if(fs.existsSync(blocker)&&fs.statSync(blocker).isDirectory()){for(const name of ['reports.db','reports.db-wal','reports.db-shm']){const file=path.join(blocker,name);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(blocker);}else if(fs.existsSync(blocker))fs.unlinkSync(blocker);
  fs.rmdirSync(tmp);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
