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
  await enter('arrival','driver');const id=new URL(page.url()).searchParams.get('record');await page.locator('[data-value=Y]').click();await page.getByText(/Check floor is clear/).waitFor();await page.locator('#prev').click();assert.equal(await page.locator('[data-value=Y]').getAttribute('aria-pressed'),'true');await page.locator('#prev').click();await page.locator('[data-type=arrival]').waitFor();assert.equal(store.get(id).answers.driver.a3,'Y');await page.locator('[data-type=arrival]').click();await page.locator('[data-bridge=L1][data-join=driver]').click();await page.getByText(/Check floor is clear/).waitFor();assert.equal(new URL(page.url()).searchParams.get('record'),id);await page.locator('#prev').click();assert.equal(await page.locator('[data-value=Y]').getAttribute('aria-pressed'),'true');
  for(const type of ['arrival','departure'])for(const role of ['driver','spotter']){
   await enter(type,role);const expected=items[type].filter(x=>!x.hidden&&x.roles.includes(role));while(!(await page.locator('.check-meta span').innerText()).startsWith('1 /'))await page.locator('#prev').click();
   for(const row of expected){await page.waitForFunction(text=>document.querySelector('.check-statement')?.textContent.includes(text),row.prompt);const photos=page.locator('.check-illustration img');for(let i=0;i<await photos.count();i++){await photos.nth(i).scrollIntoViewIfNeeded();await photos.nth(i).evaluate(img=>img.decode());}
    if(row.trainingIllustration)assert.deepEqual(await photos.evaluateAll(imgs=>imgs.map(img=>img.src.split('/').pop())),row.photos);
    assert.equal(await page.locator('.answer-icon').count(),2);
    assert.equal(await page.locator('.art-caption').count(),0,'no image badges');
    if(row.id==='a18')assert.equal(await photos.count(),1,'AUTO question keeps key photo only');
    if(row.id==='a15'){
     const back=page.locator('.stacked-photos .check-illustration').nth(1).locator('img'),box=await back.boundingBox();await back.click({position:{x:box.width-10,y:40}});await page.locator('.photo-dialog').waitFor();assert.ok((await page.locator('.photo-dialog img').getAttribute('src')).includes('bridge-approach'));await page.locator('.photo-close').click();
    }
    for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+row.id+' '+width);}
    if(['a6','a9','a11','a15','a16','a17','a18','d1','d3','d4','d11'].includes(row.id))await page.screenshot({path:path.join(output,row.id+'.png'),fullPage:true});
    if(row.id==='a12')assert.equal(await page.locator('video').count(),0,'READY question shows its illustration only');
    if(row.video){const v=page.locator('video');await v.evaluate(v=>{v.preload='auto';v.load()});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert.equal(await v.evaluate(v=>v.duration),28);assert.equal(await v.locator('track').getAttribute('src'),'/assets/pbb/ready-safe-go-lax-v2.vtt');
     if(row.id==='a15'){
      await v.evaluate(async v=>{window.pbbTestVideo=v;v.muted=true;v.currentTime=5;await v.play();});
      const response=await fetch(origin+'/pbb-api/records/'+id,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({action:'answer',role:'spotter',itemId:'a11',value:'Y'})});assert.equal(response.status,200);
      await page.locator('.role-progress').nth(1).getByText(/1 \/ 5 checked/).waitFor();
      assert.ok(await v.evaluate(v=>v===window.pbbTestVideo&&v.currentTime>=5&&!v.paused),'peer SSE update preserves same video and playback');await v.evaluate(v=>v.pause());
     }
    }
    await page.locator('#next').click();
   }
   await page.locator('.signal-flow').waitFor();assert.equal(await page.locator('video').count(),type==='arrival'?1:0);
  }
  for(const row of items.arrival.filter(x=>!x.hidden&&x.roles.includes('driver')))store.mutate(id,{uid:'fixture'},{action:'answer',role:'driver',itemId:row.id,value:'Y'});
  await enter('arrival','driver');await page.getByText('14. '+items.arrival.find(x=>x.id==='a18').prompt,{exact:true}).waitFor();assert.ok(!store.get(id).checklistDone?.driver,'all answers saved without done');await page.locator('#next').click();await page.locator('.signal-flow').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: ordered Arrival/Departure rows, all training image decodes, AUTO/OPERATE/OFF media, 28-second captioned video, Yes/No controls, Previous returns home and resumes saved answers, 320/390/1440 layouts.');
 }finally{await browser.close();pbb.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
