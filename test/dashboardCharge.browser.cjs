const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{
 const app=express(),scope={station:'LAX',account:'MU'};
 const amounts={expectedFlights:56,coveredFlights:12,submittedFlights:12,submittedChecklists:12,pending:0};
 const qa={station:'LAX',account:'ALL',start:'2026-11-01',end:'2026-11-07',scopes:[scope,{station:'LAX',account:'CI'},{station:'LAX',account:'NZ'}],daily:[{date:'2026-11-01',...amounts}],byScope:[{...scope,...amounts,expectedFlights:14,weeklyArrivals:7,weeklyDepartures:7},{station:'LAX',account:'CI',...amounts,expectedFlights:42,coveredFlights:0,weeklyArrivals:7,weeklyDepartures:7},{station:'LAX',account:'NZ',...amounts,expectedFlights:0,coveredFlights:0,weeklyArrivals:0,weeklyDepartures:0}],records:[],missing:[]};
 const emptyDelays={evaluated:0,total:0,under30:0,from30to59:0,atLeast60:0};
 const months=Array.from({length:12},(_,i)=>({month:'2026-'+String(i+1).padStart(2,'0'),state:i<2?(i?'surplus':'overrun'):'not-started',hasDA:i<2,hasWWH:i<2,budgetHours:i<2?100:null,actualHours:i<2?(i?80:130):null,rechargeHours:i<2?10:null,balanceHours:i<2?(i?30:-20):null,netActualHours:i<2?(i?70:120):null,flights:i<2?1:null,pax:i<2?100:null,flightDelays:{arrival:{...emptyDelays},departure:{...emptyDelays}}}));
 app.get('/has-pbb-api/dashboard',(_,res)=>res.json(qa));
 app.get('/has-page-api/:page/access',(_,res)=>res.json({canAccess:true}));
 app.get('/profile-api',(_,res)=>res.json({state:'ready',profile:{id:'test',name:'Fixture Supervisor',position:'Supervisor',...scope}}));
 app.get('/has-report-api/context',(_,res)=>res.json({canDashboard:true,permissions:{da:true,wwh:true},scope}));
 let annualResponse; app.get('/has-report-api/dashboard/2026',(_,res)=>{annualResponse=()=>res.json({scope,generatedAt:new Date().toISOString(),months});});
 require('node:child_process').execFileSync(process.execPath,['has/build.cjs'],{cwd:root});
 const publicRoot=path.join(root,'public/public'),hosting=require(root+'/public/firebase.json').hosting;
 app.use(express.static(publicRoot));
 app.use((req,res,next)=>{
  const rule=hosting.rewrites.find(rule=>rule.source===req.path);
  if(!rule?.destination?.startsWith('/has/'))return next();
  res.sendFile(path.resolve(publicRoot,'.'+rule.destination));
 });
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 async function pageFor(url,reduced=false){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
  await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const user={uid:'test',email:'fixture@example.test',providerData:[],getIdToken:async()=>'test'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged(fn){setTimeout(()=>fn(user),0);return()=>{}}})};`}));
  await page.addInitScript(()=>{
   const native=requestAnimationFrame,cancel=cancelAnimationFrame,frames=new Map();let id=0;
   window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return native(callback);const key=--id;frames.set(key,callback);return key;};
   window.cancelAnimationFrame=key=>key<0?frames.delete(key):cancel(key);
   window.chargeTestPending=()=>frames.size;
   window.chargeTestFrame=at=>{const current=[...frames.values()];frames.clear();current.forEach(callback=>callback(at));};
  });
  await page.goto(base+url);return page;
 }
 try{
  for(const url of ['/dashboard-charge.js?v=charge-1','/has/dashboard-charge.js?v=charge-2']){
   const response=await fetch(base+url);assert.equal(response.status,200,url);assert.match(response.headers.get('content-type'),/javascript/);assert.match(await response.text(),/window.chargeDashboard/);
  }
  const qaPage=await pageFor('/QA');
  const ring=qaPage.locator('.has-chart-card svg[data-charge-percent="21"]');
  await ring.waitFor();assert.equal(await ring.locator('text').first().textContent(),'0%');
  const arc=ring.locator('circle[pathLength="100"]');assert.equal(parseFloat(await arc.getAttribute('stroke-dasharray')),0);
  const account=qaPage.locator('[data-qa-scope=MU] svg');
  assert.equal(await account.locator('text').textContent(),'0%');
  await ring.scrollIntoViewIfNeeded();await qaPage.waitForTimeout(150);
  const total=qaPage.locator('.has-totals strong').first();assert.equal(await total.textContent(),'0');
  await qaPage.evaluate(()=>{chargeTestFrame(0);chargeTestFrame(550);});
  assert(Number(await total.textContent())>0&&Number(await total.textContent())<56);
  const middle=parseInt(await ring.locator('text').first().textContent());assert(middle>0&&middle<21);
  assert(parseFloat(await arc.getAttribute('stroke-dasharray'))>0&&parseFloat(await arc.getAttribute('stroke-dasharray'))<21);
  await qaPage.evaluate(()=>chargeTestFrame(1800));assert.equal(await ring.locator('text').first().textContent(),'21%');assert.equal(await account.locator('text').textContent(),'86%');
  assert.equal(parseFloat(await arc.getAttribute('stroke-dasharray')),21);
  assert.equal(await qaPage.locator('[data-qa-scope=NZ] svg text').textContent(),'—');
  await qaPage.evaluate(()=>{const original=chargeDashboard;window.chargeCalls=0;window.chargeDashboard=(...args)=>{window.chargeCalls++;return original(...args);};});
  await Promise.all([qaPage.waitForResponse(r=>r.url().includes('/has-pbb-api/dashboard')),qaPage.getByRole('button',{name:'Refresh statistics'}).click()]);
  await qaPage.waitForFunction(()=>window.chargeCalls>0);
  assert.equal(await ring.locator('text').first().textContent(),'21%','unchanged background data stays settled');
  const annual=await pageFor('/has-report-dashboard.html?year=2026');
  await annual.locator('#dashboard-summary strong').first().waitFor();
  assert.equal(await annual.locator('#dashboard-summary strong').count(),6);
  assert.equal(await annual.locator('.dashboard-loading-plot').count(),4);
  assert.equal(await annual.locator('.dashboard-loading-plot').first().evaluate(el=>el.getBoundingClientRect().height>=250),true);
  await new Promise(resolve=>{const timer=setInterval(()=>{if(annualResponse){clearInterval(timer);resolve();}},10);});annualResponse();
  await annual.locator('#dashboard-months tr').first().waitFor();
  assert.equal(await annual.locator('body').evaluate(body=>body.classList.contains('workspace-glass')),true);
  assert.equal(await annual.locator('.app-frame .home-topbar .top-nav a[href="/home"]').count(),1);
  assert.equal(await annual.locator('.home-sidebar a[href="/has-report"]').getAttribute('aria-current'),'page');
  const budget=annual.locator('#dashboard-summary strong').first();assert.equal(await budget.textContent(),'0.00');
  const bar=annual.locator('#dashboard-budget-chart rect[data-charge-plot]').first();assert.equal(Number(await bar.getAttribute('height')),0);
  await annual.waitForTimeout(150);
  await annual.evaluate(()=>{chargeTestFrame(0);chargeTestFrame(500);});const value=Number((await budget.textContent()).replaceAll(',',''));assert(value>0&&value<200);assert(Number(await bar.getAttribute('height'))>0);
  await annual.evaluate(()=>chargeTestFrame(1800));assert.equal(await budget.textContent(),'200.00');
  const recharge=annual.locator('#dashboard-recharge-chart rect[data-charge-plot]').first();assert.equal(Number(await recharge.getAttribute('height')),0,'offscreen chart waits');
  await annual.locator('#dashboard-recharge-chart svg').scrollIntoViewIfNeeded();await annual.waitForTimeout(150);
  await annual.evaluate(()=>{chargeTestFrame(2000);chargeTestFrame(2500);});assert(Number(await recharge.getAttribute('height'))>0,'chart starts when scrolled into view');
  await annual.evaluate(()=>chargeTestFrame(3800));
  const out=path.join(root,'.verification/dashboard-home-style');fs.mkdirSync(out,{recursive:true});
  for(const width of [1440,390]){
   await annual.setViewportSize({width,height:1000});
   assert.equal(await annual.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Dashboard page overflow');
   await annual.screenshot({path:path.join(out,'dashboard-'+width+'.png'),fullPage:true});
  }
  await annual.locator('.menu-toggle').click();assert.equal(await annual.locator('body').evaluate(body=>body.classList.contains('sidebar-open')),true);
  await annual.keyboard.press('Escape');assert.equal(await annual.locator('body').evaluate(body=>body.classList.contains('sidebar-open')),false);
  assert.equal(await annual.locator('tr[data-month="2026-01"] [data-metric=balanceHours]').textContent(),'-20.00');
  const delayed=await pageFor('/QA');await delayed.locator('.has-chart-card svg[data-charge-percent="21"]').waitFor();
  await delayed.evaluate(()=>{document.body.style.visibility='hidden';chargeDashboard(document.querySelector('.has-chart-card').parentElement,{replay:true});});
  await delayed.waitForTimeout(100);await delayed.evaluate(()=>{chargeTestFrame(0);chargeTestFrame(3000);});
  assert.equal(await delayed.locator('.has-chart-card svg[data-charge-percent="21"] text').first().textContent(),'0%','hidden content does not finish early');
  await delayed.evaluate(()=>{document.body.style.visibility='visible';});await delayed.waitForTimeout(100);
  await delayed.evaluate(()=>{chargeTestFrame(4000);chargeTestFrame(4550);});
  const revealed=parseInt(await delayed.locator('.has-chart-card svg[data-charge-percent="21"] text').first().textContent());assert(revealed>0&&revealed<21);
  const reduce=await pageFor('/QA',true);await reduce.locator('[data-qa-scope=MU] svg').waitFor();assert.equal(await reduce.locator('[data-qa-scope=MU] svg text').textContent(),'86%');
  assert.deepEqual(errors,[]);console.log('PASS QA rings and account percentages charge from zero, annual totals and charts charge, missing data and reduced motion preserved.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exit(1)});

