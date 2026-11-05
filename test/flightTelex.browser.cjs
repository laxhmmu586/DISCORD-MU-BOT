const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const checked=new Set(),errors=[];let reads=0,writes=0;
 const source=fs.readFileSync('public/public/index.html','utf8'),panel=source.match(/<section id="flight-telex"[\s\S]*?<\/section>/)[0];
 const page=await browser.newPage({viewport:{width:800,height:400}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://telex.test/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/flight-telex'){if(route.request().method()==='POST'){writes++;const body=route.request().postDataJSON();if(body.sent)checked.add(body.service);else checked.delete(body.service);}else reads++;return route.fulfill({json:{checked:[...checked]}});}
  if(pathname==='/telex.js')return route.fulfill({path:path.resolve(process.env.TELEX_SCRIPT||'public/public/flight-telex.js'),contentType:'text/javascript'});
  if(pathname==='/style.css')return route.fulfill({path:path.resolve('public/public/flight-forms.css'),contentType:'text/css'});
  return route.fulfill({body:`<html><head><link rel="stylesheet" href="/style.css"><style>body{background:#0e213d;padding:30px;font-family:Arial}.flight-telex{width:264px;box-sizing:border-box}</style></head><body>${panel}<script>window.peopleApi=async(url,body)=>{const r=await fetch(url,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return r.json();};window.testRender=patch=>window.renderFlightTelex({flightNo:'MU586',flightDate:'05NOV26',permissions:{canViewSpecialService:true},...patch},'fixture');</script><script src="/telex.js"></script></body></html>`,contentType:'text/html'});
 });
 await page.goto('http://telex.test/');await page.evaluate(()=>testRender({wchList:[{codes:['WCHR']}]}));
 const input=page.locator('input[value=WCHR]');await input.waitFor();await page.waitForFunction(()=>!document.querySelector('input').disabled);
 await page.evaluate(()=>{window.initialInput=document.querySelector('input');for(let n=0;n<50;n++)testRender({});});
 assert.equal(await page.evaluate(()=>initialInput===document.querySelector('input')),true);assert.equal(reads,1);
 await page.screenshot({path:'.verification/telex-retained-pending.png'});
 await input.check();await page.locator('.flight-telex.is-complete').waitFor();assert.equal(await page.locator('.telex-done').isVisible(),true);assert.equal(writes,1);
 await page.evaluate(()=>{for(let n=0;n<50;n++)testRender({wchList:[]});});assert.equal(await input.isChecked(),true);assert.equal(await page.evaluate(()=>initialInput===document.querySelector('input')),true);
 await page.screenshot({path:'.verification/telex-retained-done.png'});
 await page.evaluate(()=>testRender({seatMapRecords:[{specialServices:['INAD']}]}));assert.equal(await input.isChecked(),true);assert.equal(await page.evaluate(()=>initialInput===document.querySelector('input[value=WCHR]')),true);
 await page.reload();await page.evaluate(()=>testRender({}));await input.waitFor();await page.waitForFunction(()=>document.querySelector('input[value=WCHR]').checked);
 await page.evaluate(()=>testRender({flightNo:'MU578'}));assert.equal(await page.locator('#flight-telex').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS: retained Telex detection, stable controls, Done, new services, reload and flight isolation.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
