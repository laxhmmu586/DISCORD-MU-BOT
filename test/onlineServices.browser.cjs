// Run with Playwright installed: node test/onlineServices.browser.cjs
// All API traffic and Firebase authentication are fixtures. No external writes occur.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
fs.mkdirSync('.verification',{recursive:true});
const context=await browser.newContext({viewport:{width:1365,height:900}}); const errors=[],requests=[],posted=[];
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());requests.push(url.pathname);
 if(url.hostname==='api.mufcapp.net'){
  let data={rows:[]}; const req=route.request();
  if(req.method()==='POST'){posted.push({path:url.pathname,body:req.postDataJSON()});data={created:true,record:{...req.postDataJSON(),history:[]}};}
  else if(url.pathname.startsWith('/test-baggage/'))data={record:null};
  else if(url.pathname==='/sales-report/meta')data={found:true,available:true,fileName:'Sales.xls'};
  else if(url.pathname==='/sales-details-report')data={rows:[{flightNo:'MU578',type:'UPGRADE',value:20,emd:'123',date:'2026-10-08'},{flightNo:'MU586',type:'UPGRADE',value:80,emd:'456',date:'2026-10-08'}],totals:[{type:'UPGRADE',amount:100,count:2}]};
  else if(url.pathname==='/test-baggage-report')data={rows:[{flight:'MU578',bagTag:'MU123456',status:'Open'}]};
  else data={rows:[{flightNo:'MU578',passenger:'TEST/PAX',name:'TEST/PAX',date:'2026-10-08',seat:'10A',seatNumber:'10A',bn:'001',meal:'VGML',key:'test',detail:'PSM',type:'PSM',phone:'555'}]};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 }
 if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
 if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{email:'test@example.com',getIdToken:async()=>'fixture'},onAuthStateChanged:fn=>{setTimeout(()=>fn({email:'test@example.com'}),0);return()=>{};}})};`});
 const file=path.join(process.cwd(),'public/public',decodeURIComponent(url.pathname));
 if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
 return route.fulfill({status:404,body:'Not found'});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost/report.html');await page.waitForTimeout(150);
for(const mode of ['sales','salesDetails','vip','spml','psm','inad','wch','missConnection','baggage']){
 await page.locator(`[data-report-mode="${mode}"]`).click();await page.waitForTimeout(70);
 if(mode==='sales')await page.locator('#report-form').evaluate(f=>f.requestSubmit());
 await page.waitForTimeout(100);
 console.log(mode,(await page.locator('#report-output').innerText()).slice(0,120));
 assert.match(await page.locator('#report-output').innerText(),/MU578/);
 if(mode!=='baggage')assert.match(await page.locator('#report-download').evaluate(e=>e._csv),/MU578/);
 if(mode==='psm')assert.match(await page.evaluate(()=>authorizationReportPdf(document.querySelector('#report-pdf-download')._rows)),/MU578/);
}
await page.locator('[data-report-mode="salesDetails"]').click();await page.locator('#report-flight').selectOption('MU578');await page.waitForTimeout(100);
assert.match(await page.locator('#report-output').innerText(),/\$20\.00/);assert.doesNotMatch(await page.locator('#report-output').innerText(),/MU586/);
await page.screenshot({path:'.verification/report.png',fullPage:true});
await page.goto('http://localhost/baggage.html');await page.locator('#test-bag-search').fill('MU123456');await page.locator('#test-search-form').evaluate(f=>f.requestSubmit());await page.locator('[data-test-create-mode="inbound"]').click();
assert.equal(await page.locator('select[name="flight"]').inputValue(),'MU583');await page.locator('select[name="flight"]').selectOption('MU577');await page.locator('[data-test-create-form]').evaluate(f=>f.requestSubmit());await page.waitForTimeout(100);assert.equal(posted.at(-1).body.flight,'MU577');
await page.locator('#test-search-form').evaluate(f=>f.requestSubmit());await page.locator('[data-test-create-mode="outbound"]').click();assert.equal(await page.locator('select[name="flight"]').inputValue(),'MU578');
await page.screenshot({path:'.verification/baggage.png',fullPage:true});
await page.locator('select[name="flight"]').selectOption('MU586');await page.locator('[data-test-create-form]').evaluate(f=>f.requestSubmit());await page.waitForTimeout(100);assert.equal(posted.at(-1).body.flight,'MU586');
await page.goto('http://localhost/240.html');assert.equal(await page.locator('#flightNo').inputValue(),'MU586');await page.locator('#flightNo').selectOption('MU578');await page.evaluate(()=>fillScan({passengerName:'TEST PAX',seatNumber:'10A',bnNumber:'001'}));assert.equal(await page.locator('#flightNo').inputValue(),'MU578');await page.screenshot({path:'.verification/240.png',fullPage:true});
await page.locator('#nationalityCode').selectOption('CAN');await page.locator('#passportExpiry').fill('2032-01-23');await page.locator('.stop-code').fill('HKG');await page.locator('.stop-date').fill(new Date().toISOString().slice(0,10));await page.locator('#form').evaluate(f=>f.requestSubmit());await page.waitForTimeout(150);assert.equal(posted.at(-1).path,'/transit-240');assert.equal(posted.at(-1).body.flightNo,'MU578');
await page.goto('http://localhost/cbs.html');await page.waitForTimeout(200);
await page.evaluate(()=>{window._caseView='open';const rows=['MU586','MU578','MU9586','MU583','MU577',''].map((flightNumber,i)=>({rowNumber:i+2,bagTag:'MU12345'+i,flightNumber,flightDate:'2026-10-08',createdAt:new Date().toISOString(),status:'Not load bags',updateEvents:[]}));renderUnresolvedBaggageGroup(rows,document.querySelector('#bag-room-unload-output'),'Bag Room Unload Bag');});
assert.equal(await page.locator('.unload-flight').count(),6);assert.equal(new Set(await page.locator('.unload-flight').evaluateAll(els=>els.map(e=>getComputedStyle(e).color))).size,6);

assert.equal(await page.locator('#bag-room-unload-output .case-detail-row td').first().getAttribute('colspan'),'7');
await page.locator('[data-case-group="bag-room"]').first().click();assert(await page.locator('#bag-room-unload-output th').filter({hasText:'Status'}).evaluate(e=>e.getBoundingClientRect().width>=90));await page.screenshot({path:'.verification/cbs.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.goto('http://localhost/baggage.html');await page.locator('#test-bag-search').fill('MU123456');await page.locator('#test-search-form').evaluate(f=>f.requestSubmit());await page.locator('[data-test-create-mode="outbound"]').click();await page.screenshot({path:'.verification/baggage-mobile.png',fullPage:true});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

assert(!requests.includes('/index.html'));assert(!requests.includes('/search'));console.log('ERRORS',errors);assert.deepEqual(errors,[]);
await browser.close();console.log('PASS standalone pages, nine reports, flight filters, baggage payloads, scan preservation');
})().catch(e=>{console.error(e);process.exit(1)});
