const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const context=await browser.newContext(),errors=[],posts=[];let flightNumber='MU586',revision=1,failNext=false;
 await context.route('**/*',async route=>{const url=new URL(route.request().url());
  if(url.hostname==='api.mufcapp.net'){
   if(url.pathname.startsWith('/cbs-flights/')){const body=route.request().postDataJSON();posts.push(body);if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Save failed. Try again.'}});}flightNumber=body.flightNumber;revision++;return route.fulfill({json:{updated:true}});}
   if(url.pathname==='/cbs-data-version')return route.fulfill({json:{revision,summary:{open:{passenger:0,'on-hand':0,'bag-room':1},closed:{}}}});
   if(url.pathname==='/cbs-unresolved-baggage')return route.fulfill({json:{rows:[{rowNumber:2,bagTag:'MU369804',direction:'Outbound',flightNumber,flightDate:'2026-11-05',bagType:'Not load bags',status:'Not load bags',createdAt:new Date().toISOString(),updateEvents:[]}]}});
   return route.fulfill({json:{rows:[],found:false}});
  }
  if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
  if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{email:'test@example.com',getIdToken:async()=>'fixture'},onAuthStateChanged:fn=>{setTimeout(()=>fn({email:'test@example.com'}),0);return()=>{}}})};`});
  const file=path.join(process.cwd(),'public/public',decodeURIComponent(url.pathname));return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost/cbs.html');await page.locator('[data-case-group="bag-room"]').click();
 const flight=page.locator('#bag-room-unload-output [data-edit-flight]').first(),row=page.locator('#bag-room-unload-output [data-toggle-unresolved-update]').first();await flight.waitFor();
 await flight.click();await page.waitForFunction(()=>document.querySelector('#bag-room-unload-output [data-toggle-unresolved-update]').getAttribute('aria-expanded')==='true');assert.equal(await flight.locator('input').count(),0);
 await flight.click();await page.waitForFunction(()=>document.querySelector('#bag-room-unload-output [data-toggle-unresolved-update]').getAttribute('aria-expanded')==='false');
 await flight.dblclick();let input=flight.getByRole('textbox',{name:'Flight number'});assert.equal(await row.getAttribute('aria-expanded'),'false');await input.fill('mu578');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-edit-flight]')?.textContent==='MU578');assert.equal(posts[0].oldFlight,'MU586');assert.equal(posts[0].flightNumber,'MU578');assert(await flight.evaluate(n=>n.classList.contains('unload-flight-purple')));
 await flight.dblclick();input=flight.getByRole('textbox');await input.fill('MU583');await input.press('Escape');assert.equal(await flight.innerText(),'MU578');assert.equal(posts.length,1);
 await flight.dblclick();input=flight.getByRole('textbox');await input.fill('bad');await input.press('Tab');assert.equal(posts.length,1);assert(await flight.locator('[role=status]').innerText());await input.focus();await input.fill('MU583');await input.press('Tab');await page.waitForFunction(()=>document.querySelector('[data-edit-flight]')?.textContent==='MU583');
 failNext=true;await flight.dblclick();input=flight.getByRole('textbox');await input.fill('MU586');await input.press('Tab');await flight.locator('[role=status]').filter({hasText:'Save failed'}).waitFor();await input.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-edit-flight]')?.textContent==='MU586');
 await page.reload();await page.locator('[data-case-group="bag-room"]').click();await flight.waitFor();assert.equal(await flight.innerText(),'MU586');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await flight.dblclick();await flight.getByRole('textbox').waitFor();await page.screenshot({path:'.verification/cbs-flight-edit-'+width+'.png',fullPage:true});await flight.getByRole('textbox').press('Escape');}
 assert.deepEqual(errors,[]);console.log('PASS: Flight single-click expand, double-click edit, save/reload/color, Escape, validation, failure retry and mobile layout.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
