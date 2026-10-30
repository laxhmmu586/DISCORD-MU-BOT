const assert=require('node:assert/strict');
const fs=require('node:fs');
const express=require('express');
const sharp=require('sharp');
const {chromium}=require('playwright');

(async()=>{
 const app=express();app.use(require('../has/static').withShared('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=swiftshader','--enable-webgl']});
  const page=await browser.newPage({viewport:{width:390,height:900},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/pir-form.html?type=DPR&lang=en`);
  await page.waitForFunction(()=>window.DamageViewer);
  await page.evaluate(()=>{document.querySelector('[data-bag-tag]').value='MU123456';showStep(3,'replace');openDamageEntry('1');});
  const canvas=page.locator('#damage-sketch');await canvas.scrollIntoViewIfNeeded();
  await canvas.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));
  const box=await canvas.boundingBox();assert(box.height>=390&&box.height<=440);
  console.log('Loaded the actual DPR viewer; checking pointer-driven full rotations.');
  const mark=page.locator('[data-damage-tool=mark]');
  const snapshot=()=>page.evaluate(()=>[...DamageViewer.snapshot()].map(([key,image])=>[key,JSON.stringify(image)]));
  const image=()=>canvas.evaluate(el=>el.toDataURL());
  async function difference(a,b){
   const decode=async url=>sharp(Buffer.from(url.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
   const [left,right]=await Promise.all([decode(a),decode(b)]);assert.equal(left.length,right.length);
   return left.reduce((sum,value,i)=>sum+Math.abs(value-right[i]),0)/left.length;
  }
  async function drag(dx,dy){
   const x=box.x+box.width/2-dx/2,y=box.y+box.height/2-dy/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();
  }
  // Test actual captured pointer drags, rather than assigning camera angles.
  assert.equal(await mark.getAttribute('aria-pressed'),'false','marking starts off so the first drag rotates');
  const quarterTurn=Math.PI/2/.012;
  for(const axis of ['horizontal','vertical']){
   const initial=await image();let quarter;
   for(let i=0;i<4;i++){await drag(axis==='horizontal'?quarterTurn:0,axis==='vertical'?quarterTurn:0);if(!i)quarter=await image();}
   assert(await difference(initial,quarter)>2,`${axis}: dragging must change the view`);
   assert(await difference(initial,await image())<1.5,`${axis}: a full 360 turn must return to the starting view`);
   assert.equal((await snapshot()).length,0,'rotation must not paint');
   console.log(`Verified ${axis} 360-degree rotation.`);
  }
  await mark.click();
  const cdp=await page.context().newCDPSession(page);
  const point=(id,x,y)=>({id,x,y,radiusX:4,radiusY:4});
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  // Both initial contact and a remaining finger after partial release must stay ink-free.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,cx-20,cy),point(2,cx+20,cy)]});
  assert.equal((await snapshot()).length,0,'a two-finger touchdown must not paint a dot');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,cx,cy),point(2,cx+40,cy)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point(1,cx,cy)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,cx+15,cy+10)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal((await snapshot()).length,0,'partial finger release must not switch rotation into painting');
  console.log('Verified two-finger rotation and partial release without stray ink.');

  await page.locator('[data-view-action=front]').click();
  async function circle(){
   const radius=7;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,cx+radius,cy)]});
   for(let i=1;i<=24;i++){const a=i/24*Math.PI*2;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,cx+Math.cos(a)*radius,cy+Math.sin(a)*10)]});}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await circle();assert.deepEqual((await snapshot()).map(([key])=>key),['front']);
  const firstInk=await snapshot();
  // Rotate to each surface with real drags, mark it with a touch gesture, and retain all earlier ink.
  for(const face of ['left','back','right']){
   await mark.click();await drag(quarterTurn,0);await mark.click();await circle();
   assert((await snapshot()).some(([key])=>key===face),`${face} must accept its own surface mark`);
   console.log(`Verified touch marking on ${face}.`);
  }
  await mark.click();await drag(quarterTurn,0);await drag(0,quarterTurn);await mark.click();await circle();
  assert((await snapshot()).some(([key])=>key==='top'));
  await mark.click();await drag(0,quarterTurn);await drag(0,quarterTurn);await mark.click();await circle();
  const allInk=await snapshot();assert.equal(allInk.length,6,'all six surfaces must retain their own ink');
  assert.equal(allInk.find(([key])=>key==='front')[1],firstInk[0][1],'turning and marking other surfaces must preserve the original circle');
  await page.locator('[data-view-action=front]').click();
  assert.equal(await page.locator('[data-view-action]').count(),1,'only the front reset control remains');
  await page.locator('[data-view-action=front]').click();assert.deepEqual(await snapshot(),allInk);
  const exported=await page.evaluate(()=>DamageViewer.export(DamageViewer.snapshot()));assert(exported.startsWith('data:image/jpeg;base64,'));assert.deepEqual(await snapshot(),allInk);
  fs.mkdirSync('.verification/damage-360',{recursive:true});
  fs.writeFileSync('.verification/damage-360/all-surfaces.jpg',Buffer.from(exported.split(',')[1],'base64'));
  // Leave the visible damage step, then mimic a mobile viewer losing its live state.
  await page.evaluate(()=>showStep(4,'replace'));
  await page.evaluate(()=>DamageViewer.load());
  const damage=await page.evaluate(()=>collectDamageEntries()[0]);
  assert.equal(damage.sketchLayout,'six-face-3d');assert.equal(damage.damageAreas.length,6);
  assert.equal(damage.damageSketch,exported,'hidden submission must use the saved six-face marks');
  const Report=require('../cbsReport'),vm=require('vm'),source=fs.readFileSync('index.js','utf8'),helpers=vm.createContext({Buffer});
  vm.runInContext(source.slice(source.indexOf('function pdfSafeText('),source.indexOf('function createPirPdf(')),helpers);
  const bags=[{tag:'MU123456',color:'GY',type:'22R',descriptors:'R,W',contentsRows:[]}];
  const normalized=Report.normalizeDamagedBags([damage],bags);
  const pdf=Report.createPdf({formVersion:3,caseType:'DPR',language:'en',passengerName:'TEST/TRAVELER',email:'fixture@example.com',phone:'5550100000',issueDate:'2026-10-15',bagIdentifications:bags,damagedBags:normalized},helpers);
  assert(pdf.includes(Buffer.from(damage.damageSketch.split(',')[1],'base64')),'report must embed the actual six-face JPEG');
  assert(!pdf.includes(Buffer.from('No marked image provided')));
  fs.writeFileSync('.verification/damage-360/report.pdf',pdf);
  await page.evaluate(()=>{showStep(3,'replace');openDamageEntry('1');});
  await canvas.scrollIntoViewIfNeeded();
  await canvas.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));
  console.log('Verified saved marks survive hidden submission and the actual PDF embeds all six views.');
  await page.locator('.damage-viewer').screenshot({path:'.verification/damage-360/viewer.png'});
  assert.equal(await page.locator('.damage-tools button').count(),2,'only Mark and Clear remain');
  await page.locator('#clear-sketch').click();assert.equal((await snapshot()).length,0);
  // Start on the background and circle the upper corner/handle across the silhouette.
  const outside=[];
  for(let i=0;i<=32;i++){const angle=i/32*Math.PI*2;outside.push({x:cx+box.width*.25+Math.cos(angle)*40,y:cy-50+Math.sin(angle)*35});}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,outside[0].x,outside[0].y)]});
  for(const position of outside.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,position.x,position.y)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const outer=await page.evaluate(()=>DamageViewer.snapshot().get('front'));
  assert(outer?.length,'the background portion of a circle must be retained');
  const stroke=outer[0],first=stroke.points[0],last=stroke.points.at(-1);
  assert(Math.hypot(...first.map((value,i)=>value-last[i]))<.05,'the outer loop must close');
  assert(stroke.points.some(position=>position[0]>1),'the loop must extend past the shell edge');
  await page.locator('.damage-viewer').screenshot({path:'.verification/damage-360/outer-circle.png'});
  const outerExport=await page.evaluate(()=>DamageViewer.export(DamageViewer.snapshot()));
  fs.writeFileSync('.verification/damage-360/outer-circle-report.jpg',Buffer.from(outerExport.split(',')[1],'base64'));
  await page.locator('#clear-sketch').click();assert.equal((await snapshot()).length,0);
  assert.deepEqual(errors,[]);
  console.log('PASS: actual horizontal/vertical 360° drags, multi-touch rotation without stray ink, six marked surfaces, closed circles across the silhouette, retained 3D marks, front reset, six-face PDF export and clear.');
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
