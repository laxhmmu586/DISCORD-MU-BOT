// Run with Electron: electron scripts/verify-flight-ui.cjs
// All Firebase and API calls use local fixtures; no operational writes occur.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {discoverFlights,operationalDate}=require('../flightContext');
const root=path.resolve(__dirname,'../public/public');
const out=process.env.FLIGHT_UI_OUTPUT || path.join(app.getPath('temp'),'mufc-online-flight-ui');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'online-flight-ui-'+process.pid));
app.on('window-all-closed',()=>{});
let server,win;
app.whenReady().then(async()=>{
  await fs.mkdir(out,{recursive:true});
  const sample=await fs.readFile(path.join(__dirname,'../test/fixtures/flight-selection-supplied.log'),'utf8');
  const today=operationalDate();
  let log=['MU586','MU9586','MU578','MU583','MU577'].map(f=>sample.replaceAll('MU586',f).replaceAll('08OCT26',today).replace('GTD/????','GTD/132')).join('\n');
  let origin; const calls=[];
  server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,origin);
    if(url.pathname==='/mock-firebase.js'){res.setHeader('Content-Type','text/javascript');return res.end(`window.firebase={apps:[{}],auth:()=>({currentUser:{email:'fixture@example.test',getIdToken:async()=> 'fixture'},onAuthStateChanged:fn=>fn({email:'fixture@example.test',getIdToken:async()=> 'fixture'})})};`);}
    if(url.pathname==='/__/firebase/init.js'){res.setHeader('Content-Type','text/javascript');return res.end('');}
    if(url.pathname==='/flights'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({flights:discoverFlights(log,{date:today})}));}
    if(url.pathname==='/search'||url.pathname.startsWith('/cbs-scan')){calls.push({path:url.pathname,flight:url.searchParams.get('flightNo'),date:url.searchParams.get('flightDate')});res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,rows:[],error:'fixture'}));}
    try{
      let content=await fs.readFile(path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1)));
      const ext=path.extname(url.pathname);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[ext]||'application/octet-stream');
      if(ext==='.html')content=content.toString().replace(/<head([^>]*)>/i,`<head$1><script>window.MU_API_BASE=location.origin;</script>`);
      res.end(content);
    }catch{res.statusCode=404;res.end('missing');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  const ses=session.fromPartition('flight-ui-'+process.pid);
  ses.webRequest.onBeforeRequest((details,done)=>{
    if(details.url.startsWith('https://www.gstatic.com/firebasejs/'))return done({redirectURL:origin+'/mock-firebase.js'});
    done({cancel:/^https?:/.test(details.url)&&!details.url.startsWith(origin+'/')});
  });
  win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{session:ses,contextIsolation:true}});
  const run=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI timeout: '+code);};
  await win.loadURL(origin+'/flights.html');await wait('document.querySelectorAll(".flight-card").length===3');
  assert.deepEqual(await run('[...document.querySelectorAll(".flight-card")].map(c=>c.dataset.flight)'),['MU586','MU9586','MU578']);
  assert.equal(await run('getComputedStyle(document.querySelector(".flight-card")).webkitBoxReflect'),'none');
  assert.deepEqual(await run('[...document.querySelectorAll(".flight-services b")].map(e=>e.textContent)'),['REPORT','BAGGAGE','LBS','BOARDING','240']);
  await run('new Promise(resolve=>{const i=new Image();i.onload=resolve;i.onerror=resolve;i.src="/assets/mission-earth.png"})');
  await new Promise(r=>setTimeout(r,800));
  await fs.writeFile(path.join(out,'online-three-flights.png'),(await win.webContents.capturePage()).toPNG());
  await run('window.setMufcFlight({flightNo:"MU578",flightDate:'+JSON.stringify(today)+'})');
  for(const endpoint of ['/search?q=14','/cbs-scan','/cbs-scan2/records','/cbs-scan2/nbrd-bns/2/delete'])await run(`fetch(location.origin+${JSON.stringify(endpoint)}).then(r=>r.json())`);
  assert.ok(calls.every(c=>c.flight==='MU578'&&c.date===today));
  log=sample.replaceAll('08OCT26',today);
  await win.loadURL(origin+'/flights.html');await wait('document.querySelectorAll(".flight-card").length===1');
  assert.equal(await run('location.pathname'),'/flights.html');
  await run('window.setMufcFlight(null)');await win.loadURL(origin+'/scan.html');await wait('location.pathname==="/flights.html" && document.querySelectorAll(".flight-card").length===1');
  assert.equal(await run('new URLSearchParams(location.search).get("next")'),'/scan.html');
  await run('document.querySelector(".flight-enter").click()');await wait('location.pathname==="/scan.html" && document.querySelector("[data-selected-flight]")?.textContent.includes("MU586")');
  await win.loadURL(origin+'/index.html');await wait('document.querySelector("#header-select-flight")');
  await run('document.body.classList.remove("is-loading")');
  assert.equal(await run('(()=>{const a=document.querySelector("#header-select-flight").getBoundingClientRect(), b=document.querySelector("#mission-search").getBoundingClientRect();return a.width>0&&a.x>innerWidth/2&&a.right<=b.left})()'),true);
  await new Promise(r=>setTimeout(r,300));
  await fs.writeFile(path.join(out,'online-header-switch.png'),(await win.webContents.capturePage()).toPNG());
  await run('document.querySelector("#header-select-flight").click()');await wait('location.pathname==="/flights.html" && document.querySelector(".flight-card")');
  await win.loadURL(origin+'/flights.html');await wait('document.querySelectorAll(".flight-card").length===1');win.setContentSize(390,844);
  await new Promise(r=>setTimeout(r,500));
  await fs.writeFile(path.join(out,'online-mobile.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await fs.writeFile(path.join(out,'online-ui.json'),JSON.stringify({threeFlights:true,arrivalsExcluded:true,singleFlightRequiresChoice:true,noReflection:true,bottomServices:true,scopedRequests:calls,headerFlightSwitch:true,guardAndReturnToScanner:true,mobileNoOverflow:true},null,2));
  win.destroy();server.close();app.quit();
}).catch(error=>{console.error(error);win?.destroy();server?.close();app.exit(1);});
