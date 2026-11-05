const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),app=express();let time=Date.now();
 const rows=[
  {id:'bm',name:'MU BUSINESS MANAGER',position:'Business Manager',station:'LAX',account:'MU',email:'bm@example.test'},
  {id:'sup',name:'MU SUPERVISOR',position:'Supervisor',station:'LAX',account:'MU',email:'sup@example.test',reportsTo:'bm'},
  {id:'agent',name:'MU EMPLOYEE',position:'Agent',station:'LAX',account:'MU',email:'agent@example.test',reportsTo:'sup'},
  {id:'ci',name:'CI MANAGER',position:'Business Manager',station:'LAX',account:'CI',email:'ci@example.test'},
  {id:'safety',name:'SAFETY ADVOCATE',position:'Safety Advocate',station:'HQ',account:'HQ',email:'safety@example.test'},
  {id:'hq',name:'HQ SAFETY MANAGER',position:'HQ Safety & Security Manager',station:'HQ',account:'HQ',email:'hq@example.test'}
 ];
 const employees={db,get:()=>({employees:rows})},profiles={linked:user=>rows.find(person=>person.id===user.uid)};
 const authenticate=async req=>{const uid=req.headers.authorization?.replace('Bearer ','');if(!rows.some(person=>person.id===uid))throw Error('Sign in');return {uid,email:uid+'@example.test'};};
 const service=require(root+'/has/server/readSign').registerReadSign(app,{employees,profiles,authenticate,now:()=>new Date(time),send:async()=>{}});
 require(root+'/has/server/workspacePagePermissions').registerWorkspacePagePermissions(app,{employees,profiles,authenticate});
 app.get('/profile-api',(req,res)=>{const person=rows.find(person=>person.id===req.headers.authorization?.replace('Bearer ',''));res.json({state:'ready',profile:{...person,canViewOperations:true,canViewForm:true}});});
 app.use(require(root+'/has/static').withShared(root+'/public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const draft=subject=>({requestId:crypto.randomUUID(),subject,memoNumber:'SOP-TEST',body:'Please review the safety memo and sign.',deadline:new Date(time+86400000).toISOString(),targetAccount:'ALL',attachments:[]});
 const memo=service.store.publish({uid:'safety'},draft('All-account safety memo'));
 service.store.publish({uid:'ci'},{...draft('CI private memo'),targetAccount:JSON.stringify(['LAX','CI'])});
 const signed={acknowledged:true,strokes:[[[.1,.7],[.2,.2],[.3,.8],[.4,.4],[.5,.6],[.7,.3],[.8,.5]]]};
 for(const uid of ['bm','sup','agent'])service.store.sign({uid},memo.id,signed);
 const browser=await chromium.launch({channel:'msedge',headless:true}),out=path.resolve('.verification/read-sign-account-reports');fs.mkdirSync(out,{recursive:true});
 const errors=[];
 async function pageFor(uid,width=1440){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://www.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'application/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const user={uid:${JSON.stringify(uid)},email:${JSON.stringify(uid+'@example.test')},providerData:[],getIdToken:async()=>${JSON.stringify(uid)}};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged(fn){fn(user);return()=>{}}})};`}));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install({time:new Date(time)});
  await page.goto(base+'/read-sign.html?memo='+memo.id);await page.locator('#rs-subject').filter({hasText:'All-account safety memo'}).waitFor();return page;
 }
 try{
  const bm=await pageFor('bm');
  assert(!(await bm.locator('#rs-list').innerText()).includes('CI private memo'));
  assert.equal(await bm.locator('#rs-register tr').count(),3);
  await bm.locator('#publish-memo').click();assert.deepEqual(await bm.locator('#memo-account option').allTextContents(),['LAX / MU']);await bm.locator('#close-compose').click();
  await bm.locator('#rs-send-completion').click();await bm.locator('#rs-completion-status').filter({hasText:'2:00'}).waitFor();
  await bm.reload();await bm.locator('#rs-cancel-completion').waitFor({state:'visible'});await bm.locator('#rs-cancel-completion').click();await bm.locator('#rs-send-completion').waitFor({state:'visible'});
  await bm.locator('#rs-send-completion').click();await bm.locator('#rs-completion-status').filter({hasText:'2:00'}).waitFor();
  await bm.locator('#rs-completion').scrollIntoViewIfNeeded();await bm.screenshot({path:out+'/manager-countdown.png'});
  const safety=await pageFor('safety');await safety.locator('#rs-report-count').scrollIntoViewIfNeeded();await safety.waitForTimeout(100);await safety.clock.runFor(1800);assert.match(await safety.locator('#rs-report-count').innerText(),/^0 \/ 3/);
  await safety.locator('#publish-memo').click();assert((await safety.locator('#memo-account option').allTextContents()).includes('All accounts'));await safety.locator('#close-compose').click();
  time+=120000;await bm.clock.fastForward(120000);await bm.locator('#rs-completion-status').filter({hasText:'Completion sent to Safety.'}).waitFor();
  await safety.clock.fastForward(120000);await safety.waitForTimeout(100);await safety.clock.runFor(1800);await safety.locator('#rs-report-count').filter({hasText:'1 / 3'}).waitFor();
  await safety.locator('.rs-account-card[data-account=MU]').click();assert.equal(await safety.locator('#rs-report-list tbody tr').count(),3);assert.equal(await safety.locator('#rs-report-list img').count(),3);
  await safety.locator('#rs-report-count').scrollIntoViewIfNeeded();await safety.screenshot({path:out+'/safety-report.png'});
  const hq=await pageFor('hq',390);await hq.locator('#rs-report-count').scrollIntoViewIfNeeded();await hq.waitForTimeout(100);await hq.clock.runFor(1800);assert.match(await hq.locator('#rs-report-count').innerText(),/^1 \/ 3/);await hq.locator('.rs-account-card[data-account=MU]').click();
  await hq.locator('#rs-report-count').scrollIntoViewIfNeeded();await hq.screenshot({path:out+'/mobile-safety.png'});
  rows.push({id:'extra',name:'ADDITIONAL MU EMPLOYEE',position:'Agent',station:'LAX',account:'MU',email:'extra@example.test',reportsTo:'sup'});
  service.store.addRecipients({uid:'safety'},memo.id,{employeeIds:['extra']});
  time+=15000;await safety.clock.fastForward(15000);await safety.waitForTimeout(100);await safety.clock.runFor(1800);await safety.locator('.rs-account-card[data-account=MU]').filter({hasText:'75%'}).waitFor();
  assert.equal(await safety.locator('#rs-report-list tbody tr').count(),4);assert.equal(await safety.locator('#rs-report-list img').count(),3);
  await bm.clock.fastForward(15000);await bm.locator('#rs-completion-status').filter({hasText:'update automatically'}).waitFor();assert(await bm.locator('#rs-send-completion').isHidden());
  service.store.sign({uid:'extra'},memo.id,signed);
  time+=15000;await safety.clock.fastForward(15000);await safety.waitForTimeout(100);await safety.clock.runFor(1800);await safety.locator('.rs-account-card[data-account=MU]').filter({hasText:'100%'}).waitFor();assert.equal(await safety.locator('#rs-report-list img').count(),4);
  await safety.locator('#rs-report-count').scrollIntoViewIfNeeded();await safety.screenshot({path:out+'/safety-report.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS browser account isolation, BM recipients, send/cancel/reload, server countdown, automatic Safety reports, signatures, mobile.');
 }finally{await browser.close();service.close();server.closeAllConnections();server.close();db.close();}
})().catch(error=>{console.error(error);process.exit(1)});
