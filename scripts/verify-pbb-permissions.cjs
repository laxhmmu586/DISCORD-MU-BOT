const path=require('path'),fs=require('fs'),assert=require('node:assert/strict'),express=require('express'),{chromium}=require('playwright');
const root=process.argv[2]||path.resolve(__dirname,'..'),{createStore,registerPbb}=require(path.join(root,'pbb')),items=require(path.join(root,'public/public/pbb-data'));
const adminUser={uid:'admin',email:'lake@mu.com'},seed=[{id:'attach',name:'ATTACH ONLY',eid:'00123',attach:true,detach:false,spotter:false},{id:'detach',name:'DETACH ONLY',eid:'00456',attach:false,detach:true,spotter:false},{id:'legacy',name:'LEGACY DRIVER',eid:'',driver:true,spotter:true}];
(async()=>{
 fs.mkdirSync(path.join(root,'output'),{recursive:true});
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});const integration=registerPbb(app,{store,employeeSeed:seed,authenticate:async()=>adminUser,gateService:{read:async()=>({status:'unavailable'})}});app.use(require('../has/static').withShared(path.join(root,'public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(({origin})=>{window.MU_API_BASE=origin;window.fixtureUser={email:'lake@mu.com',uid:'admin',getIdToken:async()=>'admin'};},{origin});
  await context.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:'window.firebase={apps:[{}],auth:()=>({currentUser:window.fixtureUser,onAuthStateChanged:fn=>fn(window.fixtureUser)})};'}));await context.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:''}));context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const admin=await context.newPage();await admin.goto(origin+'/admin.html');await admin.locator('#employee-panel').waitFor({state:'visible'});
  assert.equal(await admin.getByRole('columnheader',{name:'PBB Attach',exact:true}).count(),1);assert.equal(await admin.getByRole('columnheader',{name:'PBB Detach',exact:true}).count(),1);
  assert.equal(await admin.locator('#employees tr').nth(2).locator('[name=attach]').isChecked(),true);assert.equal(await admin.locator('#employees tr').nth(2).locator('[name=detach]').isChecked(),true);
  for(const width of [1440,1101,390]){await admin.setViewportSize({width,height:1000});assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await admin.screenshot({path:path.join(root,`output/admin-permissions-${width}.png`),fullPage:true});}
  const session=await(await fetch(origin+'/pbb-api/session',{method:'POST'})).json();await context.addInitScript(session=>{if(location.protocol==='http:')localStorage.setItem('mufc-pbb-session',JSON.stringify(session));},session);
  for(const [type,allowed,denied,eid] of [['arrival','attach','detach','00123'],['departure','detach','attach','00456']]){
   const user={uid:session.uid},r=store.create({type,flightNo:'MU583',gate:'132',bridges:['L2'],blockTime:'09:05'},user);
   for(const role of ['driver','spotter']){store.mutate(r.id,user,{action:'claim',role});for(const item of items[type].filter(x=>!x.hidden&&x.roles.includes(role)))store.mutate(r.id,user,{action:'answer',role,itemId:item.id,value:'Y'});}
   for(const [phase,role] of [['ready','driver'],['safe','spotter'],['go','driver']])if(type==='departure'||phase!=='ready')store.mutate(r.id,user,{action:'signal',role,phase});
   const page=await context.newPage();await page.goto(origin+'/pbb.html?record='+r.id);await page.locator('[data-role=driver]').click();
   for(let i=0;i<25;i++){if(await page.locator('#sign-employee').count())break;const next=page.locator('#next, #signal-next');await next.click();await page.waitForTimeout(70);}
   await page.locator('#sign-employee').waitFor();assert.equal(await page.locator(`#sign-employee option[value=${allowed}]`).count(),1);assert.equal(await page.locator(`#sign-employee option[value=${denied}]`).count(),0);
   await page.locator('#sign-employee').selectOption(allowed);assert.equal(await page.locator('#eid-display').textContent(),'EID: '+eid);
   await admin.locator(`#employees tr[data-id=${allowed}] [name=${allowed}]`).uncheck();await admin.locator('#save-employees').click();await admin.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();await page.waitForFunction(id=>!document.querySelector(`#sign-employee option[value=${id}]`),allowed);assert.equal(await page.locator('#sign-employee').inputValue(),'');assert.equal(await page.locator('#eid-display').textContent(),'EID: —');
   await admin.locator('#employees tr[data-id=legacy] [name='+allowed+']').uncheck();await admin.locator('#save-employees').click();await page.waitForFunction(()=>document.querySelector('#sign-employee').options.length===1);assert.equal(await page.locator('#sign').isDisabled(),true);
   await page.reload();await page.locator('[data-role=driver]').click();for(let i=0;i<25;i++){if(await page.locator('#sign-employee').count())break;await page.locator('#next, #signal-next').click();await page.waitForTimeout(70);}await page.locator('#no-qualified-message').waitFor();assert.match(await page.locator('#no-qualified-message').textContent(),type==='arrival'?/enable PBB Attach/:/enable PBB Detach/);
   await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile administration, legacy permissions, Arrival/Departure name isolation, EID, live permission revocation, and empty qualification hints.');
 }finally{await browser.close();integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
})().catch(e=>{console.error(e);process.exit(1)});
