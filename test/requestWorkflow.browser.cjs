const fs=require('node:fs'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),seed=['Agent','Supervisor','Supervisor','Manager','Regional Manager','General Manager'].map((position,i)=>({id:'e'+i,name:'EXAMPLE PERSON '+i,position,eid:'100'+i,phone:'626-555-0100',email:'person'+i+'@example.test',companyEmail:'person'+i+'@company.test',loginId:'person'+i+'@login.test',attach:false,detach:false,spotter:false}));
 const employees={...require('../has/server/employees').createEmployeeStore(db,{seed}),db},profiles={linked:u=>employees.get().employees.find(e=>e.id===u.uid)},users=seed.map(e=>({uid:e.id,email:e.loginId}));
 const app=express();app.use(express.json());const authenticate=async req=>{const u=users.find(u=>req.headers.authorization==='Bearer '+u.uid);if(!u)throw Error('Sign in required');return u;};
 app.get('/profile-api',async(req,res)=>res.json({state:'ready',profile:profiles.linked(await authenticate(req)),revision:employees.get().revision}));
 let sent=0;const service=require('../has/server/uniformRequests').registerUniform(app,{employees,profiles,authenticate,notify:async()=>{},send:async()=>{sent++;}});app.use(require('../has/static').withShared('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];let who=0;page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.route('https://www.gstatic.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const user={...${JSON.stringify(users[who])},getIdToken:async()=>${JSON.stringify(users[who].uid)},providerData:[]};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>setTimeout(()=>fn(user),0)})};`}));
  const open=async i=>{who=i;await page.goto(base+'/request.html');await page.locator('#uniform-content').waitFor({state:'visible'});};
  await open(0);await page.locator('#request-type').selectOption('uniform');let work=page.locator('#uniform-form-progress');
  assert.equal(await work.locator('[role=tab]').count(),0);assert.equal(await work.locator('.oa-track>li').count(),3);
  await work.locator('[data-edit-route]').click();await work.locator('[data-node-index="0"] [data-node-person]').selectOption('e1');await work.locator('[data-node-index="1"] [data-node-person]').selectOption('e3');
  await work.locator('[data-add-node]').click();await work.locator('[data-node-index="2"] [data-node-position]').selectOption('Regional Manager');await work.locator('[data-node-index="2"] [data-node-person]').selectOption('e4');await work.locator('[data-save-route]').click();
  assert.equal(await work.locator('.oa-track>li').count(),4);
  fs.mkdirSync('.verification/request-workflow',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const boxes=await work.locator('.oa-track>li').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,bottom:b.bottom};}));assert(boxes.every((b,i)=>!i||Math.abs(b.x-boxes[0].x)<1&&b.y>=boxes[i-1].bottom));await page.locator('#uniform-progress-panel').screenshot({path:`.verification/request-workflow/draft-${width}.png`});}
  await page.locator('#uniform-reason').selectOption('annual');await page.locator('#uniform-items tr').first().locator('[data-key=size]').fill('38');await page.locator('#uniform-items tr').first().locator('[data-key=pieces]').fill('1');await page.locator('#uniform-form button[type=submit]').click();await page.locator('#uniform-status').filter({hasText:'Request submitted'}).waitFor();
  const id=service.store.list(users[0]).requests[0].id;
  assert.deepEqual(service.store.get(id).assignees,['e1','e3','e4']);
  await open(1);await page.locator('#request-'+id+' textarea').fill('Checked uniform sizes');await page.locator('#request-'+id).getByRole('button',{name:'Approve',exact:true}).click();await page.locator('#uniform-status').filter({hasText:'Approval recorded'}).waitFor();
  await open(0);work=page.locator('#request-'+id);assert.match(await work.locator('.oa-track>li').nth(1).textContent(),/EXAMPLE PERSON 1.*Processed at.*Action.*Approved.*Remark.*Checked uniform sizes/s);await work.locator('[data-edit-route]').click();assert(await work.locator('[data-node-index="0"] [data-node-person]').isDisabled());assert(await work.locator('[data-remove-node="1"]').isDisabled());
  await work.locator('[data-node-index="1"] [data-node-person]').selectOption('e2');await work.locator('[data-add-node]').click();await work.locator('[data-node-index="3"] [data-node-position]').selectOption('General Manager');await work.locator('[data-node-index="3"] [data-node-person]').selectOption('e5');await work.locator('[data-save-route]').click();await page.locator('#uniform-status').filter({hasText:'Approval nodes updated'}).waitFor();
  assert.equal(service.store.get(id).routeHistory.length,1);await work.locator('[data-flow-section=log] summary').click();assert.match(await work.locator('[data-flow-section=log] tbody').textContent(),/Nodes adjusted/);assert.match(await work.locator('[data-flow-section=log] tbody').textContent(),/EXAMPLE PERSON 2/);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await work.screenshot({path:`.verification/request-workflow/log-${width}.png`});}
  await open(3);assert.equal(await page.locator('#request-'+id).count(),0);
  for(const reviewer of [2,4,5]){await open(reviewer);await page.locator('#request-'+id).getByRole('button',{name:'Approve',exact:true}).click();await page.locator('#uniform-status').filter({hasText:'Approval recorded'}).waitFor();}
  assert.equal(service.store.get(id).status,'approved');assert.equal(service.store.get(id).manager.id,'e5');await service.deliver(id);assert.equal(sent,1);
  await open(0);work=page.locator('#request-'+id);assert.equal(await work.locator('[data-edit-route]').count(),0);await work.locator('[data-flow-section=form] summary').click();assert.match(await work.locator('.request-form-snapshot').textContent(),/EXAMPLE PERSON 0/);assert.equal(await work.locator('.oa-track>li').count(),5);assert.deepEqual(errors,[]);
  console.log('PASS: vertical existing-style workflow nodes, draft named routing, post-submit future-node edits, completed locks, audit log, completed operator/time/action/remark rows, revised approval authority, higher final approver and single delivery; 1440/390px.');
 }finally{await browser.close();service.close();server.closeAllConnections();server.close();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
