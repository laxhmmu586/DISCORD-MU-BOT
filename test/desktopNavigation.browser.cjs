const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const source=path.resolve(process.argv[2]),nativeFetch=global.fetch,token='fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 global.fetch=async(resource,options)=>{
  const u=new URL(resource);
  if(u.hostname==='identitytoolkit.googleapis.com')return Response.json({users:[{localId:'fixture'}]});
  if(u.origin==='https://api.mufcapp.net'){
   if(u.pathname==='/desktop-access')return Response.json({approved:true});
   if(u.pathname==='/profile-api')return Response.json({state:'ready',profile:{id:'fixture',name:'Test Employee',nickname:'Lake',station:'LAX',account:'MU'}});
   if(u.pathname==='/reports/version')return Response.json({revision:1,modules:{vip:1,psmMsg:1,inad:1,salesDetails:1}});
   return Response.json({rows:[],flights:[],tasks:[],memos:[],permissions:{},records:[],canAccess:false});
  }
  return nativeFetch(resource,options);
 };
 const {server,origin}=await require(path.join(source,'src/server.js')).startServer({},'fixture-secret',0);
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({extraHTTPHeaders:{'X-MUFC-Session':'fixture-secret'},viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({token})=>{
  sessionStorage.setItem('mufc-selected-flight',JSON.stringify({flightNo:'MU586',flightDate:'06NOV26',source:'current'}));sessionStorage.setItem('mufc-desktop-mode','online');
  window.mufcDesktop={settings:async()=>({version:'2.1.1'}),updateStatus:async()=>({message:''}),notes:async()=>({canEdit:false,notebook:{sections:[]}})};
  window.fixtureToken=token;
 },{token});
 await page.route('**/assets/firebase/firebase-*-compat.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`(()=>{const user={uid:'fixture',email:'lake@mu.com',providerData:[],getIdToken:async()=>window.fixtureToken};const state={currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};},onIdTokenChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};},setPersistence:async()=>{}};const auth=()=>state;auth.Auth={Persistence:{LOCAL:'local'}};window.firebase={apps:[{}],auth};})();`}));
 const auth=await context.request.post(origin+'/desktop-auth',{headers:{Authorization:'Bearer '+token}});assert.equal(auth.status(),200);
 try{
  const expected=['REPORT','BAGGAGE','LBS','NOTES','FORM'];
  for(const p of ['/boarding-pass.html','/reissue.html','/reissue-ticket','/reissue-draft','/%62oarding-pass.html']){const r=await context.request.get(origin+p);assert.equal(r.status(),410,p);}
  assert(!fs.existsSync(path.join(source,'web/boarding-pass.html')));assert(!fs.existsSync(path.join(source,'web/reissue.html')));
  assert(!fs.readFileSync(path.join(source,'src/preload.js'),'utf8').includes('boarding:request'));
  assert(!fs.readFileSync(path.join(source,'src/main.js'),'utf8').includes('boardingService'));
  for(const p of ['/index.html','/report.html','/baggage.html','/cbs.html','/notes.html']){
   await page.goto(origin+p);await page.locator('body > header .desktop-primary-nav, .desktop-cbs-topbar .desktop-primary-nav').first().waitFor();
   assert.deepEqual(await page.locator('body > header .desktop-primary-nav > *, .desktop-cbs-topbar .desktop-primary-nav > *').allTextContents(),expected,p);
  }
  await page.goto(origin+'/index.html');await page.locator('body > header .desktop-primary-nav').getByText('REPORT',{exact:true}).click();await page.waitForURL('**/report.html');
  assert.deepEqual((await page.locator('.report-mode-actions [data-report-mode]').allTextContents()).map(t=>t.trim()),['Sales Report','Sales Details','VIP Report','Authorization Report','INAD Report']);
  assert.equal(await page.locator('#report-page iframe,[data-local-report]').count(),0);
  assert.equal(await page.locator('.status-strip').count(),0);
  const header=await page.locator('body > header').boundingBox(),title=await page.locator('h1').boundingBox();assert(title.y>=header.y+header.height&&title.y<260,'Report begins beneath the header');
  for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal clipping');}
  await page.setViewportSize({width:1440,height:1000});fs.mkdirSync('output/desktop-navigation-2.1.1',{recursive:true});await page.screenshot({path:'output/desktop-navigation-2.1.1/report-center.png',fullPage:true});
  await page.locator('body > header .desktop-primary-nav').getByText('BAGGAGE',{exact:true}).click();await page.waitForURL('**/baggage.html');assert(await page.locator('#test-page').isVisible());
  await page.locator('body > header .desktop-primary-nav').getByText('FORM',{exact:true}).click();await page.waitForURL('**/index.html*');
  await page.locator('.desktop-primary-nav').first().waitFor();
  await page.locator('.flight-forms[open]').waitFor({timeout:5000});
  const web=await browser.newPage({viewport:{width:1440,height:1000}});let flightScript='';
  await web.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.hostname==='www.gstatic.com')return route.fulfill({body:'',contentType:'text/javascript'});
   if(p==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{uid:'fixture',email:'lake@mu.com',providerData:[],getIdToken:async()=>'fixture'},onAuthStateChanged:fn=>{setTimeout(()=>fn({uid:'fixture',email:'lake@mu.com',providerData:[],getIdToken:async()=>'fixture'}),0);return()=>{};}})};`});
   if(url.hostname==='api.mufcapp.net')return route.fulfill({json:p==='/flights'?{flights:[{flightNo:'MU586',flightDate:'06NOV26'}]}:{rows:[],flights:[],tasks:[],state:'external',canAccess:false}});
   if(p==='/flights.js')flightScript=url.search;
   const file=[path.join(process.cwd(),'public/public',p),path.join(process.cwd(),'has/public',p.replace(/^\/has\//,''))].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
   return file?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await web.goto('http://web.fixture/flights.html');await web.getByRole('button',{name:'Enter MU586 boarding'}).waitFor();
  assert.equal(await web.getByText('Enter Dashboard',{exact:true}).count(),0);assert.equal(await web.locator('.flight-pbb-link').count(),1);assert.equal(await web.locator('.flight-pbb-link').getAttribute('href'),'/has-pbb.html');assert(flightScript.includes('web-jet-bridge-v3')); 
  await web.screenshot({path:'output/desktop-navigation-2.1.1/web-flights.png',fullPage:true});await web.close();
  console.log(JSON.stringify({navigationPages:5,reportTabs:5,noNestedReport:true,reportAndBaggageNavigation:true,formOpens:true,webDashboardRemoved:true,pageErrors:errors}));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));global.fetch=nativeFetch;}
})().catch(e=>{console.error(e);process.exitCode=1;});
