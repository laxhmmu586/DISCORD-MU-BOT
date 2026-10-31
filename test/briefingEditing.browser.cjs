const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const DATE='2026-10-31';
async function serve(){
 const express=require('express'),Database=require('better-sqlite3'),{registerBriefing}=require('../has/server/briefing'),{createEmployeeStore}=require('../has/server/employees');
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT);CREATE TABLE staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER,data TEXT)');
 const employees={...createEmployeeStore(db,{seed:[{id:'sup',name:'Test Supervisor',eid:'1001',position:'Supervisor',station:'LAX',account:'MU'},{id:'agent',name:'Test Agent',eid:'1002',position:'Agent',station:'LAX',account:'MU'}]}),db};
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run(DATE,JSON.stringify({assignments:{sup:{code:'A'},agent:{code:'A'}}}));
 const app=express();app.use(express.json());let booking={bookingF:'1',bookingJ:'55',bookingY:'248'};
 registerBriefing(app,{employees,profiles:{linked:user=>employees.get().employees.find(e=>e.id===user.uid)},authenticate:async req=>({uid:(req.headers.authorization||'').replace('Bearer ','')}),now:()=>new Date(DATE+'T18:00:00Z'),booking:{read:async()=>({status:'available',fields:booking})},etab:{read:async()=>({status:'unavailable'})}});
 require('../has/server/staffSchedule').registerStaffSchedule(app,{employees,profiles:{linked:user=>employees.get().employees.find(e=>e.id===user.uid)},authenticate:async req=>({uid:(req.headers.authorization||'').replace('Bearer ','')}),now:()=>new Date(DATE+'T18:00:00Z')});
 app.post('/test-reset',(req,res)=>{db.exec('DELETE FROM briefing_records;DELETE FROM briefing_audit');booking={bookingF:'1',bookingJ:'55',bookingY:'248'};res.json({ok:true});});
 app.post('/test-booking',(req,res)=>{booking=req.body;res.json({ok:true});});
 app.get('/profile-api',(req,res)=>res.json({state:'ready',profile:{name:'Test Supervisor',station:'LAX',account:'MU',canViewOperations:true}}));app.get('/has-report-api/context',(req,res)=>res.json({permissions:{},canAdmin:false}));
 app.use(require('../has/static').withShared(path.join(__dirname,'../public/public')));
 const server=app.listen(Number(process.env.BRIEFING_TEST_PORT||0),'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 return {origin:'http://127.0.0.1:'+server.address().port,close:()=>{server.closeAllConnections();server.close();db.close();}};
}
(async()=>{
 if(process.argv.includes('--serve')){console.log((await serve()).origin);return;}
 const fixture=process.env.BRIEFING_TEST_ORIGIN?null:await serve(),origin=fixture?.origin||process.env.BRIEFING_TEST_ORIGIN;
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true}),page=await browser.newPage(),errors=[];
 try{
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(DATE+'T18:00:00Z'));
  await page.route('**/www.gstatic.com/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(origin)};const user={uid:'sup',email:'fixture@example.test',providerData:[],getIdToken:async()=>'sup'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return ()=>{};}})};`}));
  fs.mkdirSync('.verification/briefing-editing',{recursive:true});
  await page.request.post(origin+'/test-reset');await page.goto(origin+'/briefing.html');await page.locator('.roster-person').first().waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});for(const direction of ['arrival','departure']){
   console.log('Checking Details',width,direction);await page.locator('#'+direction+'-tab').click();await page.waitForFunction(f=>document.querySelector('#briefing-flight').value===f&&!document.querySelector('#arrival-content').hidden,direction==='arrival'?'MU583':'MU586');
   
   const input=page.locator('#briefing-details'),text=direction+' '+width+' 中文 details';await input.fill(text);await input.evaluate(el=>el.setSelectionRange(3,3));
   await page.waitForFunction(()=>document.querySelector('#briefing-status').textContent==='All changes saved.');
   // A real SSE update applies permissions/layout while the textarea stays focused.
   await page.request.post(origin+'/briefing-api',{headers:{Authorization:'sup'},data:{date:DATE,flight:direction==='arrival'?'MU583':'MU586',field:'rushBags',previous:'',value:direction+width}});
   await page.waitForFunction(value=>document.querySelector('[data-field="rushBags"]').value===value,direction+width);
   assert.equal(await input.evaluate(el=>document.activeElement===el),true,'Live updates retain Details focus');assert.equal(await input.evaluate(el=>el.selectionStart),3,'Autosave retains caret');
   await page.keyboard.insertText('继续');assert.equal(await input.inputValue(),text.slice(0,3)+'继续'+text.slice(3));
   await page.waitForFunction(()=>document.querySelector('#briefing-status').textContent==='All changes saved.');
   const key='?date='+DATE+'&flight='+(direction==='arrival'?'MU583':'MU586');assert.equal((await (await page.request.get(origin+'/briefing-api'+key,{headers:{Authorization:'sup'}})).json()).fields.details,await input.inputValue());
   const state=await (await page.request.get(origin+'/briefing-api'+key,{headers:{Authorization:'sup'}})).json();await page.request.post(origin+'/briefing-api',{headers:{Authorization:'sup'},data:{date:DATE,flight:state.flight,field:'rushBags',previous:state.fields.rushBags,value:''}});
   await page.screenshot({path:'.verification/briefing-editing/'+direction+'-'+width+'.png',fullPage:true});
  }}
  await page.setViewportSize({width:1440,height:1000});
  for(const [c,value] of [['F','1'],['J','55'],['Y','248']])assert.equal(await page.locator('[data-field="booking'+c+'"]').inputValue(),value);
  assert.equal(await page.locator('#booking-total').textContent(),'304 + 0');assert.equal(await page.locator('#booking-plf').textContent(),'97%');
  await page.locator('[data-field="bookingJ"]').fill('50');await page.locator('h1').click();await page.waitForFunction(()=>document.querySelector('#briefing-status').textContent==='All changes saved.');
  await page.request.post(origin+'/test-booking',{data:{bookingF:'2',bookingJ:'56',bookingY:'249'}});await page.waitForFunction(()=>document.querySelector('[data-field="bookingF"]').value==='2');assert.equal(await page.locator('[data-field="bookingJ"]').inputValue(),'50');
  await page.reload();await page.locator('#arrival-content').waitFor({state:'visible'});await page.locator('#departure-tab').click();await page.waitForFunction(()=>document.querySelector('[data-field="bookingJ"]').value==='50');
  await page.locator('[data-field="bookingJ"]').fill('');await page.locator('h1').click();await page.waitForFunction(()=>document.querySelector('[data-field="bookingJ"]').value==='56');
  console.log('Checking Home');await page.goto(origin+'/home.html');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('workspace-profile',{detail:{user:{uid:'sup'},profile:{station:'LAX',account:'MU',canViewOperations:true}}})));
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('#home-today-team-toggle').click();await page.locator('#home-today-team-list li').first().waitFor();assert.equal(await page.locator('#home-today-team-list li').count(),2);assert(await page.locator('#home-today-team').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));await page.screenshot({path:'.verification/briefing-editing/home-team-'+width+'.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('#home-today-team').isVisible(),false);}
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('workspace-profile',{detail:{user:null,profile:null}})));assert.equal(await page.locator('#home-today-team-toggle').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile Arrival/Departure retain focus, caret, Chinese text and saved values across live updates; SY bookings refresh and preserve manual overrides; homepage Today Team works at desktop/mobile widths and clears on sign-out.');
 }finally{await browser.close();fixture?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
