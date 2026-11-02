const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const context=await browser.newContext(),errors=[],posts=[];let bagTag='MU123456',revision=1,failNext=false;
 await context.route('**/*',async route=>{const url=new URL(route.request().url());
 if(url.hostname==='api.mufcapp.net'){
  if(url.pathname.startsWith('/cbs-bag-tags/')){const b=route.request().postDataJSON();posts.push(b);if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Save failed. Try again.'}});}bagTag=b.bagTag;revision++;return route.fulfill({json:{updated:true}});}
  if(url.pathname==='/cbs-data-version')return route.fulfill({json:{revision,summary:{open:{passenger:1},closed:{}}}});
  if(url.pathname==='/cbs-cases')return route.fulfill({json:{rows:[{rowNumber:2,source:'pir',bagTag,caseType:'AHL',passengerName:'TEST',status:'Open',submittedAt:new Date().toISOString(),updateEvents:[]}],total:1,pages:1,counts:{passenger:1},months:[]}});
  return route.fulfill({json:{rows:[],found:false}});
 }
 if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
 if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{email:'test@example.com',getIdToken:async()=>'fixture'},onAuthStateChanged:fn=>{setTimeout(()=>fn({email:'test@example.com'}),0);return()=>{}}})};`});
 const file=path.join(process.cwd(),'public/public',decodeURIComponent(url.pathname));return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost/cbs.html');
 const tag=page.locator('#cases-output [data-edit-bag-tag]').first();await tag.waitFor();assert.equal(await tag.getAttribute('data-tag-source'),'pir');
 await tag.dblclick();let input=tag.getByRole('textbox');await input.fill('MU999999');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#cases-output [data-edit-bag-tag]')?.textContent==='MU999999');assert.equal(posts.length,1);assert.equal(posts[0].oldTag,'MU123456');
 await tag.dblclick();input=tag.getByRole('textbox');await input.fill('MU777777');await input.press('Escape');assert.equal(await tag.innerText(),'MU999999');assert.equal(posts.length,1);
 await tag.dblclick();input=tag.getByRole('textbox');await input.fill('bad');await input.press('Tab');assert.equal(posts.length,1);assert(await tag.locator('[role=status]').innerText());await input.focus();await input.fill('MU888888');await input.press('Tab');await page.waitForFunction(()=>document.querySelector('#cases-output [data-edit-bag-tag]')?.textContent==='MU888888');assert.equal(posts.length,2);
 failNext=true;await tag.dblclick();input=tag.getByRole('textbox');await input.fill('MU777777');await input.press('Tab');await tag.locator('[role=status]').filter({hasText:'Save failed'}).waitFor();assert.equal(bagTag,'MU888888');assert.equal(await page.evaluate(()=>window.cbsBagTagEditing),true);await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#cases-output [data-edit-bag-tag]')?.textContent==='MU777777');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:'.verification/cbs-bag-edit-'+width+'.png',fullPage:true});}
 assert.deepEqual(errors,[]);console.log('PASS: actual CBS page tag editing, Enter/blur autosave, Escape cancellation, validation and refresh at desktop/mobile widths.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
