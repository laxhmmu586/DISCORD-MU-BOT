'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function apply(source,config) {
  const read=name=>fs.readFileSync(path.join(source,name),'utf8');
  const write=(name,text)=>{fs.mkdirSync(path.dirname(path.join(source,name)),{recursive:true});fs.writeFileSync(path.join(source,name),text);};
  function replace(text,from,to){assert(text.includes(from),'Unsupported desktop base: '+from.slice(0,80));return text.replace(from,to);}
  assert.equal(JSON.parse(read('package.json')).version,'2.1.4','Audit a new base before changing this pin');
  for(const file of ['updater.cjs','core.cjs','integration.cjs','publisher.cjs'])write('src/updates/'+file,fs.readFileSync(path.join(__dirname,file)));
  write('web/desktop-update.js',fs.readFileSync(path.join(__dirname,'renderer.js')));
  write('update-config.json',JSON.stringify(config,null,2));
  let main=read('src/main.js');
  main=replace(main,"const { autoUpdater } = require('electron-updater');",'// Core and UI updates use the signed MUFC manifest.');
  main=replace(main,'let window, origin, server;','let window, origin, server, secureUpdates;');
  main=replace(main,"const secret = crypto.randomBytes(32).toString('hex');",`secureUpdates=await require('./updates/integration.cjs').create({app,config:require('../update-config.json'),ipcMain,session:desktopSession,fetch:global.fetch});
    const secret = crypto.randomBytes(32).toString('hex');`);
  main=replace(main,"path.join(app.getPath('userData'),'sheet-sync.json')))","path.join(app.getPath('userData'),'sheet-sync.json'), id=>secureUpdates.webRoot(id)))");
  main=replace(main,"if (details.url.startsWith(origin + '/')) details.requestHeaders['X-MUFC-Session'] = secret;",`if (details.url.startsWith(origin + '/')) {details.requestHeaders['X-MUFC-Session'] = secret;secureUpdates.requestHeaders(details.requestHeaders);}`);
  main=replace(main,"event.sender !== window.webContents || new URL(event.senderFrame.url).origin !== origin","event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin");
  main=replace(main,"['logFolder', 'historyFolder', 'salesFolder']","['logFolder', 'historyFolder']");
  main=replace(main,"ipcMain.handle('updates:status', event => { trusted(event); return updateState; });","ipcMain.handle('updates:status', event => { trusted(event); return secureUpdates.updater.status; });");
  main=replace(main,"ipcMain.handle('updates:check', async event => { trusted(event); if (updateState.status !== 'not-configured') await autoUpdater.checkForUpdates(); return updateState; });","ipcMain.handle('updates:check', async event => { trusted(event); return secureUpdates.updater.check(); });");
  main=replace(main,"window.setMenuBarVisibility(false);",`window.setMenuBarVisibility(false);
    secureUpdates.bind(window,!smokeTest&&!process.argv.includes('--protection-smoke'));
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    desktopSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:details.resourceType==='script'&&!details.url.startsWith(origin+'/')}));`);
  const start=main.indexOf('    if (app.isPackaged) {\n      try {\n        await fs.access(');
  assert(start>=0);const end=main.indexOf('\n  }).catch(',start);assert(end>start);
  main=main.slice(0,start)+main.slice(end);
  write('src/main.js',main);
  let preload=read('src/preload.js');
  preload=replace(preload,'contextBridge.exposeInMainWorld',`if (process.isMainFrame) contextBridge.exposeInMainWorld`);
  preload=replace(preload,"  googleSignIn:",`  onUpdatePrepare: callback => {ipcRenderer.on('hotfix:prepare', (_event,data)=>callback(data));},
  updatePrepare: data => ipcRenderer.invoke('hotfix:prepared',data),
  updateHealthy: data => ipcRenderer.invoke('hotfix:healthy',data),
  googleSignIn:`);
  write('src/preload.js',preload);
  let server=read('src/server.js');
  server=replace(server,"syncFile = '') {","syncFile = '', updateRoot = () => path.resolve(__dirname,'../web')) {");
  server=replace(server,"  const webRoot = path.resolve(__dirname, '../web');",'');
  server=replace(server,"  let onlineAuthorization='', onlineUntil=0;",`  let onlineAuthorization='', onlineUntil=0;
  const publisher=require('./updates/publisher.cjs').createPublisher({store,context:require('./flight-context'),getAuthorization:()=>Date.now()<onlineUntil?onlineAuthorization:''});
  const publishTimer=setInterval(()=>void publisher.tick(),10000);publishTimer.unref();`);
  server=replace(server,"return json(res,{approved:true});","void publisher.tick();return json(res,{approved:true});");
  server=replace(server,"      const relative = url.pathname === '/' ? '/index.html' : localPath;",`      if(url.pathname==='/flight-day-sync')return json(res,{error:'Desktop publishing is main-process only.'},403);
      const webRoot=updateRoot(req.headers['x-mufc-ui-version']||'bundled');
      const relative = url.pathname === '/' ? '/index.html' : localPath;`);
  server=replace(server,"<script defer src=\"/desktop-session.js\"></script>",'<script defer src="/desktop-session.js"></script><script defer src="/desktop-update.js"></script>');
  server=replace(server,'window.MU_API_BASE=location.origin;',"window.MU_API_BASE=location.origin;window.mufcUIVersion='+JSON.stringify(req.headers['x-mufc-ui-version']||'bundled')+';");
  server=replace(server,"'Cache-Control': 'no-cache'","'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':\"script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-src 'self' blob:; worker-src 'self' blob:\"");
  const salesStart=server.indexOf("      if (url.pathname.startsWith('/sales-report/')) {");
  const salesEnd=server.indexOf("      if(url.pathname==='/flight-day-sync')",salesStart);assert(salesEnd>salesStart);
  // Sales stays on Drive using the existing authenticated cloud API proxy.
  server=server.slice(0,salesStart)+server.slice(salesEnd);
  server=replace(server,"syncStatus:()=>syncQueue.status()","syncStatus:()=>publisher.status()");
  server=replace(server,"server.on('close', () => visa.close());","server.on('close', () => {clearInterval(publishTimer);visa.close();});");
  // /search continues local full-log analysis; operational fields are read back
  // from the committed SQLite response and cannot be replaced by cloud enrichment.
  server=replace(server,"if (!local.sy) return json(res,local);",`if (!local.sy) return json(res,local);
        const operational=publisher.snapshot()?.flights?.find(f=>f.flightNo===local.sy.flightNo&&f.flightDate===local.sy.flightDate);
        if(operational)Object.assign(local.sy,{gate:operational.gate,bdt:operational.bdt,ed:operational.ed,sd:operational.sd});`);
  write('src/server.js',server);
  let ui=read('web/desktop-ui.js');
  ui=replace(ui,", ['salesFolder', 'Sales Report files']",'');
  ui=ui.replace("' · Local flight sync: cloud connection pending'","' · Flight sync: '+(settings.sync.pending?'waiting':'ready')");
  ui=ui.replace(/if\(settings\.sync\) modal\.querySelector\('\[data-version\]'\)\.textContent \+= [^\n]+/,"if(settings.sync) modal.querySelector('[data-version]').textContent += ' · '+settings.sync.message;");
  ui=ui.replace('Local mode reads files on this computer. Online mode uses the same flight data, Gmail checks and server settings as the web version.','eTerm and history files are read on this computer. Today’s SY/BND sync to boarding SQLite. Sales Report uses Google Drive.');
  write('web/desktop-ui.js',ui);
  let flights=read('web/flights-online.js');
  flights=replace(flights,"<div class=\"flight-card-actions\">",'<div class="flight-stats"><div><span>GATE</span><strong>${escape(flight.gate || "—")}</strong></div><div><span>BDT</span><strong>${escape(flight.bdt || "—")}</strong></div><div><span>ETD</span><strong>${escape(flight.ed || "—")}</strong></div></div><div class="flight-card-actions">');
  flights=replace(flights,"    if(!restore())void refresh();","    restore();void refresh();");
  flights=replace(flights,"  reload.onclick = () => refresh(true);","  setInterval(()=>{if(!document.hidden)void refresh();},10000);\n  reload.onclick = () => refresh(true);");
  write('web/flights-online.js',flights);
  // Firebase SDKs are already bundled and part of the Core trust boundary.
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name.endsWith('.html'))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-(?:app|auth)-compat\.js)/g,'/assets/firebase/$1'));}}
  walk(path.join(source,'web'));
}
module.exports={apply};
