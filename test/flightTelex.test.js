const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');

function fixture() {
  const {window,document} = parseHTML('<section id="flight-telex" hidden><div data-telex-items></div><p data-telex-status></p></section>');
  const requests = [];
  vm.runInNewContext(fs.readFileSync('public/public/flight-telex.js','utf8'), {
    window,document,URLSearchParams,Intl,Date,
    peopleApi:async (url, body) => {requests.push({url,body}); return {checked:[]};}
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

test('removing the last active VIP service removes its card even if remarks still mention VIP', () => {
  const f = fixture();
  assert.deepEqual(f.render({seatMapRecords:[{specialServices:['VIP']}]}), ['VIP']);
  assert.deepEqual(f.render({seatMapRecords:[{specialServices:[],psmLines:['MSG: VIP']}]}), []);
  assert.equal(f.document.querySelector('#flight-telex').hidden, true);
});
