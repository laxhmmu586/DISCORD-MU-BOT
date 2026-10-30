const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express'),sharp=require('sharp');
const {chromium}=require('playwright');
(async()=>{
 const app=express();app.use(require('../has/static').withShared('public/public'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=swiftshader','--enable-webgl']});
  const page=await browser.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  // Simulate browsers whose compositor cannot copy a WebGL canvas into 2D.
  await page.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(source,...args){if(source?.id==='damage-sketch')return;return draw.call(this,source,...args);};});
  await page.goto(`http://127.0.0.1:${server.address().port}/pir-form.html?type=DPR&lang=en`);await page.waitForFunction(()=>window.DamageViewer);
  assert.equal(await page.locator('[name=dprDamageLevel]').count(),0);
  assert.equal(await page.locator('[name=dprInnerDamage]').count(),0);
  await page.evaluate(()=>{document.querySelector('[data-bag-tag]').value='MU000001';showStep(3,'replace');openDamageEntry('1');});
  const canvas=page.locator('#damage-sketch');await canvas.scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-damage-tool=mark]').getAttribute('aria-pressed'),'false');
  await page.locator('[data-damage-tool=mark]').click();
  const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2);await page.mouse.down();
  for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;await page.mouse.move(box.x+box.width/2+Math.cos(a)*20,box.y+box.height/2+Math.sin(a)*20);}await page.mouse.up();
  await page.evaluate(()=>showStep(4,'replace'));await page.waitForTimeout(200);await page.evaluate(()=>document.querySelector('#submitting-dialog').showModal()).catch(()=>{});
  fs.mkdirSync('.verification/damage-export',{recursive:true});
  for(let repeat=0;repeat<2;repeat++){
   const damage=await page.evaluate(()=>collectDamageEntries()[0]);assert(damage.damageAreas.includes('front'));assert(!Object.hasOwn(damage,'damageLevel'));assert(!Object.hasOwn(damage,'innerDamage'));
   const bytes=Buffer.from(damage.damageSketch.split(',')[1],'base64');fs.writeFileSync(`.verification/damage-export/hidden-${repeat}.jpg`,bytes);
   if(repeat===0){
    const vm=require('node:vm'),Report=require('../cbsReport'),source=fs.readFileSync('index.js','utf8'),helpers=vm.createContext({Buffer});vm.runInContext(source.slice(source.indexOf('function pdfSafeText('),source.indexOf('function createPirPdf(')),helpers);
    const jpeg=fs.readFileSync('public/public/assets/baggage-guide-3d/type-22R.jpg').toString('base64');
    const record={formVersion:3,evidenceVersion:1,caseType:'DPR',language:'zh',issueDate:'2026-10-16',passengerName:'TEST/TRAVELER',email:'fixture@example.com',phone:'5550100000',dprAddress:'123 Test Street, Los Angeles',bagIdentifications:[{tag:'MU000001',color:'BK',type:'22',descriptors:'D',contentsRows:[]}],damagedBags:[damage],reportAttachments:['boardingPass','bagTag','damagePhoto','tagOnBag'].map(attachmentType=>({attachmentType,bagNumber:1,mimeType:'image/jpeg',contentBase64:jpeg,filename:attachmentType+'.jpg'})),passengerSignatureDataUrl:'data:image/jpeg;base64,'+jpeg};
    const pdf=Report.createPdf(record,helpers);fs.writeFileSync('.verification/damage-export/single-bag.pdf',pdf);assert.equal(/\/Count (\d+)\b/.exec(pdf.toString('binary'))?.[1],'1','a short one-bag report should fit one page');
   }
   const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
   for(let face=0;face<6;face++){
    let shell=0,red=0;const x0=face%3*300,y0=Math.floor(face/3)*330;
    for(let y=y0;y<y0+300;y++)for(let x=x0;x<x0+300;x++){const i=(y*info.width+x)*info.channels,r=data[i],g=data[i+1],b=data[i+2];if(Math.max(r,g,b)<230)shell++;if(r>140&&r>g*1.4&&r>b*1.4)red++;}
    console.log({repeat,face,shell,red});assert(shell>3000,`Face ${face} has no visible suitcase`);if(face===0)assert(red>10,'Front lost its red damage mark');
   }
  }
  console.log('PASS: hidden submission exports visible suitcases and saved red marks on repeated exports.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
