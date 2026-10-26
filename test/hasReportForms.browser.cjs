const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),users={lead:{uid:'lead',email:'lead@example.test',position:'Lead',station:'LAX',account:'MU',name:'Test Lead'},supervisor:{uid:'supervisor',email:'supervisor@example.test',position:'Supervisor',station:'LAX',account:'MU',name:'Test Supervisor'},agent:{uid:'agent',email:'agent@example.test',position:'Agent',station:'LAX',account:'MU',name:'Test Agent'},other:{uid:'other',email:'other@example.test',position:'Supervisor',station:'SFO',account:'XX',name:'Other Account'}};
 const app=express();app.use(express.json({limit:'16mb'}));const authenticate=async req=>{const user=users[req.headers.authorization?.replace('Bearer ','')];if(!user)throw Error('auth');return user;};
 require('../hasReports').registerHasReports(app,{employees:{db},profiles:{linked:u=>users[u.uid]},authenticate});app.get('/profile-api',async(req,res)=>res.json({state:'ready',profile:await authenticate(req)}));app.use(express.static('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];let liveConnections=0,fallbackRequests=0;
 async function pageFor(id,now='2026-10-24T20:00:00Z'){const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/updates'))fallbackRequests++;});page.on('response',r=>{if(r.url().endsWith('/stream')&&r.status()===200)liveConnections++;});await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const u={...${JSON.stringify(users[id])},providerData:[],getIdToken:async()=>${JSON.stringify(id)}};window.firebase={apps:[{}],auth:()=>({currentUser:u,onAuthStateChanged:fn=>{setTimeout(()=>fn(u),0);return()=>{};}})};`}));await page.clock.setFixedTime(new Date(now));await page.goto(base+'/has-report.html');return page;}
 try{
  const supervisor=await pageFor('supervisor'),lead=await pageFor('lead');await supervisor.locator('[data-cell-input="K7"]').waitFor();await lead.locator('[data-cell-input="K7"]').waitFor();
  for(const kind of ['terrific','expense'])assert.equal(await lead.locator('#report-kind option[value="'+kind+'"]').count(),0);
  const out=path.resolve('output/report-forms');fs.mkdirSync(out,{recursive:true});
  for(const kind of ['terrific','expense']){
   await supervisor.selectOption('#report-kind',kind);const address=kind==='terrific'?'C4':'A4';await supervisor.locator('[data-cell-input="'+address+'"]').waitFor();await supervisor.waitForFunction(()=>!document.querySelector('#report-editor').inert);
   await supervisor.locator('[data-cell-input="'+address+'"]').fill('Browser verified');await supervisor.locator('h1').click();await supervisor.waitForFunction(()=>document.querySelector('#report-status').textContent.startsWith('Saved by'),{},{timeout:10000}).catch(async e=>{console.log('STATUS',await supervisor.locator('#report-status').textContent());throw e;});
   if(kind==='expense'){
    assert.equal(await supervisor.locator('.expense-editor').count(),1);
    await supervisor.locator('[data-cell-input="F4"]').fill('2026-10-25');
    for(const [a,value] of [['A48','Shipping pickup'],['H48','9.54'],['J48','9.54'],['H49','98.66'],['J49','98.66']])await supervisor.locator('[data-cell-input="'+a+'"]').fill(value);
    assert.equal(await supervisor.locator('.expense-summary [data-formula="J72"]').textContent(),'$108.20');
    const other=supervisor.locator('.expense-section').filter({has:supervisor.locator('summary').filter({hasText:'Other expenses'})});
    assert.equal(await other.locator('tbody tr:visible').count(),2);await other.locator('.expense-add-line').click();assert.equal(await other.locator('tbody tr:visible').count(),3);
    await supervisor.locator('[data-cell-input="A50"]').fill('Additional expense details');
    await supervisor.locator('h1').click();await supervisor.waitForFunction(()=>document.querySelector('#report-status').textContent.startsWith('Saved by'));
   }
   const downloaded=supervisor.waitForEvent('download');await supervisor.click('#report-export');const download=await downloaded;assert.equal(await download.failure(),null);assert.match(download.suggestedFilename(),new RegExp(kind.toUpperCase()+'.*2026-10.xlsx'));
   if(kind==='expense'){const Excel=require('exceljs'),book=new Excel.Workbook();await book.xlsx.readFile(await download.path());const sheet=book.worksheets[0];assert.equal(sheet.getCell('A50').value,'Additional expense details');assert(Math.abs(sheet.getCell('J72').result-108.2)<1e-9);assert.equal(sheet.getCell('F4').value,'2026-10-25');}
   for(const width of [390,1440]){await supervisor.setViewportSize({width,height:1000});await supervisor.screenshot({path:path.join(out,kind+'-'+width+'.png'),fullPage:true});assert.equal(await supervisor.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   await supervisor.reload();await supervisor.locator('[data-cell-input="K7"]').waitFor();await supervisor.selectOption('#report-kind',kind);await supervisor.locator('[data-cell-input="'+address+'"]').waitFor();assert.equal(await supervisor.locator('[data-cell-input="'+address+'"]').inputValue(),'Browser verified');
   if(kind==='expense'){assert.equal(await supervisor.locator('[data-cell-input="A50"]').isVisible(),true);assert.equal(await supervisor.locator('[data-cell-input="A50"]').inputValue(),'Additional expense details');assert.equal(await supervisor.locator('.expense-summary [data-formula="J72"]').textContent(),'$108.20');}
  }
  await supervisor.selectOption('#report-kind','rechargeable');await supervisor.locator('.recharge-panel').waitFor();assert.equal(await supervisor.getByText('SUMMARY first;', {exact:false}).count(),0);
  assert.deepEqual(errors,[]);console.log('Form editing, autosave/reload, Excel downloads, Supervisor permissions, and 390/1440 layouts passed.');
 }finally{await browser.close();server.close();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
