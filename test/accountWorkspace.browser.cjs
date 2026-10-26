const assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),app=express();app.use(express.json());
 const rows=[['bm','Business Manager','CZ'],['agent','Agent','CZ'],['supervisor','Supervisor','CZ'],['other','Business Manager','MU']].map(([id,position,account],i)=>({id,position,account,station:'LAX',name:id.toUpperCase()+' FIXTURE',eid:String(1001+i),email:id+'@example.test',loginId:id+'-original@example.test',attach:false,detach:false,spotter:false}));
 const store=require('../employees').createEmployeeStore(db,{seed:rows}),employees={...store,db},profiles=require('../employeeProfiles').createProfileStore(employees);
 const user={uid:'google-bm',email:'personal@example.test',provider:'google.com',emailVerified:true};profiles.link(user,{revision:store.get().revision,eid:'1001'});
 const authenticate=async()=>user;require('../employees').registerEmployees(app,{store,profiles,authenticate});
 const reports=require('../hasReports').registerHasReports(app,{employees,profiles,authenticate});
 const readSign=require('../readSign').registerReadSign(app,{employees,profiles,authenticate,send:async()=>{}});
 const body=subject=>({requestId:require('node:crypto').randomUUID(),subject,memoNumber:'',body:'Test account scope',deadline:'2099-12-31T12:00:00Z',attachments:[]});
 db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run('other','other','password',new Date().toISOString());
 const other=readSign.store.publish({uid:'other'},body('Foreign memo'));
 readSign.store.publish(user,body('Own account memo'));
 app.get('/profile-api',(_,res)=>res.json(profiles.status(user)));
 app.use(express.static('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:''}));await page.route('**/__/firebase/init.js',r=>r.fulfill({body:''}));
  await page.addInitScript(({base,user})=>{window.MU_API_BASE=base;const u={...user,providerData:[],getIdToken:async()=>user.uid};window.firebase={apps:[{}],auth:()=>({currentUser:u,onAuthStateChanged:fn=>{setTimeout(()=>fn(u),0);return()=>{};}})};},{base,user});
  await page.goto(base+'/admin.html');await page.locator('#employee-panel').waitFor({state:'visible'});
  await page.locator('[data-open-group]').click();assert.equal(await page.locator('[data-add-to]').count(),0);assert.equal(await page.locator('#add-employee').isVisible(),false);
  const agent=page.locator('tr[data-id="agent"]');await agent.locator('[name=nickname]').fill('Edited existing employee');await page.locator('#save-employees').click();await page.getByText('✓ Saved successfully',{exact:true}).waitFor();assert.equal(store.get().employees.find(e=>e.id==='agent').nickname,'Edited existing employee');
  assert.equal(await agent.locator('[data-main-account]').isDisabled(),true);
  assert.equal(await page.locator('tr[data-id="supervisor"] select[name=position]').inputValue(),'Supervisor');
  assert.equal(await page.locator('.profile-brand').getAttribute('href'),'/profile.html');
  fs.mkdirSync('output/account-workspace',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const link=page.getByRole('link',{name:'PBB checklist',exact:true});assert.equal(await link.isVisible(),true);assert.equal(await link.getAttribute('href'),'/has-pbb.html');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'output/account-workspace/admin-'+width+'.png',fullPage:true});}
  await page.goto(base+'/read-sign.html');await page.getByText('Own account memo',{exact:true}).first().waitFor();assert.equal(await page.getByText('Foreign memo',{exact:true}).count(),0);
  const response=await page.request.get(base+'/read-sign-api/'+other.id);assert.equal(response.status(),404);
  await page.addScriptTag({url:base+'/employee-sidebar-art.js'});assert.equal(await page.locator('.sidebar-pbb-checklist').count(),1);
  await page.locator('.profile-brand').click();await page.waitForURL('**/profile.html');
  assert.deepEqual(errors,[]);console.log('PASS: linked Google manager edits existing staff; no add controls; account assignments locked; brand Profile link; PBB shortcut and layout at 1440/390px; own-account memos and cross-account deep-link denial.');
 }finally{await browser.close();reports.close();readSign.close();server.closeAllConnections();server.close();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
