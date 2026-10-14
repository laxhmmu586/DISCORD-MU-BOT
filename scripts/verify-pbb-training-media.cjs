const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createStore,registerPbb}=require('../pbb'),items=require('../public/public/pbb-data');
(async()=>{
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00Z')});
 const pbb=registerPbb(app,{store,employeeSeed:require('../test/fixtures/pbb-employees.json'),authenticate:async()=>({uid:'fixture'}),gateService:{today:async(date,type)=>({flights:[{flightNo:type==='arrival'?'MU583':'MU586',gate:'132',date}]}),read:async()=>({status:'unavailable'})},client:{},drive:{files:{}}});
 app.use(express.static(path.resolve('public/public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});const output=path.resolve('output/pbb-training-preview');await fs.mkdir(output,{recursive:true});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.addInitScript(origin=>window.MU_API_BASE=origin,origin);page.on('pageerror',e=>errors.push(e.message));
  const enter=async(type,role)=>{await page.goto(origin+'/pbb.html');await page.locator('[data-type='+type+']').click();await page.locator('[data-bridge=L1][data-join='+role+']').click();await page.locator('.check-statement').waitFor();};
  await enter('arrival','driver');const id=new URL(page.url()).searchParams.get('record');await page.locator('[data-value=Y]').click();await page.getByText(/Check floor is clear/).waitFor();await page.locator('#prev').click();assert.equal(await page.locator('[data-value=Y]').getAttribute('aria-pressed'),'true');await page.locator('#prev').click();await page.locator('[data-type=arrival]').waitFor();assert.equal(store.get(id).answers.driver.a3,'Y');await page.locator('[data-type=arrival]').click();await page.locator('[data-bridge=L1][data-join=driver]').click();await page.locator('.check-statement').waitFor();assert.equal(new URL(page.url()).searchParams.get('record'),id);assert.equal(await page.locator('[data-value=Y]').getAttribute('aria-pressed'),'true');
  for(const type of ['arrival','departure'])for(const role of ['driver','spotter']){
   await enter(type,role);const expected=items[type].filter(x=>!x.hidden&&x.roles.includes(role));
   for(const row of expected){await page.waitForFunction(text=>document.querySelector('.check-statement')?.textContent.includes(text),row.prompt);const photos=page.locator('.check-illustration img');for(let i=0;i<await photos.count();i++){await photos.nth(i).scrollIntoViewIfNeeded();await photos.nth(i).evaluate(img=>img.decode());}
    if(row.trainingIllustration)assert.deepEqual(await photos.evaluateAll(imgs=>imgs.map(img=>img.src.split('/').pop())),row.photos);
    assert.equal(await page.locator('.answer-icon').count(),2);
    for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+row.id+' '+width);}
    if(['a6','a11','a16','a17','a18','d1','d3','d4','d11'].includes(row.id))await page.screenshot({path:path.join(output,row.id+'.png'),fullPage:true});
    if(row.video){const v=page.locator('video');await v.evaluate(v=>{v.preload='auto';v.load()});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert.equal(await v.evaluate(v=>v.duration),28);assert.equal(await v.locator('track').getAttribute('src'),'/assets/pbb/ready-safe-go-lax-v2.vtt');}
    await page.locator('#next').click();
   }
   await page.locator('.signal-flow').waitFor();assert.equal(await page.locator('video').count(),type==='arrival'?1:0);
  }
  assert.deepEqual(errors,[]);console.log('PASS: ordered Arrival/Departure rows, all training image decodes, AUTO/OPERATE/OFF media, 28-second captioned video, Yes/No controls, Previous returns home and resumes saved answers, 320/390/1440 layouts.');
 }finally{await browser.close();pbb.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
