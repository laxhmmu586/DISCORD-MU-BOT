// Exercise the real employee/device guard and page against local fixture records.
const assert=require('node:assert/strict'),path=require('node:path'),express=require('express');
const {createApiGuard,captureBody}=require('../desktopProtection');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const app=express(),saved=[],records=new Map([['MU383736',{bagTag:'MU383736',direction:'inbound',location:'Office',history:[]}]]);
 app.use(express.json({verify:captureBody}));
 app.use(createApiGuard({authenticate:async req=>{assert.equal(req.get('X-MUFC-Device'),undefined);if(req.get('Authorization')!=='Bearer fixture')throw Error('login');return {uid:'agent',email:'fixture@example.com'};}}));
 app.get('/test-baggage/:bagTag',(req,res)=>res.json({found:records.has(req.params.bagTag),record:records.get(req.params.bagTag)}));
 app.post('/test-baggage',(req,res)=>{saved.push(req.body);res.status(201).json({created:true,record:{...req.body,rowNumber:saved.length+1}});});
 app.post('/test-baggage/:bagTag/update',(req,res)=>{const record=records.get(req.params.bagTag);Object.assign(record,req.body);res.json({record});});
 app.get('/profile-api',(_req,res)=>res.json({state:'ready',profile:{name:'Fixture Employee',station:'LAX',account:'MU'}}));
 app.use(require('../has/static').withShared(path.join(__dirname,'../public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  await page.route('**/www.gstatic.com/**',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(origin)};const user={uid:'agent',email:'fixture@example.com',providerData:[],getIdToken:async()=>'fixture'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return ()=>{};}})};`}));
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/baggage.html');
   await page.locator('#test-bag-search').fill('MU383736');await page.locator('#test-search-form button[type=submit]').click();
   await page.locator('.test-report-title strong').filter({hasText:'MU383736'}).waitFor();
   await page.locator('[data-test-show-update]').click();await page.locator('[data-test-update-mode=location]').click();await page.locator('[name=location]').fill('Web Office '+width);await page.locator('.test-update-form button[type=submit]').click();
   await page.getByText('Updated.',{exact:true}).waitFor();assert.equal(records.get('MU383736').location,'Web Office '+width);
   await page.locator('#test-no-tag').click();assert.equal(await page.locator('[name=bagTag]').inputValue(),'No Tag');assert(await page.locator('#test-create-form').evaluate(form=>form.checkValidity()));
   await page.locator('#test-create-form button[type=submit]').click();await page.getByText('Saved to CBS On Hand.',{exact:true}).waitFor();assert.equal(saved.at(-1).noTag,true);
  }
  assert.equal(saved.length,2);assert.equal((await page.request.get(origin+'/test-baggage/MU383736')).status(),401);assert.equal((await page.request.get(origin+'/search?q=SY',{headers:{Authorization:'Bearer fixture'}})).status(),403);assert.deepEqual(errors,[]);
  console.log('PASS: authenticated browser Search, location update and Notag save through the real API guard at desktop/mobile widths; anonymous access and Desktop-only search remain blocked.');
 }finally{await browser?.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
