const assert=require('node:assert/strict'),path=require('node:path'),express=require('express'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const app=express(),primary={name:'Fixture Employee',station:'LAX',account:'MU',canOpenFlights:true};
 app.get('/profile-api',(_,res)=>res.json({state:'ready',profile:primary}));app.get('/flights.html',(_,res)=>res.send('<h1>Flights destination</h1>'));app.use(require('../has/static').withShared(path.resolve('public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),errors=[];
 await context.addInitScript(()=>{window.MU_API_BASE=location.origin;const user={uid:'fixture',email:'staff@example.test',providerData:[],getIdToken:async()=>'fixture'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}})};});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname.endsWith('.js')&&!['/workspace-shell.js','/flight-account.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});return route.continue();});
 try{
  for(const name of ['briefing','schedule','profile','home','hr','has-form','has-report','read-sign','info','has-pbb','has-pbb-dashboard','attendance','my-approvals']){
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/'+name+'.html');if(!await page.locator('#flight-account .login-menu').count())await page.addScriptTag({url:origin+'/flight-account.js'});await page.waitForFunction(()=>window.workspaceProfile?.profile?.canOpenFlights);
   await page.evaluate(()=>document.documentElement.classList.remove('home-auth-pending'));const logo=page.locator('header a.home-brand,header a.profile-brand,header a.has-brand,header a.flight-brand,header a.brand').first();assert.equal(await logo.getAttribute('href'),'/flights.html',name);
   const update=async(profile,user={uid:'fixture',email:'staff@example.test'})=>page.evaluate(({profile,user})=>window.dispatchEvent(new CustomEvent('workspace-profile',{detail:{profile,user}})),{profile,user});
   for(const profile of [{station:'SFO',account:'CZ',canOpenFlights:true},{station:'SFO',account:'CZ',additionalAccounts:[{station:' lax ',account:'mu'}]}]){await update(profile);assert.equal(await logo.getAttribute('href'),'/flights.html',name+' additional membership');}
   await update({station:'SFO',account:'CZ',canOpenFlights:false,canViewOperations:true});const fallback=await logo.getAttribute('href');assert.notEqual(fallback,'/flights.html',name+' unrelated operations permission');
   await update(primary);assert.equal(await logo.getAttribute('href'),'/flights.html');await update({station:'LAX',account:'CZ',canOpenFlights:false});assert.equal(await logo.getAttribute('href'),fallback,name+' membership removal');
   await update(null,null);assert.equal(await logo.getAttribute('href'),fallback,name+' sign out');await update(primary,{uid:'fixture',email:'agent@mu.com'});assert.equal(await logo.getAttribute('href'),'/flights.html');assert.equal(await logo.isHidden(),false,name+' external email with LAX/MU membership');
   await page.evaluate(()=>document.documentElement.classList.remove('home-auth-pending'));await Promise.all([page.waitForURL(origin+'/flights.html'),logo.click()]);await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: Logo routes to Flights across 13 pages for main/additional LAX/MU memberships; fallback, membership removal, sign out and real clicks verified.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
