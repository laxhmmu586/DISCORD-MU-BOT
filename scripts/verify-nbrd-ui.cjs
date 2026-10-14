const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {operationalDate}=require('../flightContext');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 context.setDefaultTimeout(15000);
 const rows=[{rowNumber:2,nbrdBn:'014',nbrdDetail:'VISA',nbrdResolved:false},{rowNumber:3,nbrdBn:'025',nbrdDetail:'SEAT CHANGE',nbrdResolved:true}];
 let scans=0;
 const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),request=route.request();
  if(url.hostname==='api.mufcapp.net'){
   let data={ok:true};let status=200;const body=request.postDataJSON();
   if(url.pathname==='/cbs-scan/records' || (url.pathname==='/cbs-scan/nbrd-bns' && request.method()==='GET'))data={rows};
   else if(url.pathname==='/cbs-scan/nbrd-bns/resolve'){rows.find(r=>r.nbrdBn===body.bn).nbrdResolved=body.resolved !== false;}
   else if(url.pathname==='/cbs-scan/nbrd-bns'){const bn=String(body.entries[0].bn).padStart(3,'0');const existing=rows.find(row=>row.nbrdBn===bn);if(existing)existing.nbrdDetail=body.entries[0].detail;else rows.push({rowNumber:4,nbrdBn:bn,nbrdDetail:body.entries[0].detail,nbrdResolved:false});}
   else if(url.pathname==='/cbs-scan'){
    if(body.confirmationToken){rows[0].nbrdResolved=true;rows[0].bn='014';rows[0].seat='10A';rows[0].flight='MU586';data={ok:true,rowNumber:2,bn:'014',seat:'10A',flight:'MU586',nbrdRows:rows.map(row=>({...row}))};}
    else {scans++;status=409;data={code:'NBRD_MESSAGE',bn:'014',detail:'VISA',canBoard:scans>1,confirmationToken:'fixture-'+scans};}
   }
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  }
  if(url.hostname!=='www.mufcapp.net')return route.fulfill({contentType:'text/javascript',body:''});
  if(url.pathname==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({currentUser:{},onAuthStateChanged:fn=>setTimeout(()=>fn({}),0)})};`});
  const file=path.join(__dirname,'../public/public',url.pathname);
  if(!fs.existsSync(file))return route.fulfill({status:404,body:'missing'});
  let body=fs.readFileSync(file,'utf8');
  if(url.pathname.endsWith('.html'))body=body.replace('<head>',`<head><script>sessionStorage.setItem('mufc-online-flight',JSON.stringify({flightNo:'MU586',flightDate:'${operationalDate()}'}));</script>`);
  return route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://www.mufcapp.net/scan.html');
 await page.locator('.nbrd-modal[open]').waitFor();
 assert.equal(await page.locator('.nbrd-modal h2').textContent(),'Check Total Nbrd');
 assert.equal(await page.locator('.nbrd-modal').textContent().then(text=>text.includes('Review these pending BNs')),false);
 assert.equal(await page.locator('.nbrd-total').count(),0);
 assert.equal(await page.locator('.nbrd-preview .nbrd-bubble').count(),1);
 assert.equal(await page.locator('.nbrd-preview .nbrd-bubble').textContent(),'014');
 assert.equal(await page.locator('#nbrd-count').count(),0);
 await page.screenshot({path:'.verification/nbrd-entry-mobile.png'});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 assert.equal(await page.locator('#result').count(),0);
 assert.ok(await page.locator('.camera-wrap').evaluate(e=>e.getBoundingClientRect().height)<300);
 await page.screenshot({path:'.verification/nbrd-scan-mobile.png',fullPage:true});
 await page.locator('.nbrd-bubble').nth(1).click();
 await page.locator('.nbrd-back').click();assert.equal(rows[1].nbrdResolved,true);
 await page.locator('.nbrd-bubble').nth(1).click();await page.locator('.nbrd-no').click();assert.equal(rows[1].nbrdResolved,false);
 await page.locator('.nbrd-bubble').nth(1).click();await page.locator('.nbrd-yes').click();
 await page.waitForFunction(()=>!document.querySelector('.nbrd-modal').open);
 assert.equal(await page.locator('.nbrd-bubble.is-resolved').count(),1);
 await page.evaluate(()=>saveScan('fixture-pass'));
 assert.equal(await page.locator('#dialog-message').textContent(),'NBRD message\nVISA');
 await page.locator('#dialog-ok').click();
 await page.evaluate(()=>{window.pendingScan=saveScan('fixture-pass');});
 await page.getByRole('button',{name:'OK to Board',exact:true}).waitFor();
 assert.equal(await page.locator('.nbrd-modal .nbrd-warning-icon').count(),1);
 assert.equal(await page.locator('.nbrd-modal h2').evaluate(e=>getComputedStyle(e).textAlign),'center');
 await page.screenshot({path:'.verification/nbrd-board-warning-mobile.png'});
 await page.getByRole('button',{name:'NOT OK',exact:true}).click();await page.evaluate(()=>window.pendingScan);
 assert.equal(rows[0].nbrdResolved,false);
 await page.evaluate(()=>{window.pendingScan=saveScan('fixture-pass');});
 rows.push({rowNumber:5,nbrdBn:'004',nbrdDetail:'NBRD',nbrdResolved:false});
 await page.getByRole('button',{name:'OK to Board',exact:true}).click();await page.evaluate(()=>window.pendingScan);
 assert.equal(await page.locator('.nbrd-bubble').count(),3);
 assert.equal(await page.getByRole('button',{name:'BN 004, pending',exact:true}).count(),1);
 rows.pop();
 assert.equal(rows[0].nbrdResolved,true);assert.equal(rows[0].bn,'014');
 await page.locator('#dialog-ok').click();
 assert.equal(await page.locator('#nbrd-message option').count(),5);
 assert.equal(await page.locator('#nbrd-custom-message').count(),0);
 await page.locator('#nbrd-message').selectOption('RE-SWIPE');await page.locator('#nbrd-bn').fill('33');
 await page.locator('#nbrd-form button').click();await page.waitForFunction(()=>document.querySelectorAll('.nbrd-bubble').length===3);
 assert.equal(rows[2].nbrdDetail,'RE-SWIPE');
 await page.goto('https://www.mufcapp.net/m-board.html');await page.waitForFunction(()=>document.querySelectorAll('.nbrd-bubble').length===3);
 assert.equal(await page.locator('.nbrd-bubble.is-resolved').count(),2);
 assert.equal(await page.locator('.nbrd-resolved-badge').count(),0);
 assert.equal(await page.locator('#nbrd-wrap').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
 assert.equal(await page.locator('.nbrd-bubble.is-resolved').first().evaluate(e=>getComputedStyle(e).getPropertyValue('--tile-base').trim()),'#087443');
 await page.screenshot({path:'.verification/nbrd-board-mobile.png',fullPage:true});
 await page.locator('.nbrd-bubble').nth(2).click();await page.locator('.nbrd-yes').click();await page.waitForFunction(()=>!document.querySelector('.nbrd-modal').open);
 assert.equal(rows[2].nbrdResolved,true);
 await page.goto('https://www.mufcapp.net/scan.html');
 await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 assert.equal(await page.locator('.nbrd-modal[open]').count(),0);
 await page.locator('.nbrd-bubble').first().click();await page.locator('.nbrd-no').click();
 // Wait for the pending-state save and dialog close before asking the scanner
 // to verify again; otherwise this test can inspect the previous closed modal.
 await page.waitForFunction(()=>!document.querySelector('.nbrd-modal').open);
 assert.equal(rows[0].nbrdResolved,false);
 await page.evaluate(()=>{window.pendingVerification=verifyNbrd();});
 await page.locator('.nbrd-modal .nbrd-no').click();
 assert.equal(await page.locator('#start').isDisabled(),true);
 await page.locator('#nbrd-bn').fill('14');await page.locator('#nbrd-message').selectOption('INV UPGRADE');
 await page.locator('#nbrd-form button').click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 assert.equal(rows.length,3);assert.equal(rows[0].nbrdDetail,'INV UPGRADE');assert.equal(rows[0].nbrdResolved,false);
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile count gate, compact camera, detail actions, two-scan Board/NOT OK, preset reasons, red-X reopening, resolved tiles and shared M-board state');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
