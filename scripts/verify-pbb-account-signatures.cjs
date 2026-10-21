const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),path=require('node:path');
const {createStore,registerPbb}=require('../pbb'),items=require('../public/public/pbb-data');
(async()=>{
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-21T16:00Z')});
 const users={admin:{uid:'admin',email:'lake@mu.com'},driver:{uid:'driver',email:'driver@example.com',provider:'password'},spotter:{uid:'spotter',email:'spotter@example.com',provider:'password'},unlinked:{uid:'unlinked',email:'unlinked@example.com',provider:'password'}};
 const integration=registerPbb(app,{store,authenticate:async req=>{const u=users[req.headers.authorization?.slice(7)];if(!u)throw Error('login');return u;},employeeSeed:[{id:'driver',name:'TEST DRIVER',nickname:'DRIVER NICK',eid:'00123',loginId:users.driver.email,attach:true,detach:true,spotter:false},{id:'spotter',name:'TEST SPOTTER',eid:'00456',loginId:users.spotter.email,attach:false,detach:false,spotter:true}]});app.use(express.static(path.resolve('public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 const contextFor=async who=>{const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(({origin,user,who})=>{window.MU_API_BASE=origin;window.fixtureUser=user&&{...user,getIdToken:async()=>who};},{origin,user:users[who]||null,who});await context.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:'window.firebase={apps:[{}],auth:()=>({currentUser:window.fixtureUser,onAuthStateChanged:fn=>fn(window.fixtureUser)})};'}));await context.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:''}));return context;};
 try{
 for(const [type,role,who] of [['arrival','driver','driver'],['arrival','spotter','spotter'],['departure','driver','driver'],['departure','spotter','spotter']]){
  const u=users[who],r=store.create({type,flightNo:'MU583',gate:'132',bridges:['L1']},u);store.mutate(r.id,u,{action:'claim',role});for(const item of items[type].filter(x=>!x.hidden&&x.roles.includes(role)))store.mutate(r.id,u,{action:'answer',role,itemId:item.id,value:'Y'});
  const context=await contextFor(who),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/pbb.html?record='+r.id);await page.locator('#signature').waitFor();
  if(type==='arrival'&&role==='spotter'){assert.equal(await page.locator('#sign-employee').inputValue(),'has-ops-ramp');assert.match(await page.locator('#sign-employee').innerText(),/HAS OPS RAMP/);}else{assert.equal(await page.locator('#sign-employee').count(),0);assert.equal(await page.locator('#signing-name').innerText(),who==='driver'?'TEST DRIVER':'TEST SPOTTER');assert.equal(await page.locator('#eid-display').innerText(),'EID: '+(who==='driver'?'00123':'00456'));}
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.reload();await page.locator('#signature').waitFor();
  if(type==='departure'&&role==='driver'){
   const box=await page.locator('#signature').boundingBox();await page.mouse.move(box.x+20,box.y+30);await page.mouse.down();await page.mouse.move(box.x+65,box.y+75);await page.mouse.up();
   const before=await page.locator('#signature').evaluate(canvas=>canvas.toDataURL());
   let data=integration.employees.get();data.employees.find(e=>e.id==='driver').detach=false;
   const response=await page.request.post(origin+'/employee-admin-api',{headers:{Authorization:'Bearer admin'},data});assert.equal(response.status(),200);
   await page.waitForFunction(()=>document.querySelector('#sign').disabled);assert.equal(await page.locator('#signature').evaluate(canvas=>canvas.toDataURL()),before);
   assert.equal(await page.locator('#no-qualified-message').isVisible(),true);
   data=integration.employees.get();data.employees.find(e=>e.id==='driver').detach=true;
   assert.equal((await page.request.post(origin+'/employee-admin-api',{headers:{Authorization:'Bearer admin'},data})).status(),200);
   await page.waitForFunction(()=>!document.querySelector('#sign').disabled);

  }
  const box=await page.locator('#signature').boundingBox();await page.mouse.move(box.x+20,box.y+30);await page.mouse.down();await page.mouse.move(box.x+65,box.y+75);await page.mouse.move(box.x+110,box.y+30);await page.mouse.up();await page.locator('#sign').click();await page.getByRole('heading',{name:'Checklist Done',exact:true}).waitFor();
  const sig=store.get(r.id).signatures[role];assert.equal(sig.employeeId,type==='arrival'&&role==='spotter'?'has-ops-ramp':who);assert.equal(sig.uid,who);
  await context.close();store.reset(r.id,{date:r.date,bridge:'L1',revision:store.get(r.id).revision});
 }
 const c=await contextFor('unlinked'),p=await c.newPage(),r=store.create({type:'departure',flightNo:'MU583',gate:'132',bridges:['L1']},users.unlinked);store.mutate(r.id,users.unlinked,{action:'claim',role:'driver'});for(const item of items.departure.filter(x=>!x.hidden&&x.roles.includes('driver')))store.mutate(r.id,users.unlinked,{action:'answer',role:'driver',itemId:item.id,value:'Y'});await p.goto(origin+'/pbb.html?record='+r.id);await p.locator('#signature').waitFor();assert.equal(await p.locator('#sign').isDisabled(),true);assert.equal(await p.locator('#no-qualified-message').isVisible(),true);await c.close();
 const anon=await contextFor('anonymous'),login=await anon.newPage();await login.route('**/login.html?**',r=>r.fulfill({contentType:'text/html',body:'Login'}));await login.goto(origin+'/pbb.html');await login.waitForURL('**/login.html?next=*');await anon.close();
 assert.deepEqual(errors,[]);console.log('PASS: all four account signature screens, Arrival ramp default, saved identity, reload, qualification checks, unlinked account, login redirect, 390/1440 layouts.');
 }finally{await browser.close();integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();integration.employees.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
