const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
const server = read('index.js'), drive = read('googleDrive.js');
const func = (source, name, indent = '') => {
  const re = new RegExp(`^${indent}(?:async )?function ${name}\\([^\\n]*\\) \\{\\n[\\s\\S]*?^${indent}\\}`, 'm');
  const match = source.match(re); assert.ok(match, name); return match[0];
};

test('service pages load directly without the dashboard or a flight session', () => {
  for (const page of ['report','baggage']) {
    const html = read(`public/public/${page}.html`);
    assert.match(html, new RegExp(`src="/${page}\\.js"`));
    assert.doesNotMatch(html, /index\.html|flight-session\.js|iframe/);
  }
  const flights = read('public/public/flights.html');
  assert.match(flights, /href="\/report.html"/);
  assert.match(flights, /href="\/baggage.html"/);
});

test('baggage direction defaults, options, and collected batch flight are preserved', () => {
  const js = read('public/public/baggage.js');
  const ctx = vm.createContext({escapeHtml:String, ymdFromDate:()=> '2026-10-08'});
  for (const name of ['normalizeTestBagTag','renderTestBagEntry','formValue','collectCreateEntries']) vm.runInContext(func(js,name,'      '),ctx);
  for (const [direction,selected,alternate] of [['inbound','MU583','MU577'],['outbound','MU578','MU586']]) {
    assert.match(ctx.renderTestBagEntry(direction,{},0),new RegExp(`<option value="${selected}" selected>`));
    assert.match(ctx.renderTestBagEntry(direction,{flight:alternate},0),new RegExp(`<option value="${alternate}" selected>`));
    const entry={querySelector:selector=>({value:selector.includes('flight')?alternate:'2026-10-08'}),querySelectorAll:()=>[{value:'MU123456'},{value:'DL123456'}]};
    const form={dataset:{createMode:direction},querySelector:()=>entry,querySelectorAll:()=>[entry]};
    const rows=ctx.collectCreateEntries(form);
    assert.ok(rows.every(row=>row.flight===alternate));
    if(direction==='outbound')assert.equal(rows.length,2);
  }
});

test('240 API validates flight and passes the same value to storage and Discord', async () => {
  let handler;const saved=[],sent=[];
  const source=server.slice(server.indexOf("app.post('/transit-240'"),server.indexOf("\n});",server.indexOf("app.post('/transit-240'"))+4);
  vm.runInNewContext(source,{app:{post:(_,fn)=>handler=fn},appendTransit240Record:async r=>{saved.push(r);return{}},sendTransit240ToDiscord:async r=>{sent.push(r);return{}},console,Date});
  for(const flightNo of ['MU586','MU578','INVALID']){
    let status=200,result;
    await handler({body:{flightNo,passengerName:'TEST',seatNumber:'10A',bnNumber:'001',nationalityCode:'CAN',passportExpiry:'2032-01-23',itinerary:['LAX','PVG','HKG']}},{status(n){status=n;return this},json(v){result=v;return this}});
    assert.equal(status,flightNo==='INVALID'?400:200);
    if(status===200){assert.equal(saved.at(-1).flightNo,flightNo);assert.equal(sent.at(-1).flightNo,flightNo);assert.equal(result.ok,true);}
  }
  assert.equal(saved.length,2);
});

test('240 Discord embed includes the selected flight without sending real messages',async()=>{
  let payload;
  const ctx=vm.createContext({client:{channels:{fetch:async()=>({send:async p=>{payload=p}})}},TRANSIT_240_DISCORD_CHANNEL_ID:'fixture',buildTransit240DiscordFiles:()=>[],formatTransit240Date:v=>v||'—'});
  vm.runInContext(func(server,'sendTransit240ToDiscord'),ctx);
  await ctx.sendTransit240ToDiscord({flightNo:'MU578',bnNumber:'102',passengerName:'TEST',itinerary:['LAX','PVG','HKG']});
  assert.equal(payload.embeds[0].fields.find(f=>f.name==='Flight').value,'MU578');
  assert.equal(payload.embeds[0].fields.find(f=>f.name==='BN').value,'102');
});

test('240 appends flight after existing sheet columns',async()=>{
  let call;
  const ctx=vm.createContext({getTransit240SheetTitle:async()=>'240',ensureTransit240Headers:async()=>{},TRANSIT_240_SHEET_ID:'fixture',escapeSheetTitle:s=>s,sheets:{spreadsheets:{values:{append:async p=>{call=p}}}}});
  vm.runInContext(func(drive,'appendTransit240Record'),ctx);
  await ctx.appendTransit240Record({submittedAt:'time',flightNo:'MU578',passengerName:'TEST',seatNumber:'10A',bnNumber:'001',itinerary:['LAX','PVG','HKG']});
  assert.equal(call.range,'240!A:H');assert.equal(call.requestBody.values[0][1],'TEST');assert.equal(call.requestBody.values[0][6],'LAX → PVG → HKG');assert.equal(call.requestBody.values[0][7],'MU578');
});

test('Misconnection storage reads the new flight column and leaves historical flights unknown',async()=>{
  let appended;
  const values={get:async()=>({data:{values:[[],['time','date','TEST','10A','passport','phone','','en','test@example.com','MU578'],['old','date','OLDER']]}}),update:async()=>{},append:async p=>{appended=p}};
  const ctx=vm.createContext({resolveSheetTitleByGid:async()=>'Cases',CONTACT_FORM_SHEET_ID:'fixture',CONTACT_FORM_SHEET_GID:1,escapeSheetTitle:s=>s,sheets:{spreadsheets:{values}}});
  vm.runInContext(func(drive,'appendContactFormSubmission')+'\n'+func(drive,'getContactFormSubmissions'),ctx);
  await ctx.appendContactFormSubmission({flightNo:'MU578',name:'TEST'});
  assert.equal(appended.requestBody.values[0][9],'MU578');
  const rows=await ctx.getContactFormSubmissions();assert.equal(rows[0].flightNo,'');assert.equal(rows[1].flightNo,'MU578');
});

test('scan parsing and filling are unchanged from the existing passenger-only implementation',()=>{
  const html=read('public/public/240.html');
  const ctx=vm.createContext({passengerName:{value:''},seatNumber:{value:''},bnNumber:{value:''},setStatus(){}});
  const fill=html.match(/function fillScan\(d\)\{[^\n]+/)[0];vm.runInContext(fill,ctx);
  ctx.fillScan({passengerName:'TEST PAX',seatNumber:'10A',bnNumber:'001',flightNo:'MU586'});
  assert.equal(ctx.passengerName.value,'TEST PAX');assert.equal(ctx.seatNumber.value,'10A');assert.equal(ctx.bnNumber.value,'001');
  assert.doesNotMatch(fill,/flightNo/);
});
