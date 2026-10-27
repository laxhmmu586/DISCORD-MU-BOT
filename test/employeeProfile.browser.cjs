const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let scenario='ready',linked=true,revision=1,profile={id:'one',name:'TEST EMPLOYEE',nickname:'Lake',eid:'00123',phone:'555-0100',email:'employee@gmail.com',avatar:'',station:'LAX',pbbId:'PBB-TEST',pbbExpiry:new Date(Date.now()+10*86400000).toISOString().slice(0,10)};
 const user={uid:'fixture',email:'employee@gmail.com',providerData:[{providerId:'google.com'}]};
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),pathname=url.pathname;
  if(url.hostname==='www.gstatic.com')return route.fulfill({body:'',contentType:'text/javascript'});
  if(pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`(()=>{let user=${scenario==='ready'?JSON.stringify(user):'null'},callbacks=[];const state={get currentUser(){return user;},setPersistence:async()=>{},onAuthStateChanged:fn=>{callbacks.push(fn);setTimeout(()=>fn(user),0);return()=>{};},signInWithPopup:async()=>{user=${JSON.stringify(user)};user.getIdToken=async()=>'fixture';callbacks.forEach(fn=>fn(user));return {user};},signOut:async()=>{user=null;callbacks.forEach(fn=>fn(null));},signInWithEmailAndPassword:async()=>{user={...${JSON.stringify(user)},providerData:[{providerId:'password'}],getIdToken:async()=>'fixture'};callbacks.forEach(fn=>fn(user));return {user};}};if(user)user.getIdToken=async()=>'fixture';const auth=()=>state;auth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};auth.GoogleAuthProvider=function(){this.setCustomParameters=()=>{};};window.firebase={apps:[{}],auth};})();`});
  if(pathname.startsWith('/profile-api')){
   if(/^[^@\s]+@mu\.com$/i.test(user.email))return route.fulfill({json:{state:'external'}});
   if(pathname.endsWith('/lookup')){const body=route.request().postDataJSON();if(body.eid!=='00123')return route.fulfill({status:403,json:{error:'Employee record not found. Please contact an administrator.'}});return route.fulfill({json:{state:'confirm',profile,revision}});}
   if(pathname.endsWith('/link')){linked=true;return route.fulfill({json:{state:'ready',profile,revision}});}
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();assert.equal(body.revision,revision);for(const key of ['nickname','phone','email','avatar'])if(body[key]!==undefined)profile[key]=body[key];revision++;}
   return route.fulfill({json:linked?{state:'ready',profile,revision}:scenario==='eid'?{state:'needs_eid'}:{state:'confirm',profile,revision}});
  }
  if(url.hostname==='api.mufcapp.net')return route.fulfill({json:{flights:[]}});
  const file=path.join(process.cwd(),'public/public',pathname);if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});return route.fulfill({status:404,body:''});
 });
 fs.mkdirSync('.verification/profile',{recursive:true});

 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto('http://localhost/profile.html');await page.locator('#profile-content').waitFor({state:'visible'});
  assert.equal(await page.locator('.profile-personal-column,#profile-employee-id,#view-employee-id,#phone,#contact-email').count(),0);
  assert.equal(await page.locator('#profile-pbb-label').textContent(),'TBIT PBB ID');assert(await page.locator('#profile-avatar').count());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'.verification/profile/simplified-'+width+'.png',fullPage:true});
 }
 await page.locator('#edit-profile').click();await page.locator('#nickname').fill('Updated nickname');await page.locator('#save-profile').click();await page.locator('#profile-edit-dialog').waitFor({state:'hidden'});assert.equal(profile.nickname,'Updated nickname');assert.equal(profile.phone,'555-0100');assert.equal(profile.email,'employee@gmail.com');assert.equal(await page.locator('#profile-display-name').textContent(),'Updated nickname');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: simplified Profile has no Employee ID or Personal Information panel; PBB, responsive layout and nickname editing remain functional.');
})().catch(error=>{console.error(error);process.exit(1);});
