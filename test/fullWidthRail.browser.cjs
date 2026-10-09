const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1365,height:900}});
const errors=[];
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname==='unpkg.com')return route.fulfill({contentType:'text/javascript',body:''});
 if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
 if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`const user={email:'test@example.com',getIdToken:async()=>'fixture'};const fixtureAuth=()=>({currentUser:user,setPersistence:async()=>{},onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}});fixtureAuth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};window.firebase={apps:[{}],auth:fixtureAuth};`});
 if(url.hostname==='api.mufcapp.net'){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',day:'2-digit',month:'short',year:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return route.fulfill({contentType:'application/json',body:JSON.stringify({sy:{flightNo:'MU9578',flightDate:p.day+p.month.toUpperCase()+p.year,gate:'132',sd:'1230',ed:'1230'},flights:[{flightNo:'MU9578',flightDate:p.day+p.month.toUpperCase()+p.year,origin:'LAX',destination:'PVG',gate:'132',sd:'1230',ed:'1230',aircraftType:'777-773L',aircraftRegistration:'B7367'}],rows:[]})});
 }
 
 const file=path.join(process.cwd(),'public/public',url.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
 return route.fulfill({status:404,body:'Not found'});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));


await page.goto('http://localhost/flights.html');await page.locator('.flight-card').waitFor();assert.equal(await page.locator('.flight-card h2').innerText(),'MU9578');await page.locator('.flight-enter').first().click();await page.waitForURL('**/index.html');await page.locator('body:not(.is-loading)').waitFor();
assert.match(await page.locator('#active-flight').innerText(),/MU9578/);
await page.reload();await page.locator('body:not(.is-loading)').waitFor();assert.equal(await page.evaluate(()=>window.mufcFlight.flightNo),'MU9578');
fs.mkdirSync('.verification',{recursive:true});
for(const width of [1920,1365,390]){
 await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
 for(const short of [false,true]){
  await page.evaluate(short=>{document.querySelectorAll('.node').forEach((n,i)=>n.hidden=short&&i>3)},short);await page.waitForTimeout(100);
  for(const right of [false,true]){
   await page.locator('.timeline').evaluate((e,right)=>e.scrollLeft=right?e.scrollWidth:0,right);
   const metrics=await page.locator('.timeline-shell').evaluate(e=>{const s=getComputedStyle(e,'::after'),r=e.getBoundingClientRect(),t=e.querySelector('.timeline'),scanner=t.querySelector('.rail-scanner');return {width:parseFloat(s.width),left:r.left+parseFloat(s.left)-parseFloat(s.width)/2,top:parseFloat(s.top),scannerTop:t.offsetTop+parseFloat(scanner.style.top)+9,display:s.display,scroll:document.documentElement.scrollWidth,viewport:innerWidth}});
   assert.equal(metrics.width,width);assert(Math.abs(metrics.left)<1);assert(Math.abs(metrics.top-metrics.scannerTop)<1);assert.equal(metrics.display,'block');assert(metrics.scroll<=metrics.viewport+1);
  }
 }
 await page.evaluate(()=>document.querySelectorAll('.node').forEach(n=>n.hidden=false));await page.waitForTimeout(100);
 await page.screenshot({path:'.verification/full-rail-'+width+'.png',fullPage:true});
}
assert.deepEqual(errors,[]);await browser.close();console.log('PASS MU9578 selection/reload/dashboard and full-viewport rail on short/long timelines and both scroll ends at 1920/1365/390px');
})().catch(e=>{console.error(e);process.exit(1)});
