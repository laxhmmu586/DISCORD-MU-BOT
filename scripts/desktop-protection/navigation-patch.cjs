const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function applyNavigation(source,root,release){
 const read=n=>fs.readFileSync(path.join(source,n),'utf8'),write=(n,v)=>{fs.mkdirSync(path.dirname(path.join(source,n)),{recursive:true});fs.writeFileSync(path.join(source,n),v);};
 for(const [from,to] of [['navigation.js','web/desktop-navigation.js'],['navigation.css','web/desktop-navigation.css']])write(to,fs.readFileSync(path.join(__dirname,from)));
 write('web/desktop-session.js',fs.readFileSync(path.join(__dirname,'session.js')));
 let server=read('src/server.js');
 if(!server.includes('/desktop-navigation.js'))server=server.replace('<script defer src="/desktop-ui.js"></script>','<script defer src="/desktop-ui.js"></script><script defer src="/desktop-navigation.js"></script><link rel="stylesheet" href="/desktop-navigation.css">');
 if(!server.includes('mufcDesktopInitialHash'))server=server.replace('window.MU_API_BASE=location.origin;','window.MU_API_BASE=location.origin;window.mufcDesktopInitialHash=location.hash;');
 const reportGateStart=server.indexOf("      if (url.pathname.startsWith('/has-report-api/')"),reportGateEnd=server.indexOf('\n',reportGateStart);
 if(reportGateStart>=0)server=server.slice(0,reportGateStart)+"      if (/^\\/(?:has|mufc)-report-api(?:\\/|$)/.test(url.pathname)) {\n        const suffix=url.pathname.replace(/^\\/(?:has|mufc)-report-api/,'');\n        if (!/^\\/(?:context$|(?:da|wwh|rechargeable)\\/)/.test(suffix)) return json(res,{error:'Only LAX/MU DA, WWH and Rechargeable hours are included in MUFC.'},404);\n        url.pathname='/mufc-report-api'+suffix;\n      }"+server.slice(reportGateEnd);
 server=server.replace('index|report|reports|cbs|','index|report|reports|mufc-report|cbs|');
 assert(server.includes('/desktop-navigation.js'));write('src/server.js',server);
 write('src/desktop-policy.js',read('src/desktop-policy.js').replace('|baggage',''));
 let ui=read('web/desktop-ui.js');
 const start=ui.indexOf('  const reportActions ='),end=ui.indexOf('  if (window.mufcFlight',start);
 if(start>=0){assert(end>start);ui=ui.slice(0,start)+ui.slice(end);}
 ui=ui.replace(/const onlineReports = \[[^\]]*\];/,"const onlineReports = ['spml','wch','missConnection'];");
 ui=ui.replace(',#test-page',',body:not(.service-page) #test-page');
 write('web/desktop-ui.js',ui);
 let index=read('web/index.html');
 if(!index.includes('function showReportPage(mode = activeReportMode) { location.assign'))index=index.replace('function showReportPage(mode = activeReportMode) {','function showReportPage(mode = activeReportMode) { location.assign("/report.html"); return;');
 write('web/index.html',index);
 // Copy Baggage and its shared dependencies from current repository sources.
 const copied=new Set();
 function copy(name){
  if(copied.has(name)||name.startsWith('__/'))return;copied.add(name);
  const file=[path.join(root,'public/public',name),path.join(root,'has/public',name.replace(/^has\//,''))].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
  if(!file){assert(fs.existsSync(path.join(source,'web',name)),'Missing '+name);return;}
  let value=fs.readFileSync(file);
  if(/\.(html|js|css)$/.test(name)){
   let text=value.toString();
   if(name.endsWith('.html'))text=text.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-(?:app|auth)-compat\.js)/g,'/assets/firebase/$1');
   for(const match of text.matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css))(?:[^\"]*)?"/g))copy(match[1]);
   value=Buffer.from(text);
  }
  write('web/'+name,value);
 }
 copy('baggage.html');
 // The Report Center has exactly the five retained report tabs, with no local iframe.
 copy('report.html');
 copy('mufc-report.html');
 require('./retire-laketerm-features.cjs').retireLakeTermFeatures(source,release);
 const cbsCopied=require('./cbs-patch.cjs').applyCbs(source,root);
 return [...new Set([...copied,...cbsCopied])];
}
module.exports={applyNavigation};
