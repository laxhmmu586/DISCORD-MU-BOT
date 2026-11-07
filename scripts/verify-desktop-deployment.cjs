const assert=require('node:assert/strict');
(async()=>{
 const results=[];
 for(const host of ['https://www.mufcapp.net','https://china-eastern.web.app']){
  for(const p of ['/index.html','/has/index.html','/index','/public/index.html','/public/public/index.html']){
   const r=await fetch(host+p),html=await r.text();assert.equal(r.status,404,p);assert(html.includes('Page Not Found'));assert(!html.includes('MUFC Desktop required'));results.push({host,path:p,status:r.status});
  }
  for(const p of ['/report.html','/cbs.html','/has-pbb.html']){
   const r=await fetch(host+p),html=await r.text();assert(html.includes('MUFC Desktop required'));assert(!html.includes('report-admin-page'));results.push({host,path:p,status:r.status});
  }
  assert((await (await fetch(host+'/info')).text()).includes('This page has been removed'));
  const html=await (await fetch(host+'/flights.html')).text(),js=await (await fetch(host+'/flights.js')).text(),shell=await (await fetch(host+'/has/workspace-shell.js')).text();
  assert(!/href="\/(?:report|cbs|has-pbb)\.html/.test(html));assert(!/Enter Dashboard|location.assign\('\/index.html'\)/.test(js));assert(!shell.includes("['/info'"));
 }
 for(const p of ['/search?q=SY','/dashboard-snapshot','/reports/version','/vip-report','/cbs-cases','/has-pbb-api/context','/desktop-access']){
  const r=await fetch('https://api.mufcapp.net'+p,{headers:{Origin:'https://www.mufcapp.net','User-Agent':'MUFC Desktop'}});assert.equal(r.status,403,p);assert.equal((await r.json()).code,'DESKTOP_REQUIRED');results.push({path:p,status:r.status});
 }
 console.log(JSON.stringify({verified:true,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
