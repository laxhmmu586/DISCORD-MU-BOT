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
  return route.fulfill({contentType:'application/json',body:JSON.stringify({sy:{flightNo:'MU586',flightDate:p.day+p.month.toUpperCase()+p.year,gate:'132',sd:'1230',ed:'1230'},flights:[{flightNo:'MU586',flightDate:p.day+p.month.toUpperCase()+p.year,origin:'LAX',destination:'PVG',gate:'132',sd:'1230',ed:'1230',aircraftType:'777-773L',aircraftRegistration:'B7367'}],rows:[]})});
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
await page.evaluate(()=>{document.querySelector('#metric-bdt').textContent='1200';});
for(const width of [1920,1365,1024,820,390,320]) {
 await page.setViewportSize({width,height:940});
 await page.waitForTimeout(200);
 const portals=await page.locator('.status-metric--energy').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();const text=getComputedStyle(e.querySelector('strong'));return {width:r.width,height:r.height,y:r.y,font:text.fontSize,filter:text.filter,depth:getComputedStyle(e,'::before').backgroundImage,animation:getComputedStyle(e,'::after').animationDuration}}));
assert.equal(portals.length,3);for(const p of portals){assert.equal(p.width,portals[0].width);assert.equal(p.height,portals[0].height);assert.equal(p.y,portals[0].y);assert.equal(p.font,portals[0].font);assert.equal(p.filter,'none');assert.equal(p.depth,portals[0].depth);assert.equal(p.animation,'12s');}
const data=await page.locator('.status-metric--energy:first-child').evaluate(e=>({value:e.querySelector('strong').textContent,width:e.offsetWidth,ring:getComputedStyle(e,'::before').boxShadow,clip:getComputedStyle(e,'::after').clipPath,animation:getComputedStyle(e).animationName,scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert.equal(data.value,'132'); assert.equal(data.clip,'none'); assert.equal(data.animation,'none'); assert.notEqual(data.ring,'none'); assert(data.scroll<=data.viewport+1);
 assert.equal(await page.locator('#metric-gate').evaluate(e=>getComputedStyle(e).filter),'none'); assert.equal(await page.locator('.status-metric--energy:first-child').evaluate(e=>getComputedStyle(e).filter),'none');
 await page.screenshot({path:'.verification/layered-portals-'+width+'.png',fullPage:true});
}
await page.setViewportSize({width:1920,height:940});
await page.waitForTimeout(100);
const box=await page.locator('.mission-side').boundingBox();
await page.screenshot({path:'.verification/layered-portals-detail.png',clip:{x:box.x-40,y:box.y-35,width:box.width+80,height:box.height+70}});
const layout=()=>page.locator('.mission-head').evaluate(e=>Array.from(e.querySelectorAll('.mission-title,.status-metric,.flight-menu-button')).map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
const textRect=await page.locator('#metric-gate').boundingBox();
const energy=()=>page.locator('.status-metric--energy:first-child').evaluate(e=>{const s=getComputedStyle(e,'::after');return {transform:s.transform,opacity:s.opacity,animation:s.animationName,duration:s.animationDuration}});
const clip={x:box.x-40,y:box.y-35,width:box.width+80,height:box.height+70};
const readLayers=()=>page.locator('.status-metric--energy').evaluateAll(es=>es.map(e=>{const f=e.querySelector('.energy-filaments');const angle=s=>{const m=new DOMMatrixReadOnly(s.transform);return Math.atan2(m.b,m.a)*180/Math.PI};const inner=getComputedStyle(f,'::before'),outer=getComputedStyle(f,'::after');return {background:getComputedStyle(e,'::before').backgroundImage,rimTransform:getComputedStyle(e,'::after').transform,inner:angle(inner),outer:angle(outer),innerDuration:inner.animationDuration,outerDuration:outer.animationDuration,outerDirection:outer.animationDirection,centerAnimation:getComputedStyle(e,'::before').animationName,textAnimation:getComputedStyle(e.querySelector('strong')).animationName}}));
const first=await readLayers();for(const p of first){assert.equal(p.background,'none');assert.equal(p.centerAnimation,'none');assert.equal(p.textAnimation,'none');assert.equal(p.rimTransform,'none');assert.equal(p.innerDuration,'96s, 19s');assert.equal(p.outerDuration,'144s, 23s');assert.match(p.outerDirection,/reverse/);}
await page.waitForTimeout(600);const moved=await readLayers();for(let i=0;i<3;i++){assert(moved[i].inner>first[i].inner);assert(moved[i].outer<first[i].outer);}
assert.deepEqual(await page.locator('#metric-gate').boundingBox(),textRect);
if(process.env.PORTAL_MOTION_PREVIEW){
 fs.mkdirSync('.verification/layered-portals-frames',{recursive:true});
 await page.evaluate(()=>document.querySelectorAll('.status-metric--energy').forEach(e=>e.getAnimations({subtree:true}).forEach(a=>a.pause())));
 for(let i=0;i<300;i++){
  await page.evaluate(time=>document.querySelectorAll('.status-metric--energy').forEach(e=>e.getAnimations({subtree:true}).forEach(a=>a.currentTime=time)),i*40);
  await page.screenshot({path:'.verification/layered-portals-frames/'+String(i).padStart(3,'0')+'.png',clip});
 }
}
await page.emulateMedia({reducedMotion:'reduce'});
for(const e of await page.locator('.status-metric--energy').all()){
 assert.equal(await e.evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
 for(const pseudo of ['::before','::after'])assert.equal(await e.locator('.energy-filaments').evaluate((n,p)=>getComputedStyle(n,p).animationName,pseudo),'none');
}
const still=await page.screenshot({clip});await page.waitForTimeout(150);assert.deepEqual(await page.screenshot({clip}),still);
await page.emulateMedia({reducedMotion:'no-preference'});
const after=await layout();
await page.evaluate(()=>document.querySelector('link[href*="energy-portals.css"]').disabled=true);
const baseline=await layout();assert.deepEqual(baseline[0],after[0]);
for(let i=1;i<=3;i++){assert.equal(baseline[i][1],after[i][1]);assert.equal(baseline[i][2],after[i][2]);assert.equal(baseline[i][3],after[i][3]);}
assert(after[2][0]-after[1][0]>baseline[2][0]-baseline[1][0]);assert(after[4][0]>baseline[4][0]);
await page.evaluate(()=>document.querySelector('link[href*="energy-portals.css"]').disabled=false);
await page.locator('.flight-menu-button').click();assert.equal(await page.locator('.flight-menu-button').getAttribute('aria-expanded'),'true');
assert.deepEqual(errors,[]);await browser.close();console.log('PASS transparent portals: live values, matched layout, independently moving filaments, wider spacing, static text, reduced motion and flight menu');
})().catch(e=>{console.error(e);process.exit(1)});
