const assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),app=express(),user={uid:'s',name:'Test Supervisor',position:'Supervisor',station:'LAX',account:'MU'};
 app.use(express.json());app.get('/has-page-api/has-report/access',(_req,res)=>res.json({canAccess:true}));const service=require('../has/server/hasReports').registerHasReports(app,{employees:{db},profiles:{linked:()=>user},authenticate:async()=>user});
 app.use(require('../has/static').withShared('public/public'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const u={...${JSON.stringify(user)},providerData:[],getIdToken:async()=>"s"};window.firebase={apps:[{}],auth:()=>({currentUser:u,onAuthStateChanged:fn=>{setTimeout(()=>fn(u),0);return()=>{};}})};`}));
 try{
 for(const kind of ['terrific','expense','investigation','cos','paf','discussion']){
  console.log('Checking',kind);await page.goto(base+'/has-report.html?kind='+kind);
  const word=!['terrific','expense'].includes(kind),selector=word?'[data-word-field]':'[data-cell-input]';await page.locator(selector).first().waitFor({state:'attached'})
  const input=word?page.locator('textarea[data-word-field]').first():page.locator('[data-cell-input="'+(kind==='terrific'?'C4':'A4')+'"]');
  await input.fill('Clear this saved content');
  if(word)await page.getByRole('button',{name:'Save form',exact:true}).click();else await page.locator('h1').click();
  await page.waitForFunction(()=>document.querySelector('#report-status').textContent.startsWith('Saved by'));
  const clear=page.getByRole('button',{name:'Clear form',exact:true});
  page.once('dialog',d=>d.dismiss());await clear.click();assert.equal(await input.inputValue(),'Clear this saved content');
  page.once('dialog',d=>d.accept());await clear.click();await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].every(input=>input.type==='checkbox'?!input.checked:input.value===''),selector);
  assert(await page.locator(selector).evaluateAll(inputs=>inputs.every(input=>input.type==='checkbox'?!input.checked:input.value==='')));
  await page.reload();await page.locator(selector).first().waitFor({state:'attached'});assert(await page.locator(selector).evaluateAll(inputs=>inputs.every(input=>input.type==='checkbox'?!input.checked:input.value==='')));
  console.log('Cleared and reloaded',kind);
 }
 assert.deepEqual(errors,[]);console.log('PASS: all six report forms clear saved fields and stay empty after reload; cancel preserves values.');
 }finally{await browser.close();service.close();server.closeAllConnections();server.close();db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
