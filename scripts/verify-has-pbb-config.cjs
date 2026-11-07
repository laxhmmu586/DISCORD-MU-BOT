const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createEmployeeStore,registerEmployees}=require('../has/server/employees'),{registerHasPbb}=require('../has/server/hasPbb');
(async()=>{
 const db=new Database(':memory:'),employees=createEmployeeStore(db,{seed:[['lake','Business Manager'],['agent','Agent']].map(([id,position])=>({id,name:id==='lake'?'TEST MANAGER':'TEST EMPLOYEE',position,station:'LAX',account:'MU',loginId:id==='lake'?'lake@mu.com':'agent@example.test',eid:'123821',pbbId:'1071',pbbExpiry:'2028-09-28',pbbMscId:'1071',pbbMscExpiry:'2028-03-30',attach:true,detach:true,spotter:true}))});
 const app=express();app.use(express.json());const profiles={status(){},linked:user=>employees.get().employees.find(row=>row.id===user.uid)},authenticate=async req=>{const uid=req.headers.authorization?.replace('Bearer ','');if(!uid)throw Error('Sign in required');return {uid,email:uid==='lake'?'lake@mu.com':'agent@example.test'};};
 registerEmployees(app,{store:employees,profiles,authenticate});const service=registerHasPbb(app,{store:{db,now:()=>new Date('2026-11-06T20:00:00Z')},employees,profiles,authenticate});
 app.get('/profile-api',(req,res)=>res.json({state:'ready',profile:employees.get().employees[0],revision:employees.get().revision}));app.use(require('../has/static').withShared(path.join(__dirname,'../public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port,output=path.join(__dirname,'../output/pbb-config');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});const errors=[];
 try{
  const headers={Authorization:'Bearer lake','Content-Type':'application/json'};await fetch(base+'/has-pbb-api/dashboard/config',{method:'POST',headers,body:JSON.stringify({revision:1,pairs:[{id:'mu',station:'LAX',account:'MU',inbound:{flightNo:'MU583',days:[1,2,3,4,5,6,7]},outbound:{flightNo:'MU586',days:[1,2,3,4,5,6,7]}}]})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(base=>{window.MU_API_BASE=base;const user={providerData:[],displayName:'Test',email:'lake@mu.com',getIdToken:async()=>'lake'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>fn(user)})};},base);
  await page.route('https://www.gstatic.com/**',route=>route.fulfill({body:''}));await page.route('**/__/firebase/init.js',route=>route.fulfill({body:''}));
  await page.goto(base+'/has-pbb.html');await page.locator('#gate-form').waitFor();assert.equal(await page.locator('.has-current-account').innerText().then(text=>text.includes('EID')),false);assert.equal(await page.locator('.has-license-line').count(),2);
  const actions=await page.locator('.has-top-actions').boundingBox();assert(actions.x>900);await page.screenshot({path:path.join(output,'gate-desktop.png')});
  await page.locator('#has-config-button').click();await page.locator('[data-pair-id]').waitFor();await page.screenshot({path:path.join(output,'flights-desktop.png')});
  await page.locator('[data-config-tab=pbb]').click();await page.locator('[data-pbb-employee=agent]').click();await page.locator('#pbb-settings-form [name=pbbId]').fill('UPDATED-1071');await page.locator('#save-pbb-settings').click();await page.getByText('PBB settings saved.',{exact:true}).waitFor();assert.equal(employees.get().employees.find(row=>row.id==='agent').pbbId,'UPDATED-1071');await page.screenshot({path:path.join(output,'pbb-desktop.png')});
  for(const width of [390,760]){await page.setViewportSize({width,height:900});for(const tab of ['flights','pbb']){await page.locator('[data-config-tab='+tab+']').click();assert(await page.locator('#schedule-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1));await page.screenshot({path:path.join(output,tab+'-'+width+'.png')});}}
  assert.deepEqual(errors,[]);console.log('Desktop and mobile Config, right aligned navigation, separate certificate lines and persisted PBB edits passed.');
 }finally{await browser.close();service.close();server.closeAllConnections();server.close();db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
