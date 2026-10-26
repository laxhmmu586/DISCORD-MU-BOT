const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),express=require('express'),Database=require('better-sqlite3');
(async()=>{
 const db=new Database(':memory:'),names=['CHEN, TAYLOR','PARK, ALEX','MORGAN, JAMIE','BROWN, CASEY','LEE, JORDAN','WILSON, RILEY','GARCIA, CAMERON','PATEL, SAM','NGUYEN, AVERY','KIM, DREW','DAVIS, ROWAN','MARTIN, SKYLER','CLARK, LOGAN','LEWIS, QUINN','WALKER, REESE'];
 const seed=names.map((name,i)=>({id:'e'+i,name,nickname:i===0?'Taylor':'',eid:String(120001+i),position:i===0?'Manager':i===1?'Supervisor':'Agent',phone:'6265550100',email:'employee'+i+'@example.test',companyEmail:'employee'+i+'@company.example.test',loginId:i===0?'lake@mu.com':'employee'+i+'@login.example.test',attach:false,detach:false,spotter:false}));
 const employees={...require('../employees').createEmployeeStore(db,{seed}),db},users=seed.map(e=>({uid:e.id,email:e.loginId,provider:'password'}));
 const app=express();app.use(express.json({limit:'16mb'}));const authenticate=async req=>{const u=users.find(u=>req.headers.authorization==='Bearer '+u.uid);if(!u)throw Error('Sign in required');return u;};
 const profiles=require('../employeeProfiles').registerProfiles(app,{employees,authenticate});users.forEach(u=>profiles.status(u));
 const readSign=require('../readSign').registerReadSign(app,{employees,profiles,authenticate,send:async()=>{}}),uniform=require('../uniformRequests').registerUniform(app,{employees,profiles,authenticate,notify:async()=>{},send:async()=>{}});
 const records=[{reference:'REQ-DEMO-001',date:'2026-10-17',type:'late',arrivalTime:'10:15',reason:'Traffic delay on the way to the airport.',note:'Supervisor notified by phone.',submittedAt:'2026-10-17T16:40:00Z'},{reference:'REQ-DEMO-002',date:'2026-10-12',type:'sick',reason:'Unwell. Unable to attend the scheduled shift.',submittedAt:'2026-10-12T12:30:00Z'}];
 const attendance=require('../attendanceRequests').registerAttendance(app,{employees,profiles,authenticate,db,client:{},storage:{list:async()=>records}});
 app.use(express.static('public/public'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,output=path.resolve('output/employee-sidebar-pages');fs.mkdirSync(output,{recursive:true});

 require('../employees').registerEmployees(app,{store:employees,authenticate});
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',r=>r.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const u={...${JSON.stringify(users[0])},providerData:[],getIdToken:async()=>${JSON.stringify(users[0].uid)}};window.firebase={apps:[{}],auth:()=>({currentUser:u,setPersistence:async()=>{},onAuthStateChanged:fn=>{setTimeout(()=>fn(u),0);return()=>{};}})};firebase.auth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};`}));
  const pages={'profile.html':'#profile-content','admin.html':'#employee-panel','info.html':'#info-content','request.html':'#uniform-content','read-sign.html':'#rs-content'};
  for(const width of [320,390,1024,1440,2560]){
   await page.setViewportSize({width,height:1000});let previous;
   for(const [file,content] of Object.entries(pages)){
    await page.goto(base+'/'+file);await page.locator(content).waitFor({state:'visible'});const image=page.locator('#has-sidebar-employee');assert.equal(await image.count(),1);await image.evaluate(img=>img.decode());
    const src=await image.getAttribute('src');if(previous)assert.notEqual(src,previous,'Page entry advances the series');previous=src;
    assert.equal(await page.locator('.profile-sidebar nav a[href="/info.html"]').count(),0);for(const name of Object.keys(pages).filter(name=>name!=='info.html'))assert.equal(await page.locator('.profile-sidebar nav a[href="/'+name+'"]').count(),1,'Navigation remains intact: '+name);
    assert.equal(await image.isVisible(),width>760);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,file+' overflow at '+width);
    if(width>760){const nav=await page.locator('.profile-sidebar nav').boundingBox(),art=await image.boundingBox();assert(art.y>=nav.y+nav.height,'Artwork stays below navigation');assert(art.y+art.height<=1000,'Artwork fits viewport');}
    if(width===1440||width===390)await page.screenshot({path:path.join(output,file.replace('.html','')+'-'+width+'.png'),fullPage:true});
   }
  }
  await page.setViewportSize({width:1440,height:1000});const all=new Set();for(let i=0;i<10;i++){await page.goto(base+'/profile.html');await page.locator('#profile-content').waitFor({state:'visible'});await page.locator('#has-sidebar-employee').evaluate(img=>img.decode());all.add(await page.locator('#has-sidebar-employee').getAttribute('src'));}assert.equal(all.size,10);
  const src=await page.locator('#has-sidebar-employee').getAttribute('src');await page.addScriptTag({url:base+'/employee-sidebar-art.js?v=repeat'});assert.equal(await page.locator('#has-sidebar-employee').count(),1);assert.equal(await page.locator('#has-sidebar-employee').getAttribute('src'),src,'Repeated initialization preserves the employee');
  await page.setViewportSize({width:1440,height:600});assert.equal(await page.locator('#has-sidebar-employee').isVisible(),false);assert.equal(await page.locator('.profile-sidebar nav').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.getElementById('has-sidebar-employee').remove();Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw Error('Storage disabled');}});});await page.addScriptTag({url:base+'/employee-sidebar-art.js?v=storage-blocked'});await page.locator('#has-sidebar-employee').evaluate(img=>img.decode());assert.equal(await page.locator('#has-sidebar-employee').isVisible(),true);assert.deepEqual(errors,[]);
  console.log('Five real employee pages: ten portraits rotate across visits, data and navigation load, no duplicate images, blocked storage, desktop/short-screen/mobile layout at 320/390/1024/1440/2560px passed.');
 }finally{await browser.close();readSign.close();uniform.close();attendance.close();server.close();db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
