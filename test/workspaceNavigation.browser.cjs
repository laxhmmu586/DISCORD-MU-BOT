const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 fs.mkdirSync('.verification',{recursive:true});
 const root=path.resolve('has/public'),server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://local').pathname.replace(/^\/has\//,'/'));
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'image/webp');res.end(fs.readFileSync(file));
 }).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());url.pathname=url.pathname.replace(/^\/has\//,'/');if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname.endsWith('.js')&&!['/workspace-shell.js','/flight-account.js','/workspace-header.js'].includes(url.pathname))return route.fulfill({body:''});if(url.pathname.includes('-api'))return route.fulfill({json:{}});return route.continue();});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const name of ['profile','briefing','schedule','has-form','home']){
   await page.goto(origin+'/'+name+'.html');if(name==='home')await page.addScriptTag({url:origin+'/flight-account.js'});
   await page.locator('.workspace-bell').waitFor({state:'attached'}).catch(async error=>{console.log('Errors',errors);console.log('Scripts',await page.locator('script').evaluateAll(nodes=>nodes.map(n=>n.src)));throw error;});await page.evaluate(()=>{document.body.removeAttribute('data-permission-pending');document.documentElement.classList.remove('home-auth-pending');});
   await page.evaluate(()=>{
    for(const node of document.querySelectorAll('.profile-sidebar [data-report-access],.home-sidebar [data-report-access],.profile-sidebar [data-checklist-access],.home-sidebar [data-checklist-access]'))node.hidden=false;
    window.dispatchEvent(new CustomEvent('workspace-profile',{detail:{user:{uid:'qa'},profile:{name:'Example',station:'LAX',account:'MU',canViewOperations:true,canViewForm:true}}}));
   });
   const expected=['Home','BRIEFING','SCHEDULE','REPORT','CHECKLIST','READ & SIGN','Admin'];
   await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('.profile-topbar .top-nav>a')].filter(node=>!node.hidden).map(node=>node.textContent.trim()))===JSON.stringify(expected),expected);
   for(const width of [2560,1440,900,390,320]){
    await page.setViewportSize({width,height:950});const nav=page.locator('.profile-topbar .top-nav');
    assert.deepEqual(await nav.locator(':scope>a:visible').allTextContents(),expected,name+' '+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' '+width+' containment');
    assert.equal(await nav.locator('[data-department="qa"],.top-nav-placeholder,[data-department="finance"]').count(),0);
    if(name==='schedule'){
     assert.equal(await page.locator('.profile-sidebar').isVisible(),false);assert.equal(await page.locator('.sidebar-collapse').isVisible(),false);assert.equal(await page.locator('.menu-toggle').isVisible(),false);
     if(width>760)assert(await page.evaluate(()=>Math.abs(document.querySelector('.profile-shell').getBoundingClientRect().left-document.querySelector('.app-frame').getBoundingClientRect().left)<35));
    }else if(width>760)assert(await page.locator('.home-sidebar').isVisible());
    if(width<761){assert(await nav.evaluate(el=>el.scrollWidth>el.clientWidth));await nav.evaluate(el=>el.scrollLeft=1000);assert(await nav.evaluate(el=>el.scrollLeft>0));await nav.evaluate(el=>el.scrollLeft=0);}
    if(name==='schedule'||name==='home')await page.screenshot({path:'.verification/nav-'+name+'-'+width+'.png'});
   }
   await page.evaluate(()=>{
    for(const node of document.querySelectorAll('.profile-sidebar [data-report-access],.home-sidebar [data-report-access],.profile-sidebar [data-checklist-access],.home-sidebar [data-checklist-access]'))node.hidden=true;
    window.dispatchEvent(new CustomEvent('workspace-profile',{detail:{user:{uid:'qa'},profile:{station:'SFO',account:'CZ',canViewOperations:false}}}));
   });
   await page.waitForFunction(()=>[...document.querySelectorAll('.top-nav [data-workspace-operation]')].filter(node=>!node.hidden).map(node=>node.textContent).join(',')==='READ & SIGN');
   console.log('PASS:',name,'ordered navigation, permission changes and five viewport widths');
  }
  assert.deepEqual(errors,[]);console.log('PASS: Schedule has no left sidebar, artwork, footer or collapse control; other pages retain their sidebar.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
