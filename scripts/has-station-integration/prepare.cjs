'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function prepareStation(root){
 const file=path.join(root,'server/station.js');let code=fs.readFileSync(file,'utf8');
 assert(!code.includes('createMufcSso'),'Integration already installed');
 code=code.replace("import express from 'express';","import express from 'express';\nimport mufcSsoModule from './mufc-sso.cjs';");
 const original='const authenticate = createPasskeyAuthenticator(primaryAuthenticate, passkeys, passkeyToken);';assert(code.includes(original));
 code=code.replace("import { initializeApp, applicationDefault }","import { initializeApp, applicationDefault, cert }");
 code=code.replace(original,"const passwordAuthenticate = createPasskeyAuthenticator(primaryAuthenticate, passkeys, passkeyToken);\nconst mufcFirebase=getAuth(initializeApp({projectId:publicConfig.projectId,credential:cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8')))},'mufc-sso'));\nconst mufcSso = mufcSsoModule.createMufcSso({firebase:mufcFirebase,employees,blocked:accountStatus.blocked,groups:require('./has/public/employee-account-groups')});\nconst authenticate = async req => await mufcSso.authenticate(req) || passwordAuthenticate(req);");
 const marker="app.use('/auth-api', passkeyRoutes";assert(code.includes(marker));
 code=code.replace(marker,"mufcSso.mount(app);\napp.get('/mufc-sso',(req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(publicRoot,'mufc-sso.html')));\napp.get('/mufc-da',(req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(publicRoot,'mufc-da.html')));\n"+marker);
 code=code.replace('for (const service of closers)', 'mufcSso.close();\n  for (const service of closers)');
 fs.copyFileSync(file,file+'.before-mufc-sso');fs.writeFileSync(file,code);
 fs.copyFileSync(path.join(__dirname,'mufc-sso.cjs'),path.join(root,'server/mufc-sso.cjs'));
 const publicRoot=path.join(root,'migration-runtime/has/public');fs.copyFileSync(path.join(__dirname,'mufc-sso.html'),path.join(publicRoot,'mufc-sso.html'));
 let html=fs.readFileSync(path.join(publicRoot,'has-report.html'),'utf8');
 html=html.replace(/has-report-access\.js\?v=[^" ]+/g,'mufc-da-access.js?v=2114').replace('<title>HAS Report</title>','<title>MUFC · LAX/MU DA</title>');
 html=html.replace(/<body\b/,'<body data-mufc-da');
 html=html.replace('</head>','<style>body[data-mufc-da] .profile-topbar .top-nav,body[data-mufc-da] .profile-sidebar nav>a:not([data-report-access]),body[data-mufc-da] .profile-sidebar nav>button,body[data-mufc-da] .workspace-features,body[data-mufc-da] #flight-account,body[data-mufc-da] .topbar-date,body[data-mufc-da] .workspace-account,body[data-mufc-da] .workspace-bell,body[data-mufc-da] .login-button{display:none!important}#report-kind{pointer-events:none}body{min-width:0}</style><script defer src="/mufc-da-ui.js"></script></head>');
 fs.writeFileSync(path.join(publicRoot,'mufc-da.html'),html);
 fs.copyFileSync(path.join(__dirname,'mufc-da-ui.js'),path.join(publicRoot,'mufc-da-ui.js'));
 let access=fs.readFileSync(path.join(publicRoot,'has-report-access.js'),'utf8');
 const publish='const publish=detail=>{';assert(access.includes(publish));
 access=access.replace(publish,publish+"detail={...detail,permissions:{da:Boolean(detail.permissions?.da)},canDashboard:false,canChecklist:false,canAdmin:false};document.querySelectorAll('.profile-sidebar [data-report-access]').forEach(link=>{link.href='/mufc-da';link.classList.add('is-active');link.setAttribute('aria-current','page');});");
 fs.writeFileSync(path.join(publicRoot,'mufc-da-access.js'),access);
}
function prepareDesktop(source){
 const mainFile=path.join(source,'src/main.js'),preloadFile=path.join(source,'src/preload.js');let main=fs.readFileSync(mainFile,'utf8'),preload=fs.readFileSync(preloadFile,'utf8');
 assert(!main.includes("require('./desktop-has.cjs')"),'Integration already installed');
 const marker='    let pendingGoogleSignIn=false;';assert(main.includes(marker));
 main=main.replace(marker,"    const hasWorkspace=require('./desktop-has.cjs').install({ipcMain,BrowserWindow,session,trusted,onReturnToFlights:async()=>{await window.loadURL(origin+'/flights.html?choose=1');window.show();window.focus();}});\n    windowHasCleanup=()=>hasWorkspace.close();\n"+marker).replace('let window, origin, server, secureUpdates;','let window, origin, server, secureUpdates, windowHasCleanup=()=>{};');
 main=main.replace("    await window.loadURL(origin", "    window.on('closed',()=>windowHasCleanup());\n    await window.loadURL(origin");
 preload=preload.replace('  googleSignIn:',"  openHasWorkspace: request => ipcRenderer.invoke('has:open',request),\n  closeHasWorkspaces: () => ipcRenderer.invoke('has:close'),\n  googleSignIn:");
 fs.writeFileSync(mainFile,main);fs.writeFileSync(preloadFile,preload);
 for(const name of ['desktop-has.cjs','desktop-has.js'])fs.copyFileSync(path.join(__dirname,name),path.join(source,name.endsWith('.cjs')?'src':'web',name));
 const htmlFile=path.join(source,'src/desktop-html.js');let adapter=fs.readFileSync(htmlFile,'utf8');adapter=adapter.replace("['desktop-session'","['desktop-has','desktop-session'");fs.writeFileSync(htmlFile,adapter);
 let report=fs.readFileSync(path.join(__dirname,'../desktop-protection/da-report.html'),'utf8');
 report=report.replace('Opens in your browser. Sign in to HAS Station and select your account and month. Changes saved there are available from either entry point. Other open DA editors update automatically after saving.','Open the full LAX/MU DA editor using your MUFC sign-in. Saved changes are shared with HAS Station.').replace('Open your shared DA report in HAS Station.','LAX/MU · Shared Daily Flight Activity').replace('Open and edit DA in HAS Station','Open shared DA');
 fs.writeFileSync(path.join(source,'web/report.html'),report);
}
module.exports={prepareStation,prepareDesktop};
