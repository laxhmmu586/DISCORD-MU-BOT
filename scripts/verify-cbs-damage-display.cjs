const fs=require('node:fs'),assert=require('node:assert/strict'),express=require('express');
const {chromium}=require('playwright');
(async()=>{
 const source=fs.readFileSync('public/public/cbs.html','utf8'),style=source.match(/<style>([\s\S]*?)<\/style>/)[1];
 const names=['label','escapeHtml','inferCaseType','hasValue','normalizeShippingMethodLabel','renderValue','fullPassengerFileHtml'];
 const functions=names.map(name=>{const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\n    function ',start+1));}).join('\n');
 const montage=fs.readFileSync(fs.existsSync('.verification/damage-export/hidden-0.jpg')?'.verification/damage-export/hidden-0.jpg':'public/public/assets/baggage-guide-3d/type-22R.jpg');
 const app=express();app.get('/fixture',(req,res)=>res.send(`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style><link rel="stylesheet" href="/assets/cbs-report.css"></head><body style="margin:12px"><main id="fixture"></main></body></html>`));app.use(require('../has/static').withShared('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/cbs-damage-images/*',route=>route.fulfill({contentType:'image/jpeg',body:montage}));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);await page.addScriptTag({path:'public/public/baggage-guide.js'});await page.addScriptTag({path:'public/public/pir-delivery.js'});await page.addScriptTag({content:`const apiBase=location.origin;${functions}`});
  const record={formVersion:3,caseType:'DPR',passengerName:'TEST/TRAVELER',bagTag:'MU000001 / DL000002',dprDamageLevel:'Minor',dprInnerDamage:'REMOVED_INNER',bagIdentifications:[{tag:'MU000001',color:'WT',type:'01',descriptors:''},{tag:'DL000002',color:'BU',type:'25',descriptors:''}],damagedBags:[{tag:'MU000001',damageLevel:'Minor',innerDamage:'REMOVED_INNER',damageAreas:['back'],damageSketchRef:'1-1-'+'a'.repeat(64)},{tag:'DL000002',damageSketchRef:'2-1-'+'b'.repeat(64)}]};
  fs.mkdirSync('.verification/cbs-damage-display',{recursive:true});
  for(const lang of ['en','zh'])for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(({record,lang})=>{document.documentElement.lang=lang;document.querySelector('#fixture').innerHTML=fullPassengerFileHtml(record);},{record,lang});
   await page.locator('.dpr-marked-image').last().scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.dpr-marked-image img')].every(im=>im.complete&&im.naturalWidth>0));
   assert.equal(await page.locator('.dpr-marked-image img').count(),2);assert(!await page.locator('#fixture').innerText().then(text=>/Minor|REMOVED_INNER|破损程度|内物破损/.test(text)));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`.verification/cbs-damage-display/${lang}-${width}.png`,fullPage:true});
  }
  await page.evaluate(()=>document.querySelector('#fixture').innerHTML=fullPassengerFileHtml({caseType:'DPR',damagedBags:[{tag:'MU000003'}]}));assert.equal(await page.locator('.dpr-marked-image img').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: two DPR images linked to their tags, removed answers hidden, missing-image state, English/Chinese layouts at 390 and 1440px.');
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
