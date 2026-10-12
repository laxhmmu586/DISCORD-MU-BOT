const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { operationalDate } = require('../flightContext');

(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  const context = await browser.newContext({ viewport:{width:390,height:844} });
  const errors = [];
  const requests = [];
  const date = operationalDate();
  const rows = [
    {rowNumber:2,bn:'014',seat:'35J',flight:'MU586',entered:true,nbrdBn:'154',nbrdDetail:'VISA',nbrdResolved:false},
    {rowNumber:3,bn:'015',seat:'22A',flight:'MU586',entered:false,nbrdBn:'001',nbrdDetail:'NBRD',nbrdResolved:true},
    {rowNumber:4,infantBn:'021',infantSeat:'INF',infantFlight:'MU586',nbrdBn:'004',nbrdDetail:'RE-SWIPE',nbrdResolved:false}
  ];
  await context.addInitScript(({date}) => {
    sessionStorage.setItem('mufc-online-flight',JSON.stringify({flightNo:'MU586',flightDate:date}));
    window.EventSource = class {
      constructor(url) {this.url=url;this.handlers={};window.fixtureStream=this;}
      addEventListener(name,fn) {this.handlers[name]=fn;}
      close() {}
    };
  },{date});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'api.mufcapp.net') {
      requests.push({path:url.pathname,method:route.request().method()});
      let data = {ok:true};
      if (url.pathname === '/cbs-scan/live-state') data={live:true,revision:1,nbrdFresh:true,nbrd:rows.map(row=>({bn:row.nbrdBn,detail:row.nbrdDetail})),rows};
      else if (url.pathname === '/cbs-scan/records' || url.pathname === '/cbs-scan/nbrd-bns') data={ok:true,rows};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    }
    if (url.pathname === '/__/firebase/init.js') return route.fulfill({contentType:'text/javascript',body:"window.firebase={apps:[{}],auth:()=>({currentUser:{},onAuthStateChanged:fn=>setTimeout(()=>fn({}),0)})};"});
    if (url.hostname !== 'www.mufcapp.net') return route.fulfill({contentType:'text/javascript',body:''});
    const file = path.resolve(__dirname,'../public/public','.'+url.pathname);
    if (!fs.existsSync(file)) return route.fulfill({status:404,body:'Not found'});
    return route.fulfill({path:file});
  });
  const page = await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  fs.mkdirSync(path.resolve(__dirname,'../.verification/aviation-glass'),{recursive:true});
  const pages = ['scan.html','m-board.html','240.html','cbs-form.html','contact-form.html','pir-form.html?type=AHL','pir-form.html?type=DPR'];
  let layouts=0;
  for (const name of pages) {
    await page.goto('https://www.mufcapp.net/'+name);
    await page.locator('body.aviation-page').waitFor();
    if (name === 'scan.html') {
      const entry = page.locator('.nbrd-modal[open]');
      await entry.waitFor();
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.waitForFunction(()=>Boolean(window.fixtureStream));
      assert.equal(await page.locator('#boarding-live-indicator').isVisible(),false,'No live dot before SSE opens');
      await page.evaluate(()=>window.fixtureStream.onopen());
      assert.equal(await page.locator('#boarding-live-indicator').isVisible(),true);
      assert.equal(await page.locator('#nbrd-form').innerText().then(text=>text.includes('Reconnecting')),false);
      assert.equal(await page.locator('.boarding-heading h1').innerText(),'Boarding');
      assert.equal(await page.locator('[data-selected-flight]').innerText(),`MU586 · ${date}`);
      assert.equal(await page.locator('#result,.result').count(),0);
      await page.evaluate(()=>window.fixtureStream.onerror());
      assert.equal(await page.locator('#boarding-live-indicator').isVisible(),false,'Disconnect hides live dot');
      await page.evaluate(()=>window.fixtureStream.onopen());
      assert.equal(await page.locator('#boarding-live-indicator').isVisible(),true);
      await page.evaluate(()=>{window.ZXingBrowser={BrowserPDF417Reader:class{async decodeFromConstraints(){return{stop(){}}}}};});
      await page.locator('#start').click();
      assert.equal(await page.locator('#status').innerText(),'Scanning');
      await page.locator('#stop').click();
    }
    if (name === 'm-board.html') {
      await page.locator('#table-wrap tbody tr').first().waitFor();
      assert.deepEqual(await page.locator('#table-wrap th').allTextContents(),['BN','Seat']);
      assert.deepEqual(await page.locator('#infant-wrap th').allTextContents(),['BN','Seat']);
      assert.equal(await page.locator('#table-wrap .is-entered').count(),1);
      await page.locator('#table-wrap tbody tr').nth(1).click();
      await page.waitForFunction(()=>document.querySelectorAll('#table-wrap .is-entered').length===2);
      assert.ok(requests.some(request=>request.path==='/cbs-scan/records/entered'));
    }
    if (name === '240.html') {
      assert.deepEqual(await page.locator('#itinerary .airport-code').allTextContents(),['LAX','PVG']);
      assert.equal(await page.locator('#itinerary .stop-date').count(),1);
      await page.locator('#addStop').click();
      assert.equal(await page.locator('#itinerary .stop-date').count(),2);
      await page.locator('#itinerary .stop-code').last().fill('hkg');
      assert.equal(await page.locator('#itinerary .stop-code').last().inputValue(),'HKG');
      await page.locator('#itinerary button:not([hidden])').last().click();
      assert.equal(await page.locator('#itinerary .stop-date').count(),1);
      await page.evaluate(()=>{window.ZXingBrowser={BrowserPDF417Reader:class{async decodeFromConstraints(){return{stop(){}}}}};});
      await page.locator('#scanBoardingPass').click();
      assert.equal(await page.locator('#status').innerText(),'Scanning');
      await page.locator('#stop').click();
    }
    if (name === 'cbs-form.html') {
      for (const choice of ['.choice--delayed','.choice--damaged']) {
        const geometry=await page.locator(choice).evaluate(el=>{const zh=el.querySelector('strong .zh').getBoundingClientRect(),en=el.querySelector('strong .en').getBoundingClientRect();return{zhBottom:zh.bottom,enTop:en.top};});
        assert.ok(geometry.enTop>=geometry.zhBottom,'English is a second line');
      }
      const fills=await page.locator('.choice').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundImage));
      assert.notEqual(fills[0],fills[1]);
      assert.equal(await page.locator('.choice--delayed').getAttribute('href'),'pir-form.html?type=AHL');
      assert.equal(await page.locator('.choice--damaged').getAttribute('href'),'pir-form.html?type=DPR');
      await page.locator('#language-toggle').click();
      assert.equal(await page.locator('html').getAttribute('lang'),'en');
    }
    if (name === 'contact-form.html') {
      await page.locator('#language-toggle').click();
      assert.equal(await page.locator('html').getAttribute('lang'),'en');
      await page.locator('input[name=name]').fill('TEST PASSENGER');
      await page.locator('[data-attachment-input]').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture')});
      await page.locator('.attachment-remove').waitFor();
      await page.locator('.attachment-remove').click();
      assert.equal(await page.locator('.attachment-remove').count(),0);
    }
    if (name.startsWith('pir-form.html')) {
      const type=new URL('https://www.mufcapp.net/'+name).searchParams.get('type');
      assert.equal(await page.locator('#case-type').inputValue(),type);
      assert.equal(await page.locator('#delivery-preference').isVisible(),type==='AHL');
      if (type==='AHL') {
        await page.locator('#delivery-preference').selectOption('temporary');
        assert.equal(await page.locator('#temporary-address-field').isVisible(),true);
        await page.locator('#delivery-preference').selectOption('pickup');
        assert.equal(await page.locator('#temporary-address-field').isVisible(),false);
      }
      await page.locator('#add-another-bag').click();
      assert.equal(await page.locator('.bag-selector').count(),2);
      await page.locator('.remove-bag').last().click();
      assert.equal(await page.locator('.bag-selector').count(),1);
      await page.locator('#language-toggle').click();
      assert.equal(await page.locator('html').getAttribute('lang'),'zh');
      await page.locator('#signature-pad').scrollIntoViewIfNeeded();
      const signature=await page.locator('#signature-pad').boundingBox();
      await page.mouse.move(signature.x+20,signature.y+30);await page.mouse.down();
      await page.mouse.move(signature.x+90,signature.y+70);await page.mouse.up();
      assert.equal(await page.evaluate(()=>signatureDirty),true);
      await page.locator('#clear-signature').click();
      assert.equal(await page.evaluate(()=>signatureDirty),false);
    }
    for (const width of [320,390,430,768,1172]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.locator('header .brand,header .mark,header strong').count(),0,'No top-left brand');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}/${width}: horizontal overflow`);
      layouts++;
      if (name.startsWith('pir-form.html')) {
        await page.locator('[data-picker="color"] [data-picker-trigger]').click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}/${width}: picker overflow`);
        await page.locator('[data-picker="color"] [data-option="BK"]').click();
        assert.equal(await page.locator('[data-bag-color]').inputValue(),'BK');
      }
      if (width===390) await page.screenshot({path:path.resolve(__dirname,'../.verification/aviation-glass',name.replace(/[?=]/g,'-')+'.png'),fullPage:true});
    }
  }
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log(JSON.stringify({layouts,errors,checks:'SSE indicator, flight/date, scan controls, entered rows, From/TO editing, bilingual cards and uploads'}));
})().catch(error=>{console.error(error);process.exit(1);});
