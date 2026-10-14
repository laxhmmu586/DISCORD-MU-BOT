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
    assert.ok(await page.evaluate(()=>innerWidth>850?document.querySelector('.live-panel').getBoundingClientRect().right<document.querySelector('.question-panel').getBoundingClientRect().left:document.querySelector('.live-panel').getBoundingClientRect().top>document.querySelector('.question-panel').getBoundingClientRect().bottom),'flight card below question');
    assert.ok(await page.evaluate(()=>document.querySelector('.flight-summary time').getBoundingClientRect().top>=document.querySelector('.flight-summary h2').getBoundingClientRect().bottom),'date below flight');
    assert.ok(await page.evaluate(()=>{const f=document.querySelector('.pbb-footer').getBoundingClientRect(),p=document.querySelector(innerWidth>850?'.working-grid':'.question-panel').getBoundingClientRect();return Math.abs(f.left-p.left)<2&&Math.abs(f.right-p.right)<2}),'footer aligned with panel');
    assert.equal(await page.locator('[data-value]').first().getAttribute('data-value'),'Y');

    assert.equal(await page.locator('.art-caption').count(),0,'no image badges');
    if(row.id==='a18')assert.equal(await photos.count(),1,'AUTO question keeps key photo only');
    if(row.id==='a15'){const gallery=page.locator('.stacked-photos');await gallery.focus();await gallery.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.stacked-photos').scrollLeft>100);assert.equal(await gallery.evaluate(g=>getComputedStyle(g).scrollbarWidth),'none');await gallery.locator('img').nth(1).click();await page.locator('.photo-dialog').waitFor();assert.ok((await page.locator('.photo-dialog img').getAttribute('src')).includes('bridge-approach'));await page.locator('.photo-close').click();}
    for(const width of [1440,320,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+row.id+' '+width);}
    if(row.id==='a15'){await page.setViewportSize({width:390,height:1000});await page.screenshot({path:path.join(output,'a15-mobile.png'),fullPage:true});}
    if(['a6','a9','a11','a15','a16','a17','a18','d1','d3','d4','d11'].includes(row.id))await page.screenshot({path:path.join(output,row.id+'.png'),fullPage:true});
    assert.equal(await page.locator('video').count(),0,'question pages contain no video');
    await page.locator('#next').click();
   }
   await page.locator('.signal-flow').waitFor();assert.equal(await page.locator('video').count(),0,'Checklist Done contains no video');
   for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});const boxes=await page.locator('.signal-card').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right}}));assert.equal(boxes[0].top,boxes[1].top);assert.ok(boxes[0].right<boxes[1].left);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}await page.screenshot({path:path.join(output,type+'-'+role+'-done.png'),fullPage:true});

  }
  for(const row of items.arrival.filter(x=>!x.hidden&&x.roles.includes('driver')))store.mutate(id,{uid:'fixture'},{action:'answer',role:'driver',itemId:row.id,value:'Y'});
  await enter('arrival','driver');await page.getByText('14. '+items.arrival.find(x=>x.id==='a18').prompt,{exact:true}).waitFor();assert.ok(!store.get(id).checklistDone?.driver,'all answers saved without done');await page.locator('#next').click();await page.locator('.signal-flow').waitFor();
  await page.locator('#signal-prev').click();await page.locator('[data-role=spotter]').click();await page.locator('[data-role=spotter][aria-pressed=true]').waitFor();await page.locator('[data-role=driver]').click();await page.getByText('14. '+items.arrival.find(x=>x.id==='a18').prompt,{exact:true}).waitFor();
  await page.goto(origin+'/pbb.html');await page.locator('[data-type=departure]').click();await page.locator('#today-flight').waitFor();await page.locator('#pbb-status').evaluate(e=>e.textContent='L1 restarted. Start a new checklist.');assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('#pbb-status').getBoundingClientRect().left-document.querySelector('.pbb-intro').getBoundingClientRect().left)<2));
  assert.deepEqual(errors,[]);console.log('PASS: ordered Arrival/Departure rows, all training image decodes, AUTO/OPERATE/OFF media, no videos; side-by-side confirmations; swipe gallery, Yes/No controls, Previous returns home and resumes saved answers, 320/390/1440 layouts.');
 }finally{await browser.close();pbb.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
