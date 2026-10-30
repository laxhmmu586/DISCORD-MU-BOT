const assert=require('node:assert/strict'),path=require('node:path'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),rows=[
  {id:'hq',name:'HQ PUBLISHER',position:'Supervisor',station:'HQ',account:'HQ',email:'hq@example.test'},
  {id:'cz',name:'CZ PUBLISHER',position:'Business Manager',station:'LAX',account:'CZ',additionalAccounts:[{station:'LAX',account:'MU'}],email:'cz@example.test'},
  {id:'mu',name:'MU STAFF',position:'Agent',station:'LAX',account:'MU',email:'mu@example.test'},
 ];
 const app=express(),employees={db,get:()=>({employees:rows})};
 const service=require('../has/server/readSign').registerReadSign(app,{employees,profiles:{linked:u=>rows.find(p=>p.id===u.uid)},authenticate:async req=>({uid:req.headers.authorization?.replace('Bearer ','')}),send:async()=>{}});
 app.use(require('../has/static').withShared(path.resolve('public/public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const id of ['hq','cz']){
   const page=await browser.newPage({viewport:{width:390,height:1000}});
   await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:''}));await page.route('**/__/firebase/init.js',r=>r.fulfill({body:''}));
   await page.addInitScript(({base,id})=>{window.MU_API_BASE=base;const user={email:id+'@example.test',getIdToken:async()=>id};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>fn(user)})};},{base,id});
   await page.goto(base+'/read-sign.html');await page.locator('#publish-memo').click();
   const select=page.locator('#memo-account');
   if(id==='hq'){assert.equal(await select.isEnabled(),true);await select.selectOption(JSON.stringify(['LAX','MU']));}
   else{assert.equal(await select.isDisabled(),true);assert.deepEqual(await select.locator('option').allTextContents(),['LAX / CZ']);}
   await page.locator('#memo-subject').fill(id+' scoped memo');await page.locator('#memo-body').fill('Please read and sign.');await page.locator('#memo-deadline').fill('2099-12-30T12:00');
   await page.getByRole('button',{name:'Review before publishing'}).click();await page.locator('#compose-preview').waitFor({state:'visible'});
   assert.match(await page.locator('#compose-preview-text').textContent(),id==='hq'?/To: LAX \/ MU/:/To: LAX \/ CZ/);
   await page.locator('#confirm-publish').click();await page.locator('#compose-dialog').waitFor({state:'hidden'});
   const memo=service.store.list({uid:id}).memos.find(m=>m.subject===id+' scoped memo');assert(memo);
   assert.deepEqual(service.store.get(memo.id).roster.map(p=>p.id),[id==='hq'?'mu':'cz']);
   await page.close();
  }
  console.log('PASS: mobile HQ account selector, locked Main Account, correct preview and recipient/email roster.');
 }finally{await browser.close();service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
