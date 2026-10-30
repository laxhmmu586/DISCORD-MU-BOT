const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const app=express();app.use(require('../has/static').withShared('public/public'));app.get('/photo-test',(_req,res)=>res.send('<script src="/save-briefing-photo.js"></script><button id="save">Save</button><script>document.querySelector("button").onclick=async()=>{window.result=await saveBriefingPhoto(new Blob(["fixture"],{type:"image/png"}),"Arrival.png");};</script>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const desktop=await browser.newPage();await desktop.addInitScript(()=>Object.defineProperty(navigator,'canShare',{value:undefined}));await desktop.goto(origin+'/photo-test');const downloaded=desktop.waitForEvent('download');await desktop.click('#save');assert.equal((await downloaded).suggestedFilename(),'Arrival.png');await desktop.waitForFunction(()=>window.result==='downloaded');await desktop.close();
  for(const behavior of ['success','cancel','denied','unsupported']){
   const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});await context.addInitScript(behavior=>{window.shares=[];Object.defineProperty(navigator,'canShare',{value:behavior==='unsupported'?undefined:()=>true});Object.defineProperty(navigator,'share',{value:async data=>{window.shares.push({name:data.files[0].name,type:data.files[0].type});if(behavior==='cancel')throw new DOMException('Cancelled','AbortError');if(behavior==='denied')throw new DOMException('Expired activation','NotAllowedError');}});},behavior);
   const page=await context.newPage();await page.goto(origin+'/photo-test');await page.click('#save');await page.waitForFunction(()=>Boolean(window.result));const expected={success:'shared',cancel:'cancelled',denied:'preview',unsupported:'preview'}[behavior];assert.equal(await page.evaluate(()=>window.result),expected);
   assert.deepEqual(await page.evaluate(()=>window.shares),behavior==='unsupported'?[]:[{name:'Arrival.png',type:'image/png'}]);
   if(expected==='preview'){assert(await page.locator('.briefing-photo-save').isVisible());assert.equal(await page.locator('[data-share]').isVisible(),behavior!=='unsupported');await page.locator('[data-close]').click();await page.locator('.briefing-photo-save').waitFor({state:'detached'});assert.equal(await page.locator('.briefing-photo-save').count(),0);}
   else assert.equal(await page.locator('.briefing-photo-save').count(),0);await context.close();
  }
  console.log('PASS: desktop download; native PNG share; cancellation without download; expired-activation and unsupported-mobile save previews.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
