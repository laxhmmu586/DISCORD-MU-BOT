const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const source=path.resolve(process.argv[2]),nativeFetch=global.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'mufc-cbs-')),token='fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const posts=[],streams=new Set();let revision=1,tag='MU123456',publicKey,signed=0;
 const summary=()=>({open:{passenger:1,'on-hand':1,'bag-room':1},closed:{passenger:1},caseCounts:{open:{passenger:1,'on-hand':1,'bag-room':1},closed:{'2026-11':{passenger:1,'on-hand':0,'bag-room':0}}},missingOpenCount:0,rushMissingWorldTracer:0});
 const mockFetch=async(resource,options={})=>{
  const u=new URL(resource),p=u.pathname,h=new Headers(options.headers);
  if(u.hostname==='identitytoolkit.googleapis.com')return Response.json({users:[{localId:'fixture'}]});
  if(u.origin!=='https://api.mufcapp.net')return nativeFetch(resource,options);
  const message=require('../desktopProtection').message({method:options.method||'GET',url:p+u.search,time:h.get('X-MUFC-Time'),nonce:h.get('X-MUFC-Nonce'),authorization:h.get('Authorization'),body:options.body});
  assert.equal(h.get('Authorization'),'Bearer '+token);assert(crypto.verify(null,Buffer.from(message),publicKey,Buffer.from(h.get('X-MUFC-Signature'),'base64url')));signed++;
  if(p==='/desktop-access')return Response.json({approved:true});
  if(p==='/cbs-live-stream')return new Response(new ReadableStream({start(c){streams.add(c);c.enqueue(new TextEncoder().encode('event: connected\ndata: {}\n\n'));},cancel(){}}),{headers:{'Content-Type':'text/event-stream'}});
  if(p==='/cbs-revision')return Response.json({revision,modules:{'passenger:open':revision,'passenger:closed':revision,'on-hand:open':revision,'bag-room:open':revision,rush:revision,missing:revision,shipment:revision},summary:summary()});
  if(options.method==='POST'){
   let body={};if(options.body?.length)body=JSON.parse(Buffer.from(options.body).toString());posts.push({path:p,body});revision++;
   if(p.startsWith('/cbs-bag-tags/'))tag=body.bagTag;
   return Response.json({updated:true,sent:true,success:true,rows:[]});
  }
  if(p==='/cbs-cases')return Response.json({rows:[{rowNumber:2,source:'pir',bagTag:tag,worldTracerFileNumber:'LAXMU12345',caseType:'AHL',passengerName:'TEST PASSENGER',status:u.searchParams.get('view')==='closed'?'Closed':'Open',submittedAt:'2026-11-06T16:00:00Z',updateEvents:[]}],total:1,pages:1,counts:summary().open,months:['2026-11']});
  if(p==='/cbs-unresolved-baggage')return Response.json({rows:[{rowNumber:3,bagTag:'MU369804',direction:'Outbound',flightNumber:'MU586',flightDate:'2026-11-06',bagType:'Not load bags',status:'Not load bags',createdAt:'2026-11-06T16:00:00Z',updateEvents:[]}]});
  if(p.startsWith('/test-baggage/'))return Response.json({found:false});
  return Response.json({rows:[],flights:[],tasks:[],records:[],canAccess:false});
 };
 global.fetch=await require('../scripts/desktop-protection/device-client.cjs').createDeviceClient(dir,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},mockFetch);
 publicKey=JSON.parse(fs.readFileSync(path.join(dir,'desktop-device-enrollment.json'))).publicKey;
 const {server,origin}=await require(path.join(source,'src/server.js')).startServer({},'fixture-secret',0);
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'X-MUFC-Session':'fixture-secret'}}),page=await context.newPage(),errors=[],missing=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404&&r.url().startsWith(origin))missing.push(r.url());});
 await page.addInitScript(({token})=>{sessionStorage.setItem('mufc-desktop-mode','online');window.fixtureToken=token;window.mufcDesktop={settings:async()=>({version:'2.1.2'}),updateStatus:async()=>({message:''})};},{token});
 await page.route('**/assets/firebase/firebase-*-compat.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`(()=>{const user={uid:'fixture',email:'lake@mu.com',providerData:[],getIdToken:async()=>window.fixtureToken};const state={currentUser:user,signOut:async()=>{state.currentUser=null;},onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};},onIdTokenChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}};window.firebase={apps:[{}],auth:()=>state};})();`}));
 const auth=await context.request.post(origin+'/desktop-auth',{headers:{Authorization:'Bearer '+token}});assert.equal(auth.status(),200);
 try{
  await page.goto(origin+'/cbs.html');await page.locator('#cases-output [data-edit-bag-tag]').first().waitFor();
  assert.equal(await page.locator('.page-tabs .page-tab').count(),8);assert.deepEqual(await page.locator('.desktop-cbs-topbar nav a').allTextContents(),['REPORT','BAGGAGE','LBS','NOTES','FORM']);
  await page.waitForFunction(()=>[...document.querySelectorAll('img.cbs-art')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('#cbs-live-status.connected').waitFor();
  const bag=page.locator('#cases-output [data-edit-bag-tag]').first();await bag.dblclick();await bag.getByRole('textbox').fill('MU999999');await bag.getByRole('textbox').press('Enter');await page.waitForFunction(()=>document.querySelector('#cases-output [data-edit-bag-tag]')?.textContent==='MU999999');assert(posts.some(p=>p.path.startsWith('/cbs-bag-tags/')));
  for(const [tab,card] of [['#worldtracer-tab','#worldtracer-card'],['#add-baggage-tab','#add-baggage-card'],['#missing-report-alert','#missing-report-card'],['#email-tab','#email-card'],['#baggage-chart-tab','#baggage-chart-card'],['#shipment-tab','#shipment-card'],['#closed-cases-tab','#open-cases-card'],['#open-cases-tab','#open-cases-card']]){await page.locator(tab).click();assert(await page.locator(card).isVisible(),tab);}
  await page.locator('#add-baggage-tab').click();await page.locator('#add-baggage-search input').fill('MU654321');await page.locator('#add-baggage-search button').click();await page.locator('[data-add-baggage-mode=outbound]').click();await page.locator('#add-baggage-output [data-add-baggage-direction=outbound]').waitFor();
  await Promise.all([page.waitForResponse(r=>r.url().includes('/test-baggage')&&r.request().method()==='POST'),page.locator('[data-add-baggage-direction=outbound] button[type=submit]').click()]);assert(posts.some(p=>p.path==='/test-baggage'&&p.body.bagTag==='MU654321'));
  await page.locator('#worldtracer-tab').click();await page.locator('#worldtracer-form [name=originalTagNumber]').fill('MU123456');await page.locator('#worldtracer-form [name=rushTagNumber]').fill('MU234567');await page.locator('#worldtracer-form [data-flight-number]').fill('MU586');await page.locator('#worldtracer-form [data-flight-from]').fill('LAX');await page.locator('#worldtracer-form [data-flight-to]').fill('PVG');await page.locator('#worldtracer-form button[type=submit]').click();await page.locator('#worldtracer-status').getByText('Rush Bag case created and saved.',{exact:true}).waitFor();assert(posts.some(p=>p.path==='/cbs-worldtracer-cases'));
  await page.locator('#email-tab').click();await page.locator('#standalone-email-form input[type=file]').setInputFiles({name:'authorization.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture')});await page.locator('#standalone-email-form button[type=submit]').click();await page.getByText('Email sent.',{exact:true}).waitFor();const email=posts.find(p=>p.path==='/cbs-email');assert.equal(email.body.attachments[0].filename,'authorization.pdf');
  await page.locator('#baggage-chart-tab').click();await page.waitForFunction(()=>[...document.querySelectorAll('.baggage-chart-image')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('#open-cases-tab').click();await page.locator('#case-search').fill('MU999999');for(const c of streams){try{c.enqueue(new TextEncoder().encode('event: refresh\ndata: {}\n\n'));}catch{}}assert.equal(await page.locator('#case-search').inputValue(),'MU999999');
  await page.waitForFunction(()=>document.querySelector('#cases-output')?.textContent.includes('MU999999'));
  fs.mkdirSync('output/complete-cbs-2.1.2',{recursive:true});await page.screenshot({path:'output/complete-cbs-2.1.2/cbs.png',fullPage:true});
  await page.locator('#sidebar-form').click();await page.waitForURL('**/cbs-form.html');assert.equal(await page.locator('.choices a').count(),2);await page.locator('.choice--damaged').click();await page.waitForURL('**/pir-form.html*');await page.locator('#damage-sketch').waitFor({state:'attached'});
  for(const asset of ['/assets/Baggage.fbx','/assets/studio_small_08_1k.hdr','/vendor/three.module.js'])assert.equal((await context.request.get(origin+asset)).status(),200,asset);
  await page.waitForFunction(()=>Boolean(window.DamageViewer),{},{timeout:20000});
  await page.goto(origin+'/cbs.html');await page.locator('#sidebar-logout').waitFor();await page.route('**/login.html',r=>r.fulfill({body:'<!doctype html><title>Signed out</title>'}));await page.locator('#sidebar-logout').click();await page.waitForURL('**/login.html');assert.equal((await context.request.get(origin+'/cbs.html',{maxRedirects:0})).status(),302,'CBS Logout clears native access');
  assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({sections:8,localAssets:true,signedCloudRequests:signed,inlineEditing:true,emailAttachment:true,baggageSearch:true,liveSync:true,cbsForms:true,pageErrors:errors,missingAssets:missing}));
 }finally{for(const c of streams)try{c.close();}catch{}await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));global.fetch=nativeFetch;fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
