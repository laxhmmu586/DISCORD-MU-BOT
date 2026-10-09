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

await page.goto('http://localhost/flights.html');await page.locator('.flight-card').waitFor();await page.locator('.flight-enter').first().click();await page.waitForURL('**/index.html');
fs.mkdirSync('.verification',{recursive:true});
for(const width of [1365,390]){
 await page.setViewportSize({width,height:900});
 for(const file of ['report','baggage','index','scan']){
  await page.goto('http://localhost/'+file+'.html');
  const control=page.getByRole('link',{name:'Switch flight',exact:true});await control.waitFor();
  assert.equal(await control.count(),1);assert.equal(await control.getAttribute('href'),'/flights.html');
  assert.equal(await control.innerText(),'');assert.equal(await control.locator('svg path').getAttribute('d'),'M7 3v17m-4-4 4 4 4-4M17 21V4m-4 4 4-4 4 4');
  if(file==='index'){
   await page.locator('body:not(.is-loading)').waitFor();
   assert.equal(await page.locator('#header-select-flight,#select-flight-button,#irr-button').count(),0);
   const color=await control.evaluate(e=>getComputedStyle(e).color);assert.equal(color,'rgb(255, 255, 255)');
   const boxes=await page.locator('.mission-flight-heading').evaluate(e=>{const a=e.querySelector('a').getBoundingClientRect(),h=e.querySelector('h1').getBoundingClientRect();return {right:a.right,left:h.left}});assert(boxes.right<=boxes.left);
   await page.locator('.flight-menu-button').click();assert.doesNotMatch(await page.locator('.flight-menu').innerText(),/IRR|Select Flight/i);
  }
  if(file==='scan')assert.equal(await page.locator('#boarding-options,.boarding-menu').count(),0);
  await page.screenshot({path:'.verification/switch-'+file+'-'+width+'.png',fullPage:true});
  await control.click();await page.waitForURL('**/flights.html');
 }
}
assert.deepEqual(errors,[]);await browser.close();console.log('PASS all four pages: desktop/mobile vertical switch controls, return routes, dashboard placement and removed menus');
})().catch(e=>{console.error(e);process.exit(1)});
