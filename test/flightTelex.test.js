const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');

function fixture(storage = new Map()) {
  const {window,document} = parseHTML('<section id="flight-telex" hidden><div data-telex-items></div><p data-telex-status></p></section>');
  const requests = [];
  const checks = new Set();
  window.sessionStorage = {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  vm.runInNewContext(fs.readFileSync('public/public/flight-telex.js','utf8'), {
    window,document,URLSearchParams,Intl,Date,
    peopleApi:async (url, body) => {requests.push({url,body}); if(body){if(body.sent)checks.add(body.service);else checks.delete(body.service);}return {checked:[...checks]};}
  });
  return {window,document,requests,render(patch = {}) {
    window.renderFlightTelex({flightNo:'MU586',flightDate:'05NOV26',permissions:{canViewSpecialService:true},...patch},'fixture');
    return [...document.querySelectorAll('[data-telex-items] input')].map(input => input.value);
  }};
}

test('Telex ignores VIP mentions in PSM/MSG remarks and keeps actual wheelchair services', () => {
  const f = fixture();
  assert.deepEqual(f.render({
    seatMapRecords:[{bn:'001',specialServices:['WCHR'],psmLines:['PSM: VIP service mentioned in a remark']}],
    bnAudit:[{bn:'001',passengerRecord:{specialServices:['WCHR'],psmLines:['MSG: NO VIP TODAY']}}],
    psmList:[{bn:'002',psmLines:['PSM: VIP lounge information only']}],
    wchList:[{bn:'001',codes:['WCHR']}]
  }), ['WCHR']);
});

test('active service codes retain real VIP and the other supported Telex tasks', () => {
  const f = fixture();
  assert.deepEqual(f.render({seatMapRecords:[{specialServices:['VIP','INAD','INCP','WCHR','WCHC','AVIH','PETC','UM12']}]}),
    ['VIP','INAD','INCP','WCHR','WCHC','AVIH','PTEC','UM']);
});

test('an explicit PSM-/VIP directive remains a VIP task', () => {
  const f=fixture();
  assert.deepEqual(f.render({psmList:[{psmLines:['PSM-/VIP']}]}), ['VIP']);
});

test('offloaded passengers and denied SSR permission do not create Telex tasks', () => {
  const f = fixture();
  assert.deepEqual(f.render({seatMapRecords:[{isOffloaded:true,specialServices:['VIP']}],bnAudit:[{passengerRecord:{isOffloaded:true,specialServices:['VIP']}}]}), []);
  assert.deepEqual(f.render({permissions:{canViewSpecialService:false},seatMapRecords:[{specialServices:['VIP']}]}), []);
});

test('detected services remain visible when later refreshes omit them', () => {
  const f = fixture();
  assert.deepEqual(f.render({seatMapRecords:[{specialServices:['VIP']}]}), ['VIP']);
  assert.deepEqual(f.render({seatMapRecords:[{specialServices:[],psmLines:['MSG: VIP']}]}), ['VIP']);
  assert.equal(f.document.querySelector('#flight-telex').hidden, false);
});


test('WCHR keeps its control across refreshes, newly detected services and Done updates', async () => {
  const f=fixture();f.render({wchList:[{codes:['WCHR']}]});await new Promise(setImmediate);
  const input=f.document.querySelector('input[value="WCHR"]');
  for(let i=0;i<20;i++)f.render({wchList:[]});
  assert.equal(f.document.querySelector('input[value="WCHR"]'),input);assert.equal(f.requests.length,1);
  f.render({seatMapRecords:[{specialServices:['INAD','WCHR']}]});await new Promise(setImmediate);
  assert.equal(f.document.querySelector('input[value="WCHR"]'),input);
  input.checked=true;input.dispatchEvent(new f.window.Event('change',{bubbles:true}));await new Promise(setImmediate);
  assert.equal(input.checked,true);f.render({});assert.equal(input.checked,true);
  assert.equal(f.document.querySelector('input[value="WCHR"]'),input);
  assert.equal(f.requests.filter(r=>r.body).length,1);
  f.render({flightNo:'MU578'});assert.equal(f.document.querySelector('#flight-telex').hidden,true);
});

test('latched services survive reload in the same account/flight/date and respect permissions', () => {
  const storage=new Map(),first=fixture(storage);first.render({wchList:[{codes:['WCHR']}]});
  const next=fixture(storage);assert.deepEqual(next.render(),['WCHR']);
  assert.deepEqual(next.render({permissions:{canViewSpecialService:false}}),[]);
  assert.deepEqual(next.render({flightDate:'06NOV26'}),[]);
});
