const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{findSYInfo}=require('../syParser');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const base=findSYInfo(fs.readFileSync(require.resolve('./fixtures/flight-selection-supplied.log'),'utf8'),'08OCT26');
 for(const mode of ['complete','incomplete','cold']){
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[],held=[];let searches=0,cores=0;
  await page.clock.install({time:new Date('2026-11-02T20:00:00Z')});await page.addInitScript(()=>{sessionStorage.setItem('mufc-online-flight',JSON.stringify({flightNo:'MU586',flightDate:'02NOV26',source:'current'}));window.EventSource=class{addEventListener(){}close(){}};});
  const sy=structuredClone(base);sy.flightDate='02NOV26';sy.fscRateSheetSync={skipped:false,rate:'0.15'};for(const step of sy.crewApis.steps){step.complete=mode==='complete'||step.key!=='net';step.time=step.complete?'12:00:00':'';}
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:''});if(u.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`const u={uid:'fixture',email:'test@mu.com',providerData:[],getIdToken:async()=>'fixture'};const fixtureAuth=()=>({currentUser:u,onAuthStateChanged:fn=>{setTimeout(()=>fn(u),0);return()=>{};},setPersistence:async()=>{}});fixtureAuth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};window.firebase={apps:[{}],auth:fixtureAuth};`});
   if(u.hostname==='api.mufcapp.net'){
    if(u.pathname==='/dashboard-snapshot')return route.fulfill({json:{sy:mode==='cold'?null:sy,allModulesComplete:mode==='complete'}});
    if(u.pathname==='/search'){searches++;if(u.searchParams.get('core')==='1'){cores++;return route.fulfill({json:{sy,core:true}});}held.push(route);return;}
    if(u.pathname==='/profile-api')return route.fulfill({json:{state:'ready',profile:{name:'Test',station:'LAX',account:'MU'}}});
    return route.fulfill({json:{rows:[],permissions:{},ready:true}});
   }
   for(const root of ['has/public','public/public']){const file=path.join(process.cwd(),root,decodeURIComponent(u.pathname));if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});}return route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/index.html');await page.locator('body:not(.is-loading)').waitFor({timeout:5000}).catch(async e=>{console.log(mode,errors,searches,cores,await page.locator('#active-flight').innerText(),await page.evaluate(()=>({url:location.href,flight:window.mufcFlight})));throw e;});assert((await page.locator('#active-flight').innerText()).includes('MU586'));
  if(mode==='complete'){assert.equal(searches,0);await page.clock.fastForward(60000);assert.equal(searches,0);for(const key of ['CREW_APIS','GD_CHECK','FSC','NEXTDAY_INFO','NET','CCL','CC','INITIAL_FLIGHT','BDT_CHG'])assert.equal(await page.locator(`.node[data-key="${key}"]`).getAttribute('data-status'),'done',key);}
  else{await page.waitForFunction(()=>Boolean(document.querySelector('#active-flight').textContent.includes('MU586')));for(let i=0;i<30&&!held.length;i++)await page.waitForTimeout(20);assert.equal(held.length,1);assert.equal(cores,mode==='cold'?1:0);assert.equal(await page.locator('.loading-overlay').isVisible(),false);const finished=structuredClone(sy);for(const step of finished.crewApis.steps)step.complete=true;await held.shift().fulfill({json:{sy:finished}});await page.waitForFunction(()=>document.querySelector('.node[data-key=NET]').dataset.status==='done');const count=searches;await page.clock.fastForward(60000);assert.equal(searches,count);}
  await page.screenshot({path:'.verification/dashboard-fast-'+mode+'.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: all nine completed modules enter with zero /search requests; incomplete modules still search; cached/core SY renders while enrichment is held, and searches stop on completion.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
