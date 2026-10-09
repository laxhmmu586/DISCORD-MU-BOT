const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1365,height:900}});
const errors=[];
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
 if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`const user={email:'test@example.com',getIdToken:async()=>'fixture'};const fixtureAuth=()=>({currentUser:user,setPersistence:async()=>{},onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}});fixtureAuth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};window.firebase={apps:[{}],auth:fixtureAuth};`});
 if(url.hostname==='api.mufcapp.net'){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',day:'2-digit',month:'short',year:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return route.fulfill({contentType:'application/json',body:JSON.stringify({flights:[{flightNo:'MU586',flightDate:p.day+p.month.toUpperCase()+p.year,origin:'LAX',destination:'PVG',gate:'132',sd:'1230',ed:'1230',aircraftType:'777-773L',aircraftRegistration:'B7367'}],rows:[]})});
 }
 if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:'<h1>Dashboard fixture</h1>'});
 const file=path.join(process.cwd(),'public/public',url.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
 return route.fulfill({status:404,body:'Not found'});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost/flights.html');await page.locator('.flight-card').waitFor();
assert.deepEqual(await page.locator('.flight-services b').allTextContents(),['REPORT','BAGGAGE','LBS','240','IRR']);
assert.equal(await page.locator('#flight-status').isVisible(),false);
assert.equal(await page.locator('.flight-services').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
await page.locator('.flight-services a').first().hover();
assert.equal(await page.locator('.flight-services a').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
assert.equal(await page.locator('.flight-services a').last().getAttribute('href'),'https://www.mufcapp.net/irr.html');
fs.mkdirSync('.verification',{recursive:true});await page.screenshot({path:'.verification/flights-desktop.png',fullPage:true});
for(const width of [390,320]){
 await page.setViewportSize({width,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const nav=page.locator('.flight-services');
 assert.equal(await nav.evaluate(e=>getComputedStyle(e).scrollbarWidth),'none');
 assert(await nav.evaluate(e=>e.scrollWidth>e.clientWidth));
 await page.locator('.flight-services a').first().focus();
 await page.locator('.flight-services a').last().focus();
 assert(await nav.evaluate(e=>e.scrollLeft>0));
 await nav.evaluate(e=>e.scrollLeft=0);
 await page.screenshot({path:`.verification/flights-mobile-${width}.png`,fullPage:true});
}
await page.locator('.flight-enter').first().click();await page.waitForURL('**/index.html');
const flight=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mufc-online-flight')));assert.equal(flight.flightNo,'MU586');
await page.goto('http://localhost/login.html?next=/index.html');await page.waitForURL('**/flights.html');await page.locator('.flight-card').waitFor();
for(const [file,brand] of [['irr.html','MUIRR'],['cbs.html','MUBC']]){
 await page.goto('http://localhost/'+file);assert.equal(await page.getByRole('link',{name:brand,exact:true}).getAttribute('href'),'/flights.html');
 await page.getByRole('link',{name:brand,exact:true}).click();await page.waitForURL('**/flights.html');
}
assert.deepEqual(errors,[]);await browser.close();console.log('PASS login, selected-flight dashboard route, five services, desktop/mobile overflow, keyboard scrolling, MUIRR/MUBC return links');
})().catch(e=>{console.error(e);process.exit(1)});
