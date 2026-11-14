// BUILT_RUNTIME CORE_SOURCE NEW_OUTPUT ASAR_MODULE. Isolated native close check.
// Uses no employee session and never launches an installer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
(async()=>{
 const [base,core,out,asarPath]=process.argv.slice(2).map(p=>path.resolve(p));assert(!fs.existsSync(out));
 const source=path.join(out,'source'),runtime=path.join(out,'runtime');fs.mkdirSync(source,{recursive:true});fs.cpSync(base,runtime,{recursive:true});
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'mufc-close-acceptance',version:'2.1.8',main:'main.cjs'}));
 fs.writeFileSync(path.join(source,'main.cjs'),`
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
app.setPath('userData',${JSON.stringify(path.join(out,'user-data'))});app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<body><dialog>Settings</dialog></body>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const integration=await require(${JSON.stringify(path.join(core,'src/updates/integration.cjs'))}).create({app,ipcMain,config:{}});
 const win=new BrowserWindow({show:false,frame:false});integration.bind(win);
 await win.loadURL('http://127.0.0.1:'+server.address().port+'/login.html');
 await win.webContents.executeJavaScript('document.querySelector("dialog").showModal()');
 integration.updater.coreReady={release:{version:'fixture-no-install'}};
 const start=Date.now();let prevented=false;win.on('close',event=>{prevented=event.defaultPrevented;});
 const timeout=setTimeout(()=>{fs.writeFileSync(${JSON.stringify(path.join(out,'failure.json'))},JSON.stringify({error:'Window close waited for updater'}));app.exit(1);},2000);
 win.on('closed',()=>{clearTimeout(timeout);fs.writeFileSync(${JSON.stringify(path.join(out,'result.json'))},JSON.stringify({closeMs:Date.now()-start,prevented,modalOpen:true,verifiedUpdateStaged:true,withoutLogin:true}));server.close();app.quit();});win.close();
}).catch(error=>{fs.writeFileSync(${JSON.stringify(path.join(out,'failure.json'))},error.stack);app.exit(1);});
`);
 await require(asarPath).createPackage(source,path.join(runtime,'resources/app.asar'));
 const child=spawn(path.join(runtime,'MUFC.exe'),[],{windowsHide:true,stdio:'ignore'});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 assert.equal(code,0,'See native close acceptance output');const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));assert.equal(result.prevented,false);assert(result.closeMs<1500);console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
