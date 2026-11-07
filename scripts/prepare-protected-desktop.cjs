// BASE_APP OUTPUT VERSION ASAR_MODULE
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const [baseArg,outArg,version,asarArg]=process.argv.slice(2),root=path.resolve(__dirname,'..');
 assert(baseArg&&outArg&&version&&asarArg);
 const base=path.resolve(baseArg),out=path.resolve(outArg),asar=require(path.resolve(asarArg));
 assert(!fs.existsSync(out));assert(!out.startsWith(base+path.sep));
 const release=path.join(out,'release-app'),source=path.join(out,'app-source');
 fs.cpSync(base,release,{recursive:true});asar.extractAll(path.join(base,'resources/app.asar'),source);
 const read=n=>fs.readFileSync(path.join(source,n),'utf8'),write=(n,v)=>{fs.mkdirSync(path.dirname(path.join(source,n)),{recursive:true});fs.writeFileSync(path.join(source,n),v);};
 const metadata=JSON.parse(read('package.json'));assert(version.localeCompare(metadata.version,undefined,{numeric:true})>0);metadata.version=version;write('package.json',JSON.stringify(metadata,null,2));
 write('src/device-client.js',fs.readFileSync(path.join(__dirname,'desktop-protection/device-client.cjs')));
 let main=read('src/main.js');
 main=main.replace("const secret = crypto.randomBytes(32).toString('hex');", "global.fetch = await require('./device-client').createDeviceClient(app.getPath('userData'), require('electron').safeStorage);\n    const secret = crypto.randomBytes(32).toString('hex');");
 assert(main.includes('createDeviceClient'));
 // A protected-session smoke run uses the normal userData location but never signs an employee in.
 main=main.replace("if (smokeTest) {\n      const output", "if (process.argv.includes('--protection-smoke')) {\n      const result=await window.webContents.executeJavaScript(`Promise.all(['/index.html','/report.html','/cbs.html','/has-pbb.html'].map(async p=>{const r=await fetch(p,{redirect:'manual'});return {path:p,status:r.status};})).then(pages=>({pages,firebaseReady:Boolean(window.firebase?.apps?.length),desktopReady:Boolean(window.mufcDesktop)}))`);\n      await fs.writeFile(path.join(app.getPath('userData'),'protection-smoke.json'),JSON.stringify(result,null,2));app.quit();return;\n    }\n    if (smokeTest) {\n      const output");
 write('src/main.js',main);
 let server=read('src/server.js');
 server=server.replace('let firebaseConfig;',"let firebaseConfig;\n  let onlineAuthorization='', onlineUntil=0;");
 const anchor="const url = new URL(req.url, origin);";
 assert(server.includes(anchor));
 server=server.replace(anchor,anchor+`
      if(url.pathname==='/desktop-auth') {
        if(req.method==='DELETE'){onlineAuthorization='';onlineUntil=0;return json(res,{signedOut:true});}
        if(req.method!=='POST'||!await authenticated(req))return json(res,{error:'Employee sign-in required.'},401);
        const access=await fetch(CLOUD+'/desktop-access',{headers:{Authorization:req.headers.authorization}});
        if(!access.ok)return json(res,{error:'This computer needs administrator approval.'},403);
        onlineAuthorization=req.headers.authorization;
        onlineUntil=Date.now()+Math.min(55*60000,Math.max(0,JSON.parse(Buffer.from(onlineAuthorization.split('.')[1],'base64url')).exp*1000-Date.now()));
        return json(res,{approved:true});
      }
      const sessionReady=onlineAuthorization&&Date.now()<onlineUntil;
      const protectedPage=/^\\/(?:index|report|reports|cbs|has-pbb|has-pbb-dashboard)(?:\\.html)?$/.test(url.pathname)||url.pathname==='/';
      if(protectedPage&&!sessionReady){res.writeHead(302,{Location:'/login.html','Cache-Control':'no-store'});return res.end();}
      if(sessionReady&&!req.headers.authorization)req.headers.authorization=onlineAuthorization;
      if(['/search','/local-flights','/sy-live-stream'].includes(url.pathname)&&!sessionReady)return json(res,{error:'Employee sign-in required.'},401);
 `);
 // Pages are bundled locally. Never fall back to fetching private page code from a website.
 server=server.replace("if (file.endsWith('.html')) {", "if (file.endsWith('.html')) {");
 write('src/server.js',server);
 write('src/desktop-policy.js',read('src/desktop-policy.js').replace('|has-pbb|','|'));
 let ui=read('web/desktop-ui.js');
 ui=ui.replace(/^  document\.querySelectorAll\('a\[href="\/cbs\.html"\].*\r?\n/m,'');
 ui=ui.replace("const onlineReports = ['salesDetails','vip','spml','psm','inad','wch','missConnection'];","const onlineReports = [];");
 ui=ui.replace(/local\.onclick=\(\)=>\{.*?\};/,"local.hidden=true;");
 write('web/desktop-ui.js',ui);
 let login=read('web/login.html');
 login=login.replace('allowAppEntry();window.location.replace(getRedirectTarget());',"const access=await fetch('/desktop-auth',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken()}});if(!access.ok)throw Error((await access.json()).error||'Computer approval required.');allowAppEntry();window.location.replace(getRedirectTarget());");
 login=login.replace(",['EMPLOYEE ID / EID','eid']",'');
 assert(login.includes("fetch('/desktop-auth'"));write('web/login.html',login);
 let flights=read('web/flights.html');
 flights=flights.replace('href="/reports.html"','href="/report.html"');
 if(!flights.includes('href="/has-pbb.html"'))flights=flights.replace('</nav><div class="flight-actions">','<a href="/has-pbb.html"><span>✈</span><b>JET BRIDGE</b></a></nav><div class="flight-actions">');
 write('web/flights.html',flights);
 // Keep legacy local report tools accessible, while Report opens the full Report Center.
 for(const name of ['web/index.html','web/flights-online.js'])write(name,read(name).replaceAll('/reports.html','/report.html'));
 const copied=new Set();
 function copyDependency(name){
   if(copied.has(name)||name.startsWith('__/'))return;copied.add(name);
   const candidates=[path.join(root,'public/public',name),path.join(root,'has/public',name.replace(/^has\//,''))];
   const file=candidates.find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
   if(!file){assert(fs.existsSync(path.join(source,'web',name)),'Missing '+name);return;}
   let content=fs.readFileSync(file);
   if(/\.(html|js|css)$/.test(name)){
     let value=content.toString();
     if(name.endsWith('.html'))value=value.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-(?:app|auth)-compat\.js)/g,'/assets/firebase/$1');
     content=Buffer.from(value);
     for(const match of value.matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css))(?:[^\"]*)?"/g))copyDependency(match[1]);
   }
   write('web/'+name,content);
 }
 for(const name of ['report.html','has-pbb.html','has-pbb-dashboard.html'])copyDependency(name);
 // Desktop has an authenticated fetch-based live adapter for CBS; retain it.
 let cbs=read('web/cbs.html');
 if(!cbs.includes('/desktop-lbs.js'))cbs=cbs.replace('</head>','<script src="/desktop-lbs.js"></script></head>');
 write('web/cbs.html',cbs);
 for(const target of ['web/assets','web/has/assets'])fs.cpSync(path.join(root,'has/public/assets'),path.join(source,target),{recursive:true});
 write('web/desktop-session.js',fs.readFileSync(path.join(__dirname,'desktop-protection/session.js')));
 server=read('src/server.js').replace('<script src="/flight-session.js"></script>','<script src="/flight-session.js"></script><script defer src="/desktop-session.js"></script>');write('src/server.js',server);
 await asar.createPackage(source,path.join(release,'resources/app.asar'));
 const manifest={version,baseVersion:JSON.parse(asar.extractFile(path.join(base,'resources/app.asar'),'package.json')).version,copied:[...copied],sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(release,'resources/app.asar'))).digest('hex')};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
})().catch(e=>{console.error(e);process.exitCode=1;});
