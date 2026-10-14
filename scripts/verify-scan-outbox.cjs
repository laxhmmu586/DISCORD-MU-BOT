// Local browser fixtures only; this script never writes operational records.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public/public');
const {operationalDate}=require('../flightContext');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}}), requests=[], pending=[];
    let mode='hold',failOnce=true;
    await page.addInitScript(flight=>sessionStorage.setItem('mufc-online-flight',JSON.stringify(flight)),{flightNo:'MU586',flightDate:operationalDate()});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      if(url.pathname==='/cbs-scan' && route.request().method()==='POST') {
        const body=route.request().postDataJSON(); requests.push(body);
        assert.equal(url.searchParams.get('flightNo'),'MU586'); assert.equal(url.searchParams.get('flightDate'),operationalDate());
        if(mode==='offline' && failOnce){failOnce=false;return route.abort('internetdisconnected');}
        const reply=()=>json({ok:true,bn:body.rawScan.slice(-3),rowNumber:requests.length,seat:'10A',nbrdRows:[]});
        if(mode==='hold' || mode==='offline') {pending.push(reply);return;}
        return reply();
      }
      if(url.pathname.startsWith('/cbs-scan/')) return json(url.pathname.endsWith('live-state')?{live:false}:{ok:true,rows:[]});
      if(url.hostname==='unpkg.com') return route.fulfill({contentType:'application/javascript',body:`window.ZXingBrowser={BrowserPDF417Reader:class{async decodeFromConstraints(c,v,callback){window.emitScan=text=>callback({getText:()=>text});return{stop(){window.emitScan=null}}}}};`});
      if(url.pathname.includes('firebase') || url.pathname==='/__/firebase/init.js') return route.fulfill({contentType:'application/javascript',body:`window.firebase={apps:[{}],auth:()=>({onAuthStateChanged:fn=>fn({}),currentUser:{}})};`});
      const file=path.join(root,url.pathname);
      return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
    });
    await page.goto('https://scanner.test/scan.html');
    await page.click('#start'); await page.waitForFunction(()=>typeof emitScan==='function');
    await page.evaluate(()=>{emitScan('MU0586 010A001');emitScan('MU0586 010A002');emitScan('MU0586 010A003');emitScan('MU0586 010A002');});
    await page.waitForFunction(()=>scanOutbox.pending===3); assert.equal(requests.length,1);
    mode='success'; await pending.shift()();
    await page.waitForFunction(()=>scanOutbox.pending===2); await page.click('#dialog-ok');
    await page.waitForFunction(()=>scanOutbox.pending===1);
    await page.evaluate(()=>emitScan('MU0586 010A004'));
    await page.waitForFunction(()=>scanOutbox.pending===2);
    await page.click('#dialog-ok'); await page.waitForFunction(()=>scanOutbox.pending===1);
    await page.click('#dialog-ok'); await page.waitForFunction(()=>scanOutbox.pending===0);
    assert.equal(requests.length,4); assert.equal(new Set(requests.map(item=>item.requestId)).size,4);
    await page.click('#dialog-ok'); mode='offline';
    await page.evaluate(()=>emitScan('MU0586 010A005'));
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('保存未确认'));
    const lost=requests.at(-1).requestId;
    assert.equal(await page.evaluate(()=>scanOutbox.pending),1);
    // Reload while offline; recovered submission must keep the original ID.
    await page.evaluate(()=>{nbrdVerified=false;});
    mode='success'; await page.reload();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='Saved BN 005');
    assert.equal(await page.evaluate(()=>scanOutbox.pending),0);
    assert.equal(requests.at(-1).requestId,lost);
    assert.equal(await page.locator('#status').textContent(),'Saved BN 005');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    console.log('Mobile browser: rapid scans, dialogs, frame deduplication, offline retention, reload recovery, same request ID and flight/date scoping passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
