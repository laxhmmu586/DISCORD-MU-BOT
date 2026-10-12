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


await page.goto('http://localhost/flights.html');await page.locator('.flight-card').waitFor();await page.locator('.flight-enter').first().click();await page.waitForURL('**/index.html');await page.locator('body:not(.is-loading)').waitFor();
fs.mkdirSync('.verification',{recursive:true});
for(const width of [1365,390]){
 await page.setViewportSize({width,height:900});
 for(const state of ['clear','issue','pending','clear']){
  await page.evaluate(state=>updateFlightFromSy({flightNo:'MU586',flightDate:'08OCT26',aircraftType:'777-773L',aircraftRegistration:'B7367',govAqq:state==='pending'?null:state==='issue'?{duplicatePassports:['001'],passportCodeIssues:['002','003']}:{}}),state);
  await page.waitForTimeout(50);
  for(const key of ['GOV','WEBEDI']){
   const node=page.locator('.node[data-key="'+key+'"]');const value=node.locator('.node-value');
   const style=await value.evaluate(e=>{const s=getComputedStyle(e,'::after'),v=getComputedStyle(e);return {mask:s.maskImage,content:s.content,background:v.backgroundColor,border:v.borderTopWidth}});
   if(state==='clear'){assert.equal(await node.getAttribute('data-status'),'done');assert.equal(await value.getAttribute('data-value'),'0');assert.notEqual(style.mask,'none');assert.equal(style.content,'""');assert.equal(style.border,'1px');}
   else{assert.equal(style.mask,'none');assert.equal(style.background,'rgba(0, 0, 0, 0)');}
  }
 }
 assert.equal(await page.locator('#flight-kicker').evaluate(e=>getComputedStyle(e).fontSize),'14px');
 assert.equal(await page.locator('.rail-pulse').count(),0);assert.equal(await page.locator('.rail-meteor').count(),1);
 const animation=await page.locator('.rail-meteor').evaluate(e=>e.getAnimations()[0]);
 assert(animation!==undefined);
 await page.screenshot({path:'.verification/dashboard-zero-'+width+'.png',fullPage:true});
}
assert.deepEqual(errors,[]);await browser.close();console.log('PASS rendered zero checkmarks, issue/pending counts, refresh transitions, font size, no ripple and retained meteor at desktop/mobile widths');
})().catch(e=>{console.error(e);process.exit(1)});
