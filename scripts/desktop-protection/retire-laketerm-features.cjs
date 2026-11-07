const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function retireLakeTermFeatures(source,release){
 const read=n=>fs.readFileSync(path.join(source,n),'utf8'),write=(n,v)=>fs.writeFileSync(path.join(source,n),v);
 let main=read('src/main.js');
 main=main.replace(/^const \{ BoardingService \} = require\('\.\/boarding-service'\);\r?\n/m,'').replace(', boardingService;',';').replace(/^    boardingService = new BoardingService.*\r?\n/m,'');
 const ipc=main.indexOf("    ipcMain.handle('boarding:request'"),next=main.indexOf("    ipcMain.handle('updates:check'",ipc);
 if(ipc>=0){assert(next>ipc);main=main.slice(0,ipc)+main.slice(next);}
 const fixture=main.indexOf("      const fixture = process.argv.find(value=>value.startsWith('--boarding-fixture='))"),quit=main.indexOf('      app.quit();',fixture);
 if(fixture>=0){assert(quit>fixture);main=main.slice(0,fixture)+main.slice(quit);}
 main=main.replace("process.argv.includes('--reissue') ? '/reissue.html' : '/login.html'","'/login.html'").replace('boardingService?.close(); ','');
 main=main.replace('show: !smokeTest,',"show: !smokeTest && !process.argv.includes('--protection-smoke'),");
 for(const [start,end] of [["      if (securitySmoke) {","      if (offlineSmoke) {"],["      if (offlineSmoke) {","      const state ="]]){
  const a=main.indexOf(start),b=main.indexOf(end,a);if(a>=0){assert(b>a);main=main.slice(0,a)+main.slice(b);}
 }
 write('src/main.js',main);
 write('src/preload.js',read('src/preload.js').replace(/^  boarding:.*\r?\n/m,''));
 let server=read('src/server.js');
 server=server.replace(/^  const drafts=require\('\.\/reissue-drafts'\).*\r?\n/m,'').replace(/^  const readReissue=require\('\.\/reissue-reader'\).*\r?\n/m,'');
 const a=server.indexOf("      if(url.pathname==='/reissue-draft')"),b=server.indexOf("      if (url.pathname === '/__/firebase/init.js')",a);
 if(a>=0){assert(b>a);server=server.slice(0,a)+server.slice(b);}
 if(!server.includes('This feature has moved to LakeTerm.'))server=server.replace('      const protectedPage=',"      if(/^\\/(?:boarding-pass(?:[./-]|$)|reissue(?:[./-]|$))/.test(canonical))return json(res,{error:'This feature has moved to LakeTerm.'},410);\n      if(canonical==='/reports.html'){res.writeHead(302,{Location:'/report.html'});return res.end();}\n      const protectedPage=");
 write('src/server.js',server);
 let ui=read('web/desktop-ui.js');
 const nav=ui.indexOf("  const nav = document.querySelector('.nav-links');"),end=ui.indexOf('  if (window.mufcFlight',nav);
 if(nav>=0){assert(end>nav);ui=ui.slice(0,nav)+ui.slice(end);}write('web/desktop-ui.js',ui);
 for(const name of fs.readdirSync(path.join(source,'web')).filter(n=>n.endsWith('.html'))){
  write('web/'+name,read('web/'+name).replace(/<a\b[^>]*href="\/?(?:boarding-pass|reissue)(?:\.html)?(?:[?#][^"]*)?"[^>]*>[\s\S]*?<\/a>/g,''));
 }
 // Only remove generated copies inside the new release; never modify the installed app or user files.
 const remove=(base,name)=>{const target=path.resolve(base,name),boundary=path.resolve(base)+path.sep;assert(target.startsWith(boundary));if(fs.existsSync(target))fs.rmSync(target,{recursive:true,force:true});};
 for(const name of ['web/boarding-pass.html','web/boarding-pass.js','web/boarding-pass.css','web/reissue.html','web/reissue.js','web/reissue.css','web/reissue-model.js','src/boarding-service.js','src/boarding-parser-worker.js','src/reissue-reader.js','src/reissue-worker.js','src/reissue-drafts.js','src/offline-verification.js','src/security-verification.js','boarding'])remove(source,name);
 write('web/reports.html','<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/report.html"><title>Report Center</title><a href="/report.html">Open Report Center</a>');
 if(release)remove(release,'resources/boarding-engine');
 assert(!read('src/main.js').includes('boardingService'));assert(!read('src/preload.js').includes('boarding:request'));
}
module.exports={retireLakeTermFeatures};
