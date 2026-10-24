const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createEmployeeStore,registerEmployees}=require('../employees'),{registerHasPbb}=require('../hasPbb');
(async()=>{
 const db=new Database(':memory:'),employees=createEmployeeStore(db,{seed:['driver','spotter','expired','sfo','soon','msc','lake'].map((id,i)=>({id,position:id==='driver'||id==='sfo'?'Manager':'Agent',name:'TEST '+id.toUpperCase(),eid:String(i+1),station:id==='sfo'?'SFO':'LAX',account:id==='sfo'?'XX':'MU',attach:true,spotter:true,pbbId:'PBB-'+id,pbbMscId:id==='msc'?'MSC-TEST':'',pbbMscExpiry:id==='msc'?'2026-11-20':'',pbbExpiry:id==='msc'?'2026-10-20':id==='expired'?'2026-10-20':id==='soon'?'2026-11-20':'2027-10-21'}))});
 let testNow=new Date('2026-10-21T17:00:00Z'),uploads=0;const app=express();app.use('/has-network',(req,res,next)=>{app.handle(req,res,next);});app.use(express.json({limit:'2mb'}));const integration=registerHasPbb(app,{store:{db,now:()=>testNow},employees,profiles:{status(){},linked:u=>employees.get().employees.find(e=>e.id===u.uid)},authenticate:async req=>{const uid=req.headers.authorization?.replace('Bearer ','');if(!uid)throw Error('Login required');return {uid,email:uid==='lake'?'lake@mu.com':uid+'@test.invalid'};},drive:{files:{generateIds:async()=>({data:{ids:['fixture-pdf']}}),get:async()=>{throw {code:404};},create:async()=>{uploads++;return {data:{id:'fixture-pdf'}};}}}});
 registerEmployees(app,{store:employees,authenticate:async()=>({email:'lake@mu.com'})});
 app.get('/profile-api',(req,res)=>{const id=req.headers.authorization?.replace('Bearer ','');const e=employees.get().employees.find(e=>e.id===id);res.json({state:'ready',profile:{...e,name:e?.name||'LAKE TEST',nickname:id==='lake'?'Lake':id,avatar:''},revision:1});});app.use(express.static(path.join(__dirname,'../public/public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,output=path.join(__dirname,'../output/has-pbb-dashboard');fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,channel:process.env.HAS_BROWSER_CHANNEL||'msedge'});const errors=[];
 const pageFor=async(user,file='has-pbb.html',streamMode='ended')=>{const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(({base,user})=>{window.MU_API_BASE='/has-network';const person={providerData:[],displayName:user,email:user==='lake'?'lake@mu.com':user+'@test.invalid',getIdToken:async()=>user};window.firebase={apps:[{}],auth:()=>({currentUser:person,onAuthStateChanged:fn=>fn(person)})};},{base,user});await page.route('https://api.mufcapp.net/**',r=>r.abort());if(streamMode!=='live')await page.route('**/has-network/has-pbb-api/stream**',r=>{if(streamMode==='ended')return r.fulfill({status:200,contentType:'text/event-stream',body:''});});await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:''}));await page.route('**/__/firebase/init.js',r=>r.fulfill({body:''}));await page.clock.install({time:new Date('2026-10-21T17:00:00Z')});await page.goto(base+'/'+file);if(file==='has-pbb.html')assert.equal(await page.title(),'HAS Jet bridge');return page;};
 try{
  const configured=await fetch(base+'/has-pbb-api/flights',{method:'POST',headers:{Authorization:'Bearer driver','Content-Type':'application/json'},body:JSON.stringify({flightNo:'MU583'})});assert.equal(configured.ok,true);
  const page=await pageFor('driver');await page.locator('#gate-form').waitFor();
  await page.waitForFunction(()=>document.querySelector('#has-status').textContent.includes('every 3 seconds'));
  assert.equal(await page.evaluate(()=>resolveApiBase()),'/has-network');
  const before=await page.locator('#gate-form').textContent();
  await page.route('**/has-network/has-pbb-api/context**',r=>r.abort());
  await page.clock.fastForward(31000);
  await page.waitForFunction(()=>/Unable to refresh|interrupted/.test(document.querySelector('#has-status').textContent));
  assert.equal(await page.locator('#gate-form').textContent(),before,'Transient failures preserve the form');
  await page.unroute('**/has-network/has-pbb-api/context**');
  await page.clock.fastForward(4000);
  await page.waitForFunction(()=>document.querySelector('#has-status').textContent.includes('every 3 seconds'));
  await fetch(base+'/has-pbb-api/gate',{method:'POST',headers:{Authorization:'Bearer driver','Content-Type':'application/json'},body:JSON.stringify({flightNo:'MU583',gate:'156',role:'driver'})});
  await page.clock.fastForward(4000);
  await page.locator('[data-bridge="L1"]').waitFor();
  await page.locator('[data-bridge="L1"]').click();
  await page.waitForFunction(()=>Boolean(document.querySelector('#has-view').dataset.revision));
  await page.locator('#has-view').evaluate(el=>el.querySelector('section').dataset.pollSentinel='preserved');
  await page.clock.fastForward(4000);await page.waitForTimeout(100);
  assert.equal(await page.locator('#has-view section').first().getAttribute('data-poll-sentinel'),'preserved','Unchanged polling does not rebuild checklist inputs');
  const dashboard=await pageFor('lake','has-pbb-dashboard.html');
  await dashboard.getByRole('heading',{name:'Overall statistics',exact:true}).waitFor();
  await dashboard.close();await page.close();
  const live=await pageFor('driver','has-pbb.html','live');await live.locator('#gate-form').waitFor();await live.waitForFunction(()=>document.querySelector('#has-status').textContent.includes('Live ·'));await live.close();
  const hanging=await pageFor('driver','has-pbb.html','hang');await hanging.locator('#gate-form').waitFor();await hanging.clock.fastForward(36000);await hanging.waitForFunction(()=>document.querySelector('#has-status').textContent.includes('every 3 seconds'));await hanging.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: blocked direct API, same-origin account/header/dashboard, SSE, ended/stalled-stream polling fallback, gate sync, checklist creation and form preservation.');
 }finally{await browser.close();integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
