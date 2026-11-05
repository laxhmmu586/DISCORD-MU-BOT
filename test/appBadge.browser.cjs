const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0];
  if(name==='/firebase-messaging-sw.js'||name==='/has/app-badge.js'){
   res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');
   res.end(fs.readFileSync(name.includes('/has/')?'has/public/app-badge.js':'public/public/firebase-messaging-sw.js'));return;
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Badge verification</title>');
 }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/firebase-messaging-sw.js');await navigator.serviceWorker.ready;});
  const worker=context.serviceWorkers()[0];
  await worker.evaluate(()=>{
   self.badges=[];
   Object.defineProperty(self.navigator,'setAppBadge',{value:async n=>self.badges.push(n)});
   Object.defineProperty(self.navigator,'clearAppBadge',{value:async()=>self.badges.push(0)});
  });
  await page.evaluate(()=>{
   window.badges=[];window.authCallback=null;
   Object.defineProperty(navigator,'setAppBadge',{value:async n=>window.badges.push(n)});
   Object.defineProperty(navigator,'clearAppBadge',{value:async()=>window.badges.push(0)});
   window.firebase={auth:()=>({onAuthStateChanged:fn=>{window.authCallback=fn;fn({uid:'fixture'});}})};
   window.RequestInbox={data:null,load:()=>{}};
  });
  await page.addScriptTag({url:'/has/app-badge.js'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('request-inbox-updated',{detail:{uid:'fixture',groups:Array.from({length:5},()=>({})),rows:[{kind:'uniform',r:{id:'pending',canReview:true}}],reminderMessages:[],signCount:1,readSignMemos:[{id:'memo',myStatus:'pending'}],scheduleItems:[]}})));
  await page.waitForFunction(()=>window.badges.at(-1)===2);
  for(let i=0;i<30;i++){if(await worker.evaluate(()=>self.badges.at(-1)===2))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await worker.evaluate(()=>self.badges.at(-1)),2);
  await worker.evaluate(async()=>{await Promise.all([
   pushBadge({badgeUid:'fixture',badgeKey:'incident:new',badgeEventId:'new'}),
   pushBadge({badgeUid:'fixture',badgeKey:'incident:new',badgeEventId:'new'}),
   pushBadge({badgeUid:'fixture',badgeKey:'uniform:pending',badgeEventId:'pending'})]);});
  assert.equal(await worker.evaluate(()=>self.badges.at(-1)),3);
  await page.evaluate(()=>window.mufcClearAppBadge());
  for(let i=0;i<30;i++){if(await worker.evaluate(()=>self.badges.at(-1)===0))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await worker.evaluate(()=>self.badges.at(-1)),0);
  const persisted=await worker.evaluate(async()=>{const c=await caches.open('mufc-app-badge-v1');return (await c.match(new URL('/__mufc_app_badge__',self.location.origin).href)).json();});
  assert.equal(persisted.signedOut,true);assert.equal(persisted.count,0);
  assert.deepEqual(errors,[]);
  console.log('PASS browser foreground badge, actual service worker messages, native CacheStorage, concurrent push deduplication and awaited logout clear');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
