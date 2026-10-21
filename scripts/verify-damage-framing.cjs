const assert=require('node:assert/strict');
const fs=require('node:fs');
const express=require('express');
const {chromium}=require('playwright');

(async()=>{
 const app=express();app.use(express.static('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=swiftshader','--enable-webgl']});
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},hasTouch:true,isMobile:width===390});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/pir-form.html?type=DPR&lang=en`);
   await page.waitForFunction(()=>window.DamageViewer);
   await page.evaluate(async()=>{
    // Observe the real camera without adding a production debugging API.
    const T=await import('/vendor/three.module.js'),update=T.PerspectiveCamera.prototype.updateProjectionMatrix;
    T.PerspectiveCamera.prototype.updateProjectionMatrix=function(){update.call(this);window.damageTestZoom=this.zoom;};
    document.querySelector('[data-bag-tag]').value='MU000001';showStep(3,'replace');openDamageEntry('1');
   });
   const canvas=page.locator('#damage-sketch');await canvas.scrollIntoViewIfNeeded();
   await canvas.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));
   const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
   const front=async()=>{await page.locator('[data-view-action=front]').click();return page.evaluate(()=>window.damageTestZoom);};
   const original=await front();
   await page.locator('[data-damage-tool=mark]').click();
   await page.mouse.move(cx+box.width*.43,cy-30);await page.mouse.down();
   for(let i=0;i<=40;i++){
    const angle=i/40*Math.PI*2;
    await page.mouse.move(cx+box.width*.30+Math.cos(angle)*box.width*.13,cy-30+Math.sin(angle)*55);
    const zoom=await page.evaluate(()=>window.damageTestZoom);
    assert(Math.abs(zoom-original)<1e-8,`${width}px: drawing point ${i} changed suitcase scale (${original} -> ${zoom})`);
   }
   await page.mouse.up();
   const saved=await page.evaluate(()=>[...DamageViewer.snapshot()]);assert(saved.length,'edge circle must be retained');
   // Every face must frame exactly as it did without ink, including invisible back-side ink.
   for(const face of ['front','back','left','right','top','bottom']){
    const [clean,marked]=await page.evaluate(([face,saved])=>{
     DamageViewer.load();DamageViewer.view(face);const clean=window.damageTestZoom;
     DamageViewer.load(new Map(saved));return [clean,window.damageTestZoom];
    },[face,saved]);
    assert(Math.abs(clean-marked)<1e-8,`${width}px: ${face} rotation shrank the suitcase (${clean} -> ${marked})`);
   }
   await front();
   // Real pointer rotation after marking must match the same pose with no marks.
   await page.locator('[data-damage-tool=mark]').click();
   await page.mouse.move(cx-50,cy);await page.mouse.down();await page.mouse.move(cx+65,cy+45,{steps:15});await page.mouse.up();
   const rotated=await page.evaluate(()=>{const marked=window.damageTestZoom;DamageViewer.load();return [marked,window.damageTestZoom];});
   assert(Math.abs(rotated[0]-rotated[1])<1e-8,`${width}px: pointer rotation with ink changed framing`);
   await page.evaluate(saved=>DamageViewer.load(new Map(saved)),saved);await front();
   const beforeExport=await page.evaluate(()=>window.damageTestZoom);
   const exported=await page.evaluate(()=>DamageViewer.export(DamageViewer.snapshot()));
   assert(exported.startsWith('data:image/jpeg;base64,'));
   assert(Math.abs(await page.evaluate(()=>window.damageTestZoom)-beforeExport)<1e-8,'export must restore live framing');
   assert.deepEqual(await page.evaluate(()=>[...DamageViewer.snapshot()]),saved);
   fs.mkdirSync('.verification/damage-framing',{recursive:true});
   await page.locator('.damage-viewer').screenshot({path:`.verification/damage-framing/${width}.png`});
   await page.locator('#clear-sketch').click();assert.equal(await page.evaluate(()=>DamageViewer.snapshot().size),0);
   assert(Math.abs(await front()-original)<1e-8);assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: edge drawing, all six faces, pointer rotation, reload, export and clear retain suitcase framing.`);
   await page.close();
  }
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
