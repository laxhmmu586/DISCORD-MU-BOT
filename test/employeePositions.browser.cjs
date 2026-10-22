const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const express=require('express'),Database=require('better-sqlite3');
(async()=>{
 const db=new Database(':memory:');
 const seed=['Agent','Senior Supervisor','Business Manager'].map((position,i)=>({id:'e'+i,name:'EXISTING EMPLOYEE '+i,position,eid:'100'+i,phone:'626-555-0100',email:'person'+i+'@example.test',companyEmail:'person'+i+'@company.test',loginId:i===2?'lake@mu.com':'person'+i+'@login.test',discordId:'',attach:false,detach:false,spotter:false}));
 const employees={...require('../employees').createEmployeeStore(db,{seed}),db},users=seed.map(e=>({uid:e.id,email:e.loginId}));
 const profiles={linked:u=>employees.get().employees.find(e=>e.id===u.uid)};
 const app=express();app.use(express.json());
 const authenticate=async req=>{const u=users.find(u=>req.headers.authorization==='Bearer '+u.uid);if(!u)throw Error('Sign in required');return u;};
 require('../employees').registerEmployees(app,{store:employees,authenticate});
 app.get('/profile-api',async(req,res)=>{const user=await authenticate(req);res.json({state:'ready',revision:employees.get().revision,profile:profiles.linked(user)});});
 const service=require('../uniformRequests').registerUniform(app,{employees,profiles,authenticate,notify:async()=>{},send:async()=>{}});
 app.use(express.static('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];let who=2;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.gstatic.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const user={...${JSON.stringify(users[who])},getIdToken:async()=>${JSON.stringify(users[who].uid)},providerData:[]};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>setTimeout(()=>fn(user),0)})};`}));
  await page.goto(base+'/admin.html');await page.locator('#employee-panel').waitFor({state:'visible'});
  const select=page.locator('select[name=position]').first(),options=await select.locator('option').allTextContents();
  assert(options.includes('President'));assert(options.includes('Airport Operations Manager'));assert(options.includes('Business Manager'));assert(options.includes('Agent'));assert(!options.includes('CSA'));assert.equal(options.filter(s=>s==='Business Manager').length,1);assert(!options.some(s=>/airlines/i.test(s)));
  const identities=await page.locator('input[name=name]').evaluateAll(inputs=>inputs.map(input=>input.value));
  await select.selectOption('HQ Corporate Instructor');await page.locator('#save-employees').click();await page.getByText('✓ Saved successfully',{exact:false}).waitFor();
  assert.deepEqual(employees.get().employees.map(e=>e.name),identities);
  await select.selectOption('Agent');await page.locator('#save-employees').click();await page.getByText('✓ Saved successfully',{exact:false}).waitFor();
  await page.locator('#approval-workflow').click();await page.waitForURL('**/approval-workflow.html');await page.locator('#workflow-content').waitFor({state:'visible'});
  assert.equal(await page.locator('#workflow-dialog').count(),0);
  await page.locator('[data-stage="0"]').click();await page.locator('#stage-position').selectOption('Senior Supervisor');
  await page.locator('[data-insert="1"]').click();await page.locator('#stage-position').selectOption('President');
  assert.match(await page.locator('#stage-reviewers').textContent(),/No employees/);
  await page.locator('#stage-up').click();assert.match(await page.locator('[data-stage="0"]').textContent(),/President/);
  await page.locator('#stage-down').click();await page.locator('#stage-remove').click();
  await page.locator('[data-stage="1"]').click();await page.locator('#stage-position').selectOption('Business Manager');
  assert.match(await page.locator('#stage-reviewers').textContent(),/EXISTING EMPLOYEE 2/);
  assert.equal(await page.locator('#stage-remove').isDisabled(),true);
  await page.locator('#save-workflow').click();await page.getByText('Workflow saved. New requests will use this route.').waitFor();
  assert.deepEqual(service.store.workflow().stages,['Senior Supervisor','Business Manager']);
  await page.reload();await page.locator('#workflow-content').waitFor({state:'visible'});assert.match(await page.locator('[data-stage="1"]').textContent(),/Business Manager/);
  fs.mkdirSync('.verification/org-chart',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`.verification/org-chart/admin-${width}.png`,fullPage:true});}
  who=0;await page.goto(base+'/request.html');await page.locator('#uniform-content').waitFor({state:'visible'});await page.locator('#request-type').selectOption('uniform');
  assert.match(await page.locator('#uniform-form-progress').textContent(),/Senior Supervisor/);assert.match(await page.locator('#uniform-form-progress').textContent(),/Business Manager/);assert.match(await page.locator('#uniform-form-progress').textContent(),/EXISTING EMPLOYEE 1/);assert.match(await page.locator('#uniform-form-progress').textContent(),/EXISTING EMPLOYEE 2/);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`.verification/org-chart/request-${width}.png`,fullPage:true});}
  assert.deepEqual(errors,[]);console.log('PASS: HQ/station options, Agent=CSA, standalone Business Manager, saved names unchanged, workflow persistence and Request reviewer names at desktop/mobile sizes.');
 }finally{if(browser)await browser.close();service.close();server.close();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
