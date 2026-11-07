'use strict';
// BASE_RUNTIME NEW_OUTPUT ASAR_MODULE. Isolated native Electron acceptance;
// never launches the installed app or signs an employee into a business service.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
(async()=>{
 const [base,out,asarPath]=process.argv.slice(2);assert(base&&out&&asarPath);const output=path.resolve(out);assert(!await fs.stat(output).then(()=>true,()=>false),'Use a new acceptance directory');
 const source=path.join(output,'source'),runtime=path.join(output,'runtime');await fs.mkdir(path.join(source,'src/updates'),{recursive:true});await fs.cp(base,runtime,{recursive:true});
 for(const name of ['updater.cjs','integration.cjs','core.cjs'])await fs.copyFile(path.join(__dirname,'desktop-updates',name),path.join(source,'src/updates',name));
 await fs.mkdir(path.join(source,'web'));await fs.copyFile(path.join(__dirname,'desktop-updates/renderer.js'),path.join(source,'web/desktop-update.js'));
 await fs.writeFile(path.join(source,'package.json'),JSON.stringify({name:'mufc-hotfix-acceptance',version:'2.1.5',main:'main.cjs'}));
 const html=marker=>`<html><head><script>window.firebase={apps:[1]};</script><script defer src="/desktop-update.js"></script></head><body data-marker="${marker}">${marker}</body></html>`;
 await fs.writeFile(path.join(source,'web/login.html'),html('baseline'));
 await fs.writeFile(path.join(source,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('mufcDesktop',{onUpdatePrepare:fn=>ipcRenderer.on('hotfix:prepare',(_e,d)=>fn(d)),updatePrepare:d=>ipcRenderer.invoke('hotfix:prepared',d),updateHealthy:d=>ipcRenderer.invoke('hotfix:healthy',d)});`);
 await fs.writeFile(path.join(source,'main.cjs'),String.raw`
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {digest,treeHash}=require('./src/updates/updater.cjs');
app.setPath('userData',path.join(path.dirname(process.resourcesPath),'acceptance-data'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const pair=crypto.generateKeyPairSync('ed25519');let envelope,asset;
 const baseline=await treeHash(path.join(__dirname,'web'));
 const publish=(sequence,id,bad=false)=>{
  asset=Buffer.from('<html><head><script>window.firebase={apps:[1]};'+(bad?'setTimeout(()=>{throw Error("intentional broken hotfix")},500);':'')+'</script><script defer src="/desktop-update.js"></script></head><body data-marker="'+id+'">'+id+'</body></html>');
  const payload=Buffer.from(JSON.stringify({schema:1,channel:'test',coreVersion:'2.1.5',baseline,sequence,issuedAt:Date.now(),expiresAt:Date.now()+3600000,paused:false,disabled:false,revoked:[],hotfix:{id,files:[{path:'login.html',size:asset.length,sha256:digest(asset)}]}}));
  envelope={keyId:'test',payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')};
 };
 publish(1,'good');
 const integration=await require('./src/updates/integration.cjs').create({app,ipcMain,config:{channel:'test',keys:{test:pair.publicKey.export({type:'spki',format:'pem'})},sources:['https://updates.test/']},fetch:async url=>new Response(url.endsWith('manifest.json')?JSON.stringify(envelope):asset)});
 const server=http.createServer(async(req,res)=>{try{const root=integration.webRoot(req.headers['x-mufc-ui-version']||'bundled');const name=req.url==='/login.html'?'login.html':'desktop-update.js';let bytes=await fs.readFile(path.join(root,name));if(name.endsWith('.html'))bytes=bytes.toString().replace('<head>','<head><script>window.mufcUIVersion='+JSON.stringify(req.headers['x-mufc-ui-version']||'bundled')+';</script>');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(bytes);}catch(e){res.writeHead(500);res.end(e.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const ses=session.fromPartition('mufc-hotfix-test');ses.webRequest.onBeforeSendHeaders((details,callback)=>{integration.requestHeaders(details.requestHeaders);callback({requestHeaders:details.requestHeaders});});
 const win=new BrowserWindow({show:false,webPreferences:{session:ses,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 integration.bind(win);win.webContents.on('did-finish-load',()=>void win.webContents.executeJavaScript('(()=>{const real=Date.now;Date.now=()=>real()+31000;})()'));
 await win.loadURL(origin+'/login.html');
 const started=Date.now();let phase=0;
 const timer=setInterval(async()=>{
  try{
   if(Date.now()-started>85000)throw Error('Native hotfix acceptance timed out');
   const state=integration.updater.state;
   if(integration.updater.status.status==='error')throw Error('Updater: '+integration.updater.status.message);
   if(phase===0&&state.active==='good'&&!state.pending){phase=1;publish(2,'broken',true);await integration.updater.check();}
   else if(phase===1&&state.active==='good'&&state.blocked.includes('broken')){
    const marker=await win.webContents.executeJavaScript('document.body.dataset.marker');if(marker!=='good')return;
    clearInterval(timer);await fs.writeFile(path.join(path.dirname(process.resourcesPath),'acceptance.json'),JSON.stringify({nativeSafeActivation:true,healthAcknowledged:true,brokenReleaseRolledBack:true,active:state.active,blocked:state.blocked,elapsedMs:Date.now()-started},null,2));server.close();win.destroy();app.quit();
   }
  }catch(error){clearInterval(timer);await fs.writeFile(path.join(path.dirname(process.resourcesPath),'acceptance-error.txt'),error.stack);app.exit(1);}
 },250);
}).catch(async error=>{await fs.writeFile(path.join(path.dirname(process.resourcesPath),'acceptance-error.txt'),error.stack);app.exit(1);});
`);
 await require(path.resolve(asarPath)).createPackage(source,path.join(runtime,'resources/app.asar'));
 const log=await fs.open(path.join(output,'native.log'),'w');
 const child=spawn(path.join(runtime,'MUFC.exe'),[],{windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});await log.close();assert.equal(code,0,'See native acceptance log');
 console.log(await fs.readFile(path.join(runtime,'acceptance.json'),'utf8'));
})().catch(error=>{console.error(error);process.exitCode=1;});
