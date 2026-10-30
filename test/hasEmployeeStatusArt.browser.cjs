const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.join(__dirname,'../public/public'),output=path.join(__dirname,'../output/has-employee-status');fs.mkdirSync(output,{recursive:true});
 const app=express();app.get('/art-check',(_req,res)=>res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/pbb.css"><link rel="stylesheet" href="/pbb-light.css"><link rel="stylesheet" href="/has-pbb.css"></head><body class="has-page"><main class="has-shell" id="view"></main></body></html>'));app.use(require('../has/static').withShared(root));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/art-check');await page.addScriptTag({url:base+'/has-completion.js'});
  const source=fs.readFileSync(path.join(root,'has-pbb-client.js'),'utf8'),spotter=source.match(/function spotterComplete\(\)\{return ([^]*?);\}/)[1],movement=source.slice(source.indexOf(' function driverMovementCard(){'),source.indexOf(' function render(){'));
  await page.evaluate(({spotter,movement})=>{
   window.showEmployeeView=(state,type)=>{
    const r={id:'fixture-'+type,resetToken:'',type,flightNo:type==='arrival'?'MU583':'MU586',date:'2026-10-22',gate:'156',bridge:'L3',ready:{spotter:state==='ready'},signatures:{driver:{name:'FIXTURE DRIVER',eid:'00123'},spotter:{name:'FIXTURE SPOTTER',eid:'00456'}},delivery:{status:'sent'}};
    document.getElementById('view').innerHTML=state==='complete'?window.hasChecklistComplete(r):state==='signed'?Function('record','hasEmployeeStatusArt','return '+spotter)(r,window.hasEmployeeStatusArt):Function('record','busy','saveError','saveFeedback','hasEmployeeStatusArt','esc','return ('+movement+')()')(r,false,false,'',window.hasEmployeeStatusArt,String);
   };
  },{spotter,movement});
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:1000});
   for(const type of ['arrival','departure'])for(const state of ['waiting','ready','signed','complete']){
    await page.evaluate(({state,type})=>window.showEmployeeView(state,type),{state,type});
    const image=page.locator('.has-employee-art img');await image.evaluate(img=>img.decode());const src=await image.getAttribute('src');
    assert.equal(await image.evaluate(img=>img.naturalWidth>0),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,type+' '+state+' '+width);
    const art=await image.boundingBox(),heading=await page.locator('h2').boundingBox();assert(art.y+art.height<=heading.y,'Portrait and heading do not overlap');
    if(state==='waiting'||state==='ready')assert.equal(await page.locator('#move').isDisabled(),state==='waiting');
    if(state==='signed'){assert.equal(await page.locator('button').count(),1);assert.match(await page.locator('button').innerText(),/Exit/);}
    if(state==='complete'){assert.match(await page.locator('.has-final-details').innerText(),/00123/);assert.equal(await page.locator('#download-pdf').count(),1);}
    await page.evaluate(({state,type})=>window.showEmployeeView(state,type),{state,type});assert.equal(await image.getAttribute('src'),src,'Rerender preserves portrait');
    await page.screenshot({path:path.join(output,type+'-'+state+'-'+width+'.png'),fullPage:true});
   }
  }
  for(const state of ['waiting','ready','signed','complete']){
   const sources=new Set();for(let i=0;i<3;i++){await page.evaluate(state=>{window.resetHasEmployeeStatusArt();window.showEmployeeView(state,'arrival');},state);await page.locator('.has-employee-art img').evaluate(img=>img.decode());sources.add(await page.locator('.has-employee-art img').getAttribute('src'));}
   assert.equal(sources.size,3,'Each state rotates through three employees');assert([...sources].some(src=>src.includes('asian')),'Asian employees participate in '+state);
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.has-employee-art img').evaluate(img=>getComputedStyle(img).animationName),'none');assert.deepEqual(errors,[]);
  console.log('Arrival/Departure: four states, image loading, stable rerenders, three-employee rotation, Asian inclusion, safe movement buttons and 320/390/1440px layout passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
