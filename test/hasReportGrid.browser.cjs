const assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new Database(':memory:'),user={uid:'supervisor',email:'supervisor@example.test',position:'Supervisor',station:'LAX',account:'MU',name:'Fictional Supervisor'};
 const app=express();app.use(express.json());
 const service=require('../has/server/hasReports').registerHasReports(app,{employees:{db},reportDb:db,profiles:{linked:()=>user},authenticate:async()=>user});
 app.get('/profile-api',(_,res)=>res.json({state:'ready',profile:user}));app.use(require('../has/static').withShared('public/public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://www.gstatic.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('**/__/firebase/init.js',route=>route.fulfill({contentType:'text/javascript',body:`window.MU_API_BASE=${JSON.stringify(base)};const user={...${JSON.stringify(user)},providerData:[],getIdToken:async()=>'fixture'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}})};`}));
  await page.clock.setFixedTime(new Date('2026-11-01T20:00:00Z'));await page.goto(base+'/has-report.html?kind=terrific');
  const cell=a=>page.locator('[data-cell-input="'+a+'"]'),tool=name=>page.getByRole('toolbar',{name:'Report editing'}).getByRole('button',{name,exact:true});
  const read=async()=>{const response=await fetch(base+'/has-report-api/terrific/2026-11');assert.equal(response.status,200);return response.json();};
  const saved=()=>page.waitForFunction(()=>document.querySelector('#report-status').textContent.startsWith('Saved by')&&!document.querySelector('#report-editor').inert);
  async function paste(a,text){await cell(a).focus();await cell(a).evaluate((el,text)=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},text);}
  await cell('A3').waitFor();await page.waitForFunction(()=>!document.querySelector('#report-editor').inert);
  assert.equal(await cell('E3').inputValue(),user.name);assert.equal(await cell('E3').getAttribute('maxlength'),'50');assert.equal(await cell('F3').inputValue(),'LAX/MU');assert.equal(await cell('G3').inputValue(),'Thank you! Keep up the great work!');
  assert.deepEqual(await cell('D3').locator('option').allTextContents(),['Choose reason','Compliment','Manager Direction']);assert.equal((await read()).revision,0,'viewing defaults must not write blank rows');
  await cell('A3').focus();for(const a of ['B3','C3','D3','E3','F3','G3','A4']){await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('data-cell-input'),a);}
  await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').getAttribute('data-cell-input'),'G3');
  await cell('B3').fill('Fictional Recipient');await cell('D3').selectOption('Compliment');await page.locator('h1').click();await saved();
  let state=await read();assert.equal(state.values.E3,user.name);assert.equal(state.values.G3,'Thank you! Keep up the great work!');assert.equal(state.values.E4,undefined,'untouched row defaults remain unsaved');
  await tool('Undo').click();assert.equal(await cell('D3').inputValue(),'');await saved();await tool('Redo').click();assert.equal(await cell('D3').inputValue(),'Compliment');await saved();
  await paste('A4','10\tRecipient four\tfictional@example.test\tManager Direction\tOther Issuer\tSFO/XX\tCustom message\n20\tRecipient five\tfictional5@example.test\tCompliment\tOther Issuer\tSFO/XX\tSecond message');
  assert.equal(Number(await cell('A4').inputValue()),10);assert.equal(await cell('B5').inputValue(),'Recipient five');await saved();
  await paste('A4','99\tChanged\tfictional@example.test\tUnsupported reason');assert.match(await page.locator('#report-status').textContent(),/Choose Compliment/);assert.equal(Number(await cell('A4').inputValue()),10);assert.equal(await cell('B4').inputValue(),'Recipient four');
  await paste('E4','x'.repeat(51)+'\nIssuer');assert.match(await page.locator('#report-status').textContent(),/50 characters/);assert.equal(await cell('E4').inputValue(),'Other Issuer');
  await tool('Undo').click();assert.equal(await cell('A4').inputValue(),'');assert.equal(await cell('B5').inputValue(),'');await saved();await tool('Redo').click();assert.equal(Number(await cell('A4').inputValue()),10);await saved();
  await cell('A6').fill('=A4+1');await cell('B6').fill('Fill recipient');await cell('A6').focus();await page.keyboard.press('Shift+ArrowRight');
  assert.equal(await page.locator('.report-grid-selected').count(),2);
  await page.locator('.report-fill-handle').scrollIntoViewIfNeeded();await cell('B8').scrollIntoViewIfNeeded();
  const corner=await page.locator('.report-fill-handle').boundingBox(),target=await cell('B8').boundingBox();assert(corner&&target);
  await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();
  assert.equal(await cell('B7').inputValue(),'Fill recipient');assert.equal(await cell('B8').inputValue(),'Fill recipient');await saved();state=await read();assert.equal(state.values.A7,'=A5+1');assert.equal(state.values.A8,'=A6+1');
  await tool('Undo').click();assert.equal(await cell('B7').inputValue(),'');assert.equal(await cell('B8').inputValue(),'');await saved();await tool('Redo').click();await saved();
  await cell('B6').focus();await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('data-cell-input'),'B7');await page.keyboard.press('Shift+Enter');assert.equal(await page.locator(':focus').getAttribute('data-cell-input'),'B6');
  await cell('A6').focus();const copied=await cell('A6').evaluate(el=>{const data=new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return {text:data.getData('text/plain'),rich:data.getData('application/x-has-report-cells')};});assert(copied.rich);
  await cell('A9').focus();await cell('A9').evaluate((el,copied)=>{const data=new DataTransfer();data.setData('text/plain',copied.text);data.setData('application/x-has-report-cells',copied.rich);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},copied);await saved();assert.equal((await read()).values.A9,'=A7+1');
  await cell('B9').focus();await page.keyboard.press('Control+d');assert.equal(await cell('B9').inputValue(),'Fill recipient');await saved();await page.keyboard.press('Shift+ArrowDown');await tool('Clear').click();assert.equal(await cell('B9').inputValue(),'');await saved();await tool('Undo').click();assert.equal(await cell('B9').inputValue(),'Fill recipient');await saved();
  await page.reload();await cell('B8').waitFor();assert.equal(await cell('B8').inputValue(),'Fill recipient');assert.equal(await cell('E4').inputValue(),'Other Issuer');assert.equal(await cell('D4').inputValue(),'Manager Direction');assert.equal(await tool('Undo').isDisabled(),true);
  await page.getByRole('button',{name:'Add Terrific Ten row',exact:true}).click();await cell('E16').waitFor();assert.equal(await cell('E16').inputValue(),user.name);assert.equal(await cell('G16').inputValue(),'Thank you! Keep up the great work!');await page.getByRole('button',{name:'Remove last Terrific Ten row',exact:true}).click();await cell('E16').waitFor({state:'detached'});assert.equal(await cell('B8').inputValue(),'Fill recipient');
  for(const values of [{D3:'invalid'},{E3:'x'.repeat(51)}]){state=await read();const response=await fetch(base+'/has-report-api/terrific/2026-11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision,layoutRevision:state.layoutRevision||0,values})});assert.equal(response.status,400);}
  await page.setViewportSize({width:390,height:844});await cell('C3').focus();await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('data-cell-input'),'D3');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('data-cell-input'),'E3');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.selectOption('#report-kind','expense');await cell('A4').waitFor();assert.equal(await tool('Undo').isDisabled(),true);assert.equal(await page.getByRole('toolbar',{name:'Report editing'}).isVisible(),true);
  assert.deepEqual(errors,[]);console.log('PASS: report Tab navigation, defaults, reason dropdown, limits, atomic block paste, drag fill with formulas, grouped undo/redo, persistence, server validation and mobile layout.');
 }finally{await browser.close();service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
