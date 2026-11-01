const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [1365,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),pending=[];page.setDefaultTimeout(12000);
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});
    if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`const user={uid:'fixture',email:'fixture@example.test',providerData:[],getIdToken:async()=>'fixture'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}})};`});
    if(url.hostname==='api.mufcapp.net'){
     if(url.pathname==='/flights'){pending.push(route);return;}
     return route.fulfill({contentType:'application/json',body:JSON.stringify({state:'ready',profile:{name:'Fixture',station:'LAX',account:'MU'}})});
    }
    for(const root of ['has/public','public/public']){
     const file=path.join(process.cwd(),root,url.pathname);
     if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
    }
    return route.fulfill({status:404,body:'Not found'});
   });
   await page.goto('http://localhost/flights.html');
   async function loading(){
    await page.waitForFunction(()=>document.body.classList.contains('is-loading'));
    assert(await page.locator('.flight-loading').isVisible());
    assert(await page.locator('.flight-topbar').isVisible());
    assert(await page.locator('.flight-brand').isVisible());
    assert(await page.locator('.flight-account-name').isVisible());
    assert.equal(await page.locator('.flight-welcome').isVisible(),false);
    if(width>760)assert(await page.locator('.flight-topbar nav').isVisible());
    // The full-screen loading indicator must not intercept header interactions.
    await page.locator('.login-button').click();
    assert(await page.locator('.login-menu').isVisible());
    await page.keyboard.press('Escape');
   }
   await page.locator('.flight-account-name').waitFor();await loading();
   while(!pending.length)await page.waitForTimeout(20);
   await pending.shift().fulfill({contentType:'application/json',body:JSON.stringify({flights:[{flightNo:'MU586',flightDate:'01NOV26',origin:'LAX',destination:'PVG'}]})});
   await page.locator('.flight-card').waitFor();assert(await page.locator('.flight-topbar').isVisible());
   await page.locator('#flight-reload').click();await loading();
   while(!pending.length)await page.waitForTimeout(20);
   await pending.shift().fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture unavailable'})});
   await page.getByRole('heading',{name:'Flights unavailable'}).waitFor();
   assert(await page.locator('.flight-topbar').isVisible());
   assert.equal(await page.locator('.flight-loading').isVisible(),false);
   await page.close();
  }
  console.log('PASS: header and account menu remain available during initial load, refresh, success and failure at desktop/mobile widths.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
