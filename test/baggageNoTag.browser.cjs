// Fixture browser check: all API and authentication traffic is mocked.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
fs.mkdirSync('.verification',{recursive:true});
const context=await browser.newContext();const posted=[],errors=[];
await context.route('**/*',async route=>{
const url=new URL(route.request().url());
if(url.hostname==='api.mufcapp.net'){
if(route.request().method()==='POST'){const body=route.request().postDataJSON();if(url.pathname==='/test-baggage')posted.push(body);return route.fulfill({json:{created:true,record:{...body,rowNumber:posted.length+1}}});}
if(url.pathname==='/cbs-unresolved-baggage')return route.fulfill({json:{rows:posted.map((b,i)=>({...b,rowNumber:i+2,flightDate:b.date,flightNumber:b.flight,createdAt:new Date().toISOString(),bagIdentifications:[{number:1,tag:'No Tag',...b.bagIdentification}],updateEvents:[]}))}});
return route.fulfill({json:{found:false,rows:[]}});
}
if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{email:'test@example.com',getIdToken:async()=>'fixture'},onAuthStateChanged:fn=>{setTimeout(()=>fn({email:'test@example.com'}),0);return()=>{};}})};`});
const file=path.join(process.cwd(),'public/public',decodeURIComponent(url.pathname));
return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
for(const width of [1365,390,320]){
await page.setViewportSize({width,height:900});await page.goto('http://localhost/baggage.html');
await page.locator('#test-no-tag').click();
assert.equal(await page.locator('[name=bagTag]').inputValue(),'No Tag');assert(await page.locator('[name=bagTag]').evaluate(e=>e.readOnly));
assert.equal(await page.locator('[name=flight]').inputValue(),'MU583');
assert(await page.locator('#test-create-form').evaluate(e=>e.checkValidity()));
for(const [kind,code] of [['color','BE'],['type','25'],['descriptors','X-M']]){
 const picker=page.locator(`[data-bag-id-picker=${kind}]`);await picker.locator('[data-bag-id-open]').click();
 assert(await picker.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 if(kind==='type'){
 await picker.locator('[data-bag-id-tab=unzipped]').click();assert(await picker.locator('[data-bag-id-code="01"]').isVisible());
 await picker.locator('[data-bag-id-tab=other]').click();assert(await picker.locator('[data-bag-id-code="50"]').isVisible());
 await picker.locator('[data-bag-id-tab=zipped]').click();
}
await picker.locator(`[data-bag-id-code="${code}"]`).click();
 if(kind==='descriptors'){
 await picker.locator('[data-bag-id-code=R]').click();assert.equal(await picker.locator('input').inputValue(),'R');
 await picker.locator('[data-bag-id-code="X-M"]').click();assert.equal(await picker.locator('input').inputValue(),'X-M');
 await picker.locator('[data-bag-id-code=K]').click();
 await picker.locator('[data-bag-id-code=C]').click();await picker.locator('[data-bag-id-code=W]').click();assert.equal(await picker.locator('input').inputValue(),'X-M,K,C');
 await picker.locator('[data-bag-id-code=C]').click();await picker.locator('[data-bag-id-close]').last().click();}
}

assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
await page.screenshot({path:`.verification/no-tag-${width}.png`,fullPage:true});
await page.locator('#test-create-form button[type=submit]').click();
await page.getByText('Saved to CBS On Hand.',{exact:true}).waitFor();assert.equal(posted.at(-1).bagTag,'No Tag');assert.equal(posted.at(-1).noTag,true);assert.deepEqual(posted.at(-1).bagIdentification,{color:'BE',type:'25',descriptors:'X-M,K'});
await page.locator('[data-test-new-no-tag]').click();await page.locator('[data-test-back-choice]').click();
await page.locator('#test-bag-search').fill('MU123456');await page.locator('#test-search-form button[type=submit]').click();await page.locator('[data-test-create-mode=inbound]').waitFor();
}
await page.setViewportSize({width:1365,height:900});await page.goto('http://localhost/cbs.html');
await page.locator('[data-case-group="on-hand"]').first().click();
await page.locator('#unresolved-baggage-output .case-summary-row').first().waitFor();
assert.equal(await page.locator('#unresolved-baggage-output .case-summary-row').count(),3);
await page.locator('#unresolved-baggage-output .case-summary-row').first().click();
assert.equal(await page.locator('#unresolved-baggage-output .baggage-visual-card:visible').count(),1);
assert.match(await page.locator('#unresolved-baggage-output .baggage-visual-card:visible').innerText(),/BE-25/);
await page.screenshot({path:'.verification/no-tag-cbs.png',fullPage:true});
assert.deepEqual(errors,[]);assert.equal(posted.length,3);await browser.close();console.log('PASS Notag visual pickers, submission, three separate CBS identification cards, Back, normal Search, and 1365/390/320px layouts');
})().catch(e=>{console.error(e);process.exit(1)});
