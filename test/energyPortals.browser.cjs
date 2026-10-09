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
  return route.fulfill({contentType:'application/json',body:JSON.stringify({sy:{flightNo:'MU586',flightDate:p.day+p.month.toUpperCase()+p.year,gate:'134',bdt:'1230',sd:'1245',ed:'1300'},flights:[{flightNo:'MU586',flightDate:p.day+p.month.toUpperCase()+p.year,origin:'LAX',destination:'PVG',gate:'134',bdt:'1230',sd:'1245',ed:'1300',aircraftType:'777-773L',aircraftRegistration:'B7367'}],rows:[]})});
 }

 const file=path.join(process.cwd(),'public/public',url.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
 return route.fulfill({status:404,body:'Not found'});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));


await page.goto('http://localhost/flights.html');await page.locator('.flight-card').waitFor();assert.equal(await page.locator('.flight-card h2').innerText(),'MU586');await page.locator('.flight-enter').first().click();await page.waitForURL('**/index.html');await page.locator('body:not(.is-loading)').waitFor();
assert.match(await page.locator('#active-flight').innerText(),/MU586/);
await page.reload();await page.locator('body:not(.is-loading)').waitFor();assert.equal(await page.evaluate(()=>window.mufcFlight.flightNo),'MU586');
fs.mkdirSync('.verification',{recursive:true});
const labels=await page.locator('.status-metric--energy > span').allTextContents();
assert.deepEqual(labels,['GATE','BDT','ETD']);
assert.equal(await page.locator('#metric-gate').innerText(),'134');
assert.equal(await page.locator('#metric-bdt').innerText(),'1230');
assert.equal(await page.locator('#metric-etd').innerText(),'1300');
// Only ED changes: skipUnchanged must still render the new estimated departure.
await page.evaluate(()=>updateFlightFromSy({...currentSy,ed:'1330'},{skipUnchanged:true}));
assert.equal(await page.locator('#metric-etd').innerText(),'1330');
await page.evaluate(()=>updateFlightFromSy({...currentSy,ed:null},{skipUnchanged:true}));
assert.equal(await page.locator('#metric-etd').innerText(),'----');
await page.evaluate(()=>updateFlightFromSy({...currentSy,ed:'1300'},{skipUnchanged:true}));
for(const width of [1920,1365,1024,820,390,320]) {
 await page.setViewportSize({width,height:940});
 await page.waitForTimeout(100);
 const portals=await page.locator('.status-metric--energy').evaluateAll(es=>es.map(e=>{
  const r=e.getBoundingClientRect(), text=getComputedStyle(e.querySelector('strong'));
  const glow=getComputedStyle(e.querySelector('.energy-glow'));
  const rim=getComputedStyle(e.querySelector('.energy-ring'));
  return {width:r.width,height:r.height,y:r.y,font:text.fontSize,filter:text.filter,
   center:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).getPropertyValue('--energy-color').trim(),
   glowFilter:glow.filter,glowMask:glow.maskImage,rimMask:rim.maskImage,animation:rim.animationDuration,
   textAnimation:text.animationName,ringDisplay:getComputedStyle(e.querySelector('.metric-rings')).display};
 }));
 assert.equal(portals.length,3);
 assert.deepEqual(portals.map(p=>p.color),['#00d9ff','#ba54ff','#ffb13b']);
 for(const p of portals){
  assert.equal(p.width,portals[0].width);assert.equal(p.height,portals[0].height);assert.equal(p.y,portals[0].y);
  assert.equal(p.font,portals[0].font);assert.equal(p.filter,'none');assert.equal(p.textAnimation,'none');
  assert.equal(p.center,'rgba(0, 0, 0, 0)');assert.equal(p.glowFilter,'blur(8px)');
  assert.equal(p.glowMask,'none');assert.match(p.rimMask,/radial-gradient/);
  assert.equal(p.animation,'1.4s');assert.equal(p.ringDisplay,'none');
 }
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'.verification/gradient-portals-'+width+'.png',fullPage:true});
}
await page.setViewportSize({width:1365,height:940});
const textRect=await page.locator('#metric-gate').boundingBox();
const transform=()=>page.locator('.energy-ring').first().evaluate(e=>getComputedStyle(e).transform);
const initial=await transform();await page.waitForTimeout(150);assert.notEqual(await transform(),initial);
assert.deepEqual(await page.locator('#metric-gate').boundingBox(),textRect);
const box=await page.locator('.status-strip').boundingBox();
await page.screenshot({path:'.verification/gradient-portals-detail.png',clip:{x:box.x-28,y:box.y-28,width:box.width+56,height:box.height+56}});
await page.emulateMedia({reducedMotion:'reduce'});
for(const e of await page.locator('.energy-ring,.energy-glow').all()){
 assert.equal(await e.evaluate(n=>getComputedStyle(n).animationName),'none');
}
await page.locator('.flight-menu-button').click();assert.equal(await page.locator('.flight-menu-button').getAttribute('aria-expanded'),'true');
await page.evaluate(()=>clearSyDashboard());
assert.equal(await page.locator('#metric-etd').textContent(),'----');
assert.deepEqual(errors,[]);
await browser.close();
console.log('PASS gradient portals: estimated departure refresh/reset, six viewport sizes, matched colors, unclipped outer glow, transparent centers, static text, rotation, reduced motion and flight menu');
})().catch(e=>{console.error(e);process.exit(1)});