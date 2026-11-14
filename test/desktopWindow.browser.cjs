// SOURCE OUTPUT [PLAYWRIGHT_MODULE]. Static packaged pages and real desktop adapters;
// business scripts are excluded so this never signs in or sends operational data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[4]||'playwright');
(async()=>{
 const source=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
 const allowed=new Set(['/desktop-window.js','/desktop-ui.js','/desktop-navigation.js','/desktop-update.js']);
 const types={'.css':'text/css','.js':'text/javascript','.html':'text/html','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
 const server=http.createServer((req,res)=>{try{
   const name=new URL(req.url,'http://fixture').pathname;
   if(name.endsWith('.js')&&!allowed.has(name)){res.setHeader('Content-Type','text/javascript');return res.end('');}
   let content=fs.readFileSync(path.join(source,'web',name));
   if(name.endsWith('.html'))content=content.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</head>','<link rel="stylesheet" href="/desktop-navigation.css"><link rel="stylesheet" href="/desktop-background.css"><script defer src="/desktop-window.js"></script><script defer src="/desktop-update.js"></script><script defer src="/desktop-ui.js"></script><script defer src="/desktop-navigation.js"></script></head>');
   res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(content);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1500,height:980}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   const state={maximized:false,fullscreen:false};window.fixtureCalls=[];window.fixturePrepareResults=[];
   window.mufcDesktop={windowControl:async action=>{window.fixtureCalls.push(action);if(action==='maximize')state.maximized=!state.maximized;return {...state};},onWindowState:fn=>{window.fixtureWindowState=fn;},onUpdatePrepare:fn=>{window.fixturePrepare=fn;},updatePrepare:async result=>window.fixturePrepareResults.push(result),updateHealthy:async()=>{},settings:async()=>({version:'2.1.7',sync:{message:'Ready'}}),updateStatus:async()=>({status:'checked',message:'Software is up to date.'}),checkUpdates:async()=>({status:'checked'}),notes:async()=>({canEdit:false,notebook:{sections:[]}})};
   window.fetch=async()=>({ok:true,json:async()=>({})});
 });
 const records=[];
 for(const route of ['flights.html','index.html','login.html','cbs.html','cbs-form.html']){
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+route);await page.waitForSelector('.mufc-window-bar');
   await page.evaluate(()=>{document.body.classList.remove('is-loading');const a=document.querySelector('#flight-account');if(a)a.textContent='Lake';});
   for(const [width,height] of [[1000,700],[1500,980]]){
     await page.setViewportSize({width,height});
     const result=await page.evaluate(()=>{const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return {bar:rect(document.querySelector('.mufc-window-bar')),header:document.querySelector('.desktop-cbs-topbar,body>header')?rect(document.querySelector('.desktop-cbs-topbar,body>header')):null,settings:rect(document.querySelector('#mufc-settings-button')),buttons:[...document.querySelectorAll('[data-mufc-window-action]')].map(rect)};});
     assert.equal(result.bar.y,0);assert.equal(result.bar.height,32);assert.equal(result.bar.width,width);
     assert(result.buttons.every(b=>b.width===46&&b.height>20&&b.right<=width),'Visible window controls');
     if(result.header)assert(result.header.y>=32,'Navigation below window chrome: '+route);
     assert(result.settings.y>=32,'Settings below window chrome');records.push({route,width,...result});
     if(route==='index.html')assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'Dashboard must not overflow by the caption height');
   }
   await page.screenshot({path:path.join(out,route+'.png')});
   await page.locator('#mufc-settings-button').click();await page.waitForSelector('dialog[open] .mufc-window-bar');
   await page.locator('[data-mufc-window-action="maximize"]').click();assert.equal(await page.locator('[data-mufc-window-action="maximize"]').getAttribute('aria-label'),'Restore');
   await page.screenshot({path:path.join(out,route+'-settings.png')});
   await page.locator('[data-close]').click();await page.waitForSelector('body > .mufc-window-bar');
   const maximized=await page.evaluate(()=>({height:getComputedStyle(document.body).getPropertyValue('--mufc-window-height').trim(),bar:document.querySelector('.mufc-window-bar').getBoundingClientRect().width}));
   assert.equal(maximized.height,'0px');assert.equal(maximized.bar,138);
   await page.screenshot({path:path.join(out,route+'-maximized.png')});
   await page.locator('[data-mufc-window-action="maximize"]').click();
   await page.evaluate(()=>window.fixtureWindowState({fullscreen:true}));assert.equal(await page.locator('.mufc-window-bar').isVisible(),false);
   await page.evaluate(()=>window.fixtureWindowState({fullscreen:false}));assert.equal(await page.locator('.mufc-window-bar').isVisible(),true);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(records,null,2));console.log('Passed: 5 packaged pages at 2 widths; Settings top layer, maximize/restore and fullscreen.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
