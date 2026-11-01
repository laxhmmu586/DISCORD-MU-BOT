const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const fixture=await require('./fixtures/hr-accounts.cjs').createFixture();
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[];
 try{
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/www.gstatic.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(fixture.origin)};const user={uid:'owner',email:'lake@mu.com',providerData:[],getIdToken:async()=>'owner'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return ()=>{};}})};`}));
  await page.route('**/profile-api',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({state:'ready',profile:{name:'Lake Xia',nickname:'Lake',station:'LAX',account:'MU',avatar:'/has/assets/push-icon-192.png'}})}));
  await page.goto(fixture.origin+'/hr');await page.locator('.org-card').first().waitFor();await page.locator('.flight-account-name').filter({hasText:'Lake'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.flight-user-avatar img')?.complete&&document.querySelector('.workspace-bell'));
  assert.equal(await page.locator('.hr-user').count(),0);assert.equal(await page.getByText('My workspace',{exact:true}).count(),0);
  assert.equal(await page.locator('.flight-user-avatar img').getAttribute('src'),'/has/assets/push-icon-192.png');
  fs.mkdirSync('output',{recursive:true});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   assert(await page.locator('.login-button').isVisible());await page.locator('.login-button').click();
   await page.getByRole('switch',{name:'Notifications',exact:true}).waitFor();
   assert.equal(await page.locator('#current-user').textContent(),'Lake');assert(await page.getByRole('button',{name:'LOGOUT',exact:true}).isVisible());
   assert(await page.locator('.login-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
   await page.screenshot({path:'output/hr-account-header-'+width+'.png',animations:'disabled'});await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('employee-profile-updated',{detail:{name:'Lake Xia',nickname:'Updated Lake',station:'LAX',account:'MU'}})));
  assert.equal(await page.locator('.flight-account-name').textContent(),'Updated Lake');
  await page.goto(fixture.origin+'/hr?preview=1');await page.locator('.hr-preview-account').waitFor();assert.equal(await page.locator('.login-menu').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: HR uses the authenticated avatar/name and shared account menu on desktop/mobile, profile changes update the header, and local design preview stays independent.');
 }finally{await browser.close();fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
