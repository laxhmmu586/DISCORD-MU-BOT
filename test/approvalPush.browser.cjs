const assert=require('node:assert/strict'),express=require('express'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const app=express(),registrations=[];let deviceState={registered:false,enabled:false},failNext=false;
 app.use(express.json());
 app.get('/',(_,res)=>res.type('html').send(`<html><head><link rel="stylesheet" href="/has/workspace-glass.css"><link rel="stylesheet" href="/has/home.css"></head><body class="home-page workspace-glass"><header><div id="flight-account" class="flight-account"></div></header><script>
 let permission=localStorage.getItem('test-permission')||'default';window.permissionCalls=0;Object.defineProperty(Notification,'permission',{get:()=>permission});Notification.requestPermission=async()=>{permissionCalls++;localStorage.setItem('test-permission','granted');return permission='granted';};window.MU_API_BASE=location.origin;const user={uid:'lake',email:'lake@mu.com',providerData:[],getIdToken:async()=>'test'};const auth={currentUser:user,onAuthStateChanged:fn=>setTimeout(()=>fn(user),0)};window.firebase={apps:[{}],auth:()=>auth,messaging:Object.assign(()=>({getToken:async()=>'test-token-at-least-twenty-characters'}),{isSupported:async()=>true})};</script><script src="/has/flight-account.js"></script></body></html>`));
 app.get('/profile-api',(_,res)=>res.json({state:'ready',profile:{name:'Lake',station:'LAX',account:'MU'}}));
 app.get('/notification-api/config',(_,res)=>res.json({configured:true,vapidKey:'test-public-key'}));
 app.get('/notification-api/device',(_,res)=>res.json(deviceState));
 app.post('/notification-api/device',(req,res)=>{if(failNext){failNext=false;return res.status(503).json({error:'Unable to save notification settings.'});}registrations.push(req.body);deviceState={registered:true,enabled:req.body.enabled!==false};res.json({ok:true});});
 app.use(require('../has/static').withShared(path.resolve('public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.goto(origin);await page.waitForFunction(()=>typeof window.mufcDisablePush==='function');
  assert.equal(await page.evaluate(()=>permissionCalls),0);await page.locator('.login-button').click();
  const order=await page.locator('.login-menu button').evaluateAll(els=>els.filter(e=>!e.hidden).map(e=>e.id));assert.equal(order.indexOf('enable-notifications')+1,order.indexOf('logout'));
  const toggle=page.getByRole('switch',{name:'Notifications',exact:true});assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('#enable-notifications').getAttribute('aria-checked')==='true');
  assert.equal(await page.evaluate(()=>permissionCalls),1);assert.equal(registrations.length,1);
  await page.screenshot({path:'output/push-notifications-menu-enabled.png',animations:'disabled'});
  failNext=true;await toggle.click();await page.getByRole('status').filter({hasText:'Unable to save'}).waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'true');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('#enable-notifications').getAttribute('aria-checked')==='false');assert.equal(registrations.at(-1).enabled,false);
  await page.screenshot({path:'output/push-notifications-menu.png',animations:'disabled'});
  const afterOff=registrations.length;await page.reload();await page.waitForFunction(()=>typeof window.mufcDisablePush==='function');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('.login-button').click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(registrations.length,afterOff);
  await page.evaluate(()=>localStorage.removeItem('mufc-push-enabled:lake'));await Promise.all([page.waitForResponse(r=>r.url().includes('/notification-api/device?')),page.reload()]);await page.locator('.login-button').click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(registrations.length,afterOff);
  await toggle.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('#enable-notifications').getAttribute('aria-checked')==='true');assert.equal(await page.evaluate(()=>permissionCalls),0);
  await page.evaluate(()=>window.mufcDisablePush());assert.equal(registrations.at(-1).enabled,false);
  const ios=await browser.newPage();await ios.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'iPhone'}));await ios.goto(origin);await ios.waitForFunction(()=>typeof window.mufcDisablePush==='function');await ios.locator('.login-button').click();await ios.getByRole('switch',{name:'Notifications',exact:true}).click();assert.equal(await ios.evaluate(()=>permissionCalls),0);await ios.getByRole('status').filter({hasText:'主屏幕'}).waitFor();await ios.close();
  console.log('Browser passed: accessible on/off switch, menu placement, explicit permission, disable failure recovery, refresh/visibility and server opt-out persistence, keyboard re-enable, device logout, iPhone prerequisite.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
