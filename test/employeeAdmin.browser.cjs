const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
 let email='nextweek1216@gmail.com',saved;
 const record={id:'one',name:'TEST EMPLOYEE',nickname:'Lake',eid:'00123',phone:'6268891216',email:'contact@gmail.com',discordId:'123456789012345678',loginId:'legacy@mu.com',attach:true,detach:false,spotter:true};
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(url.hostname==='www.gstatic.com')return route.fulfill({body:'',contentType:'text/javascript'});
  if(p==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{email:${JSON.stringify(email)},getIdToken:async()=>'fixture'},onAuthStateChanged:fn=>{setTimeout(()=>fn({email:${JSON.stringify(email)},getIdToken:async()=>'fixture',providerData:[]}),0);return()=>{};}})};`});
  if(p==='/employee-admin-api'){if(route.request().method()==='POST')saved=route.request().postDataJSON();return route.fulfill({json:{revision:1,employees:[record],updatedAt:'fixture',updatedBy:email}});}
  if(p==='/profile-api')return route.fulfill({json:{state:'ready',profile:record,revision:1}});
  const file=path.join(process.cwd(),'public/public',p);if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});return route.fulfill({status:404,body:''});
 });
 await page.goto('http://localhost/admin.html');await page.locator('#employee-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#profile-admin-nav').isVisible(),true);assert.equal(await page.locator('#profile-admin-nav').getAttribute('aria-current'),'page');
 fs.mkdirSync('.verification/profile',{recursive:true});for(const width of [2560,1920,1440,390]){
  await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin overflow at '+width);assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(246, 249, 253)');
  if(width>1100){const shell=await page.locator('.employee-admin-shell').boundingBox();assert(Math.abs(shell.x+shell.width-width)<2,'Admin fills desktop width');const phone=await page.locator('input[name=phone]').boundingBox(),login=await page.locator('input[name=loginId]').boundingBox();assert(login.width>phone.width*1.5);assert.equal(await page.locator('thead th').count(),14);}
  const height=(await page.locator('#employees tr').boundingBox()).height;await page.locator('[data-pbb-edit]').click();assert.equal(await page.locator('#employee-pbb-dialog').evaluate(el=>el.open),true);assert.equal((await page.locator('#employees tr').boundingBox()).height,height,'PBB popup does not expand row');assert.equal(await page.locator('[data-pbb-field]').count(),4);await page.locator('[data-pbb-field=pbbId]').fill('CANCELLED');await page.screenshot({path:'.verification/profile/admin-pbb-dialog-'+width+'.png',fullPage:true});await page.locator('#cancel-employee-pbb').click();assert.equal(await page.locator('input[name=pbbId]').inputValue(),'');await page.screenshot({path:'.verification/profile/admin-'+width+'.png',fullPage:true});
 }
 await page.locator('[data-pbb-edit]').click();await page.locator('[data-pbb-field=pbbId]').fill('PBB-123');await page.locator('[data-pbb-field=pbbExpiry]').fill('2027-10-21');assert.equal(await page.locator('[data-pbb-field=detach]').count(),0);assert.equal(await page.locator('[data-pbb-field=attach]').count(),0);assert.equal(await page.locator('[data-pbb-field=spotter]').count(),0);await page.locator('#employee-pbb-form button[type=submit]').click();await page.locator('[data-pbb-edit]').click();assert.equal(await page.locator('[data-pbb-field=pbbId]').inputValue(),'PBB-123');await page.keyboard.press('Escape');const headers=await page.locator('thead th').allTextContents();assert.equal(headers[7],'COMPANY EMAIL');assert.equal(headers[9],'ORIGINAL LOGIN ID');
 assert.equal(await page.locator('input[name=loginId]').inputValue(),'legacy@mu.com');
 assert.equal(await page.locator('input[name=email]').inputValue(),'contact@gmail.com');
 assert.equal(await page.locator('input[name=phone]').inputValue(),'626-889-1216');
 const copy=await page.locator('body').textContent();for(const removed of ['Enable PBB Attach for Arrival signatures','Custom order:','Manage employee details and Jet Bridge qualifications'])assert(!copy.includes(removed));
 await page.locator('input[name=loginId]').fill('changed@mu.com');await page.locator('#save-employees').click();await page.locator('#pbb-status').filter({hasText:'Saved successfully'}).waitFor();assert.equal(saved.employees[0].pbbId,'PBB-123');assert.equal(saved.employees[0].pbbExpiry,'2027-10-21');assert.equal(saved.employees[0].detach,false);assert.equal(saved.employees[0].attach,true);assert.equal(saved.employees[0].spotter,true);assert.equal(saved.employees[0].loginId,'changed@mu.com');assert.equal(saved.employees[0].email,'contact@gmail.com');
 for(const admin of ['tamsun@hm.com','tamsun10@gmail.com']){email=admin;await page.reload();await page.locator('#employee-panel').waitFor({state:'visible'});assert.equal(await page.locator('input[name=loginId]').getAttribute('readonly'),'');assert.equal(await page.locator('input[name=nickname]').getAttribute('readonly'),null);assert.equal(await page.locator('[data-remove]').isDisabled(),true);}
 email='ordinary@gmail.com';await page.reload();await page.locator('#pbb-status').filter({hasText:'Access restricted'}).waitFor();assert.equal(await page.locator('#employee-panel').isVisible(),false);assert.equal(await page.locator('#profile-admin-nav').isVisible(),false);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: Admin original login column order, separate contact/sign-in emails, normalized phone, save payload, removed copy and restricted access.');
})().catch(error=>{console.error(error);process.exit(1);});
