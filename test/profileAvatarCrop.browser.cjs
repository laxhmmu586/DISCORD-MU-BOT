const assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3'),sharp=require('sharp'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),app=express();app.use(express.json({limit:'3mb'}));
 const employees={...require('../has/server/employees').createEmployeeStore(db,{seed:[{id:'one',name:'TEST EMPLOYEE',nickname:'Test',eid:'12345',position:'Agent',station:'LAX',account:'CI',loginId:'test@example.test',email:'test@example.test',phone:'6265550100',attach:false,detach:false,spotter:false}]}),db};
 const user={uid:'one',email:'test@example.test',provider:'password'},profiles=require('../has/server/employeeProfiles').registerProfiles(app,{employees,authenticate:async()=>user});profiles.status(user);
 let postedBytes=0;
 app.use(require('../has/static').withShared('public/public'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 const buffer=await sharp(require('node:crypto').randomBytes(1600*1400*3),{raw:{width:1600,height:1400,channels:3}}).png().toBuffer();assert(buffer.length>2*1024*1024);
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url()===base+'/profile-api'&&req.method()==='POST')postedBytes=Buffer.byteLength(req.postData());});
  await page.route('https://www.gstatic.com/**',r=>r.fulfill({body:''}));await page.route('**/__/firebase/init.js',r=>r.fulfill({body:''}));await page.addInitScript(({base,user})=>{window.MU_API_BASE=base;const u={...user,providerData:[],getIdToken:async()=>user.uid};window.firebase={apps:[{}],auth:()=>({currentUser:u,onAuthStateChanged:fn=>{setTimeout(()=>fn(u),0);return()=>{};}})};},{base,user});
  await page.goto(base+'/profile.html');await page.locator('#profile-content').waitFor({state:'visible'});
  await page.locator('#avatar-file').setInputFiles({name:'large-photo.png',mimeType:'image/png',buffer});await page.getByRole('dialog',{name:'Crop profile photo'}).waitFor();
  const before=await page.locator('.avatar-crop-frame canvas').evaluate(c=>c.toDataURL());await page.locator('[aria-label="Photo zoom"]').fill('2');await page.locator('.avatar-crop-frame canvas').press('ArrowDown');assert.notEqual(await page.locator('.avatar-crop-frame canvas').evaluate(c=>c.toDataURL()),before);
  fs.mkdirSync('output/avatar-crop',{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const dialog=await page.locator('.avatar-crop-dialog').boundingBox();assert(dialog.x>=0&&dialog.x+dialog.width<=width);await page.screenshot({path:'output/avatar-crop/crop-'+width+'.png'});}
  await page.getByRole('button',{name:'Use photo',exact:true}).click();await page.locator('#profile-edit-dialog').waitFor({state:'visible'});await page.locator('#save-profile').click();await page.locator('#profile-status').filter({hasText:'Profile saved'}).waitFor();
  assert(postedBytes<300000,'Photo is compressed before upload');const avatar=profiles.status(user).profile.avatar,meta=await sharp(Buffer.from(avatar.split(',')[1],'base64')).metadata();assert.equal(meta.width,256);assert.equal(meta.height,256);
  await page.reload();await page.locator('#profile-avatar').waitFor({state:'visible'});assert.equal(await page.locator('#profile-avatar').getAttribute('src'),avatar);
  await page.locator('#edit-profile').click();await page.locator('#nickname').fill('Unsaved nickname');const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#choose-avatar').click()]);await chooser.setFiles({name:'cancel.png',mimeType:'image/png',buffer});await page.getByRole('dialog',{name:'Crop profile photo'}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('#nickname').inputValue(),'Unsaved nickname');assert.equal(await page.locator('#profile-avatar').getAttribute('src'),avatar);
  // A failed save keeps both the edited fields and cropped photo available for retry.
  await page.route('**/profile-api',r=>r.request().method()==='POST'?r.abort():r.continue());await page.locator('#save-profile').click();await page.locator('#profile-edit-status').filter({hasText:'Your changes are kept'}).waitFor();assert.equal(await page.locator('#nickname').inputValue(),'Unsaved nickname');assert.equal(await page.locator('#profile-edit-dialog').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('PASS: >2MB photo opens crop dialog; zoom/keyboard reposition; 1440/390px; compressed upload persists as square avatar; cancel preserves edits; network failure retains unsaved changes.');
 }finally{await browser.close();server.closeAllConnections();server.close();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
