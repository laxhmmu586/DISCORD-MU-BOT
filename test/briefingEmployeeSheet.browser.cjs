const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const origin=process.env.BRIEFING_TEST_ORIGIN;if(!origin)throw Error('Start test/briefingEditing.browser.cjs --serve and set BRIEFING_TEST_ORIGIN.');
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.request.post(origin+'/test-reset');
  const initialReference=await (await page.request.get(origin+'/briefing-api/reference',{headers:{Authorization:'sup'}})).json();await page.request.post(origin+'/briefing-api/reference',{headers:{Authorization:'sup'},data:{revision:initialReference.revision,values:{},boxes:{}}});
  await page.clock.setFixedTime(new Date('2026-10-31T18:00:00Z'));
  await page.route('**/www.gstatic.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(origin)};const user=id=>({uid:id,email:id+'@example.test',providerData:[],getIdToken:async()=>id}),listeners=new Set();const auth={currentUser:user('agent'),onAuthStateChanged:fn=>{listeners.add(fn);setTimeout(()=>fn(auth.currentUser),0);return ()=>listeners.delete(fn);}};window.switchFixtureUser=id=>{auth.currentUser=id?user(id):null;for(const fn of listeners)fn(auth.currentUser);};window.firebase={apps:[{}],auth:()=>auth};`}));
  for(const [direction,flight,field,value] of [['departure','MU586','interline','9'],['departure','MU586','wchr','Long special information with multiple words and a final value 12345'],['arrival','MU583','wchrBusiness','2'],['arrival','MU583','um','1']]){const response=await page.request.post(origin+'/briefing-api',{headers:{Authorization:'sup'},data:{date:'2026-10-31',flight,direction,field,value,previous:''}});assert.equal(response.status(),200);}
  const assigned=await page.request.post(origin+'/briefing-api/assign',{headers:{Authorization:'sup'},data:{date:'2026-10-31',flight:'MU583',direction:'arrival',employeeId:'agent',fromField:null,toField:'arrivalLead',fromValue:null,toValue:''}});assert.equal(assigned.status(),200);
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/briefing');await page.locator('#arrival-content').waitFor({state:'visible'});await page.locator('#departure-tab').click();
  const sheet=page.locator('.employee-departure-sheet');await sheet.waitFor();
  assert.equal(await sheet.locator('tbody tr').count(),9);assert.equal(await sheet.locator('input,textarea,[contenteditable=true]').count(),0);
  assert.equal(await page.locator('#arrival-content>.briefing-workspace').isVisible(),false);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await sheet.waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');
   await sheet.getByRole('tab',{name:'Gate',exact:true}).click();assert.equal(await sheet.locator('#employee-gate-panel').isVisible(),true);assert.equal(await sheet.locator('#employee-counter-panel').isVisible(),false);
   await sheet.getByRole('tab',{name:'Counter',exact:true}).click();assert.equal(await sheet.locator('#employee-counter-panel').isVisible(),true);assert.equal(await sheet.locator('#employee-gate-panel').isVisible(),false);
   assert(await sheet.locator('.employee-special-grid>div').evaluateAll(nodes=>nodes.every(node=>{const box=node.getBoundingClientRect();return [...node.children].every(child=>{const r=child.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right&&r.bottom<=box.bottom;});})),'Special values stay inside expanding cards');
   fs.mkdirSync('.verification/briefing-employee-sheet',{recursive:true});await page.screenshot({path:'.verification/briefing-employee-sheet/employee-'+width+'.png',fullPage:true,animations:'disabled'});
  }
  const key='?date=2026-10-31&flight=MU586&direction=departure';
  const before=await page.request.get(origin+'/briefing-api/photo'+key,{headers:{Authorization:'agent'}});assert.equal(before.status(),200);const baseline=await before.body();
  const reference=await (await page.request.get(origin+'/briefing-api/reference',{headers:{Authorization:'sup'}})).json();
  const saved=await page.request.post(origin+'/briefing-api/reference',{headers:{Authorization:'sup'},data:{revision:reference.revision,values:{...reference.values,'membership.gold.economy.3':'Saved camera allowance'}}});assert.equal(saved.status(),200);
  await page.reload();await page.locator('#arrival-content').waitFor({state:'visible'});await page.locator('#departure-tab').click();await sheet.getByRole('cell',{name:'Saved camera allowance',exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');await page.locator('#briefing-photo').click();const download=await downloadPromise;await download.saveAs('.verification/briefing-employee-sheet/employee-photo.png');const bytes=fs.readFileSync('.verification/briefing-employee-sheet/employee-photo.png');assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),1400);assert(!bytes.equals(baseline));
  const current=await (await page.request.get(origin+'/briefing-api'+key,{headers:{Authorization:'sup'}})).json();
  await page.request.post(origin+'/briefing-api',{headers:{Authorization:'sup'},data:{date:current.date,flight:current.flight,direction:'departure',field:'details',previous:current.fields.details,value:'LIVE EMPLOYEE DETAILS'}});
  await sheet.locator('.employee-sheet-details').filter({hasText:'LIVE EMPLOYEE DETAILS'}).waitFor();
  await sheet.getByRole('tab',{name:'Gate',exact:true}).click();
  await page.request.post(origin+'/briefing-api',{headers:{Authorization:'sup'},data:{date:current.date,flight:current.flight,direction:'departure',field:'details',previous:'LIVE EMPLOYEE DETAILS',value:'UPDATED EMPLOYEE DETAILS'}});
  await sheet.locator('.employee-sheet-details').filter({hasText:'UPDATED EMPLOYEE DETAILS'}).waitFor();assert.equal(await sheet.getByRole('tab',{name:'Gate',exact:true}).getAttribute('aria-selected'),'true');
  await page.locator('#arrival-tab').click();await page.locator('.employee-arrival-sheet').waitFor();
  assert((await page.locator('.employee-arrival-team').textContent()).includes('Test Agent'));
  assert.equal(await page.locator('#briefing-employee-sheet #panel-time').count(),1);assert.equal(await page.locator('#panel-time').count(),1);
  const block=page.locator('[data-field=blockTime]');assert.equal(await block.isEditable(),true);await block.fill('0900');await page.locator('[data-field=notes]').fill('Arrival saved notes');await page.locator('#briefing-heading-date').click();
  await page.waitForFunction(()=>document.querySelector('#briefing-status').textContent==='All changes saved.');
  const arrivalState=await (await page.request.get(origin+'/briefing-api?date=2026-10-31&flight=MU583&direction=arrival',{headers:{Authorization:'agent'}})).json();assert.equal(arrivalState.fields.blockTime,'0900');assert.equal(arrivalState.fields.notes,'Arrival saved notes');
  await block.focus();await block.evaluate(el=>el.setSelectionRange(2,2));
  await page.request.post(origin+'/briefing-api',{headers:{Authorization:'sup'},data:{date:'2026-10-31',flight:'MU583',direction:'arrival',field:'details',previous:arrivalState.fields.details,value:'LIVE ARRIVAL DETAILS'}});
  await page.locator('.employee-arrival-sheet .employee-sheet-details').filter({hasText:'LIVE ARRIVAL DETAILS'}).waitFor();assert.equal(await block.evaluate(el=>document.activeElement===el&&el.selectionStart===2),true);
  await page.screenshot({path:'.verification/briefing-employee-sheet/arrival-390.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>!document.querySelector('.briefing-shell').classList.contains('employee-sheet-view'));assert.equal(await page.locator('.briefing-workspace #panel-time').count(),1);assert.equal(await block.inputValue(),'0900');
  await page.setViewportSize({width:390,height:1000});await page.locator('.employee-arrival-sheet').waitFor();assert.equal(await page.locator('#briefing-employee-sheet #panel-time').count(),1);assert.equal(await page.locator('[data-field=notes]').inputValue(),'Arrival saved notes');
  await page.evaluate(()=>window.switchFixtureUser('sup'));await page.waitForFunction(()=>!document.querySelector('.briefing-shell').classList.contains('employee-briefing'));
  await page.locator('#departure-tab').click();await page.waitForFunction(()=>document.querySelector('#briefing-flight').value==='MU586'&&!document.querySelector('#arrival-content').hidden);assert.equal(await sheet.count(),0);
  await page.locator('[data-reference=membership]').click();await page.locator('[data-tier=gold]').click();await page.locator('[data-cabin=economy]').click();assert.equal(await page.locator('[data-reference-value="membership.gold.economy.3"]').textContent(),'Saved camera allowance');
  assert.deepEqual(errors,[]);console.log('PASS: employee Arrival mobile sheet, live time/notes editing, assignment tabs and persistence, expanding specials, full Membership, camera PNG, live updates and manager editor.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
