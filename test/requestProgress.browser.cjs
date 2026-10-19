const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 console.log('Launching browser');const browser=await chromium.launch({channel:'msedge',headless:true,timeout:30000});console.log('Browser ready');
 try{
 fs.mkdirSync('.verification',{recursive:true});const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mode='draft',count=0;
 const employee={id:'e1',name:'LAKE XIA',eid:'001',phone:'123'},stages=['Supervisor','Manager'];
 const route=stages.map((position,i)=>({position,reviewers:[{name:i?'LAKE XIA':'TAN, CHUYANG'}]}));
 await page.route('**/*',async routeRequest=>{
 const url=new URL(routeRequest.request().url()),p=url.pathname;
 if(p==='/__/firebase/init.js')return routeRequest.fulfill({contentType:'text/javascript',body:`window.firebase={auth:()=>({onAuthStateChanged:fn=>fn({email:'test@example.com'})})};window.employeeProfileApi=async()=>({state:'ready',profile:${JSON.stringify(employee)}});window.uniformApi=async()=>window.mockData;`});
 if(p==='/employee-profile-api.js'||p==='/uniform-api.js'||p==='/flight-account.js'||url.hostname==='www.gstatic.com')return routeRequest.fulfill({body:'',contentType:'text/javascript'});
 const file='public/public'+p;
 if(fs.existsSync(file))return routeRequest.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'text/javascript'});
 return routeRequest.fulfill({status:404,body:''});
 });
 for(mode of ['draft','pending','manager','approved','rejected','custom']){
 const custom=mode==='custom',ss=custom?['Lead','Supervisor','Manager']:stages;
 const record={id:'r1',employee,date:'2026-10-19',stages:ss,step:mode==='manager'?1:0,status:['manager','custom'].includes(mode)?'pending':mode,approvals:mode==='manager'?[{name:'TAN, CHUYANG',action:'approve'}]:mode==='approved'?stages.map(()=>({name:'Reviewer',action:'approve'})):mode==='rejected'?[{name:'TAN, CHUYANG',action:'reject',note:'Please update the size.'}]:[],approvalRoute:route,nextApprovers:[{name:mode==='manager'?'LAKE XIA':'TAN, CHUYANG'}],items:[],delivery:'sent'};
 await page.addInitScript(data=>window.mockData=data,{requests:mode==='draft'?[]:[record],workflow:{stages:ss},approvalRoute:route});
 await page.goto('http://localhost/request.html');await page.locator('#uniform-content').waitFor({state:'visible'});await page.locator('#request-type').selectOption('uniform');
 assert.equal(await page.locator('#uniform-form-progress .oa-track li').count(),ss.length+1);
 assert.equal(await page.locator('#uniform-form-progress .oa-current').count(),['approved','rejected'].includes(mode)?0:1);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1100});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('.uniform-progress-panel').screenshot({path:`.verification/request-${mode}-${width}.png`});}
 count++;
 }
 await page.goto('http://localhost/uniform.html?request=r1#details');await page.waitForURL('**/request.html?request=r1#details');
 await page.goto('http://localhost/attendance-request.html');assert.equal(await page.locator('#choose').count(),1);
 assert.deepEqual(errors,[]);console.log(`PASS ${count} workflow states at desktop/mobile, legacy redirect, attendance page, no browser errors.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
