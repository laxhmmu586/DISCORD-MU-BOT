const test=require('node:test');
const assert=require('node:assert/strict');
const {findSYInfo}=require('../syParser');
const header=['2026 October 12, Monday, 11:55:00','> sy',' SY: MU586/12OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145'];
function record(bn,remarks=[],extra=[]){return [
 '2026 October 12, Monday, 12:00:00',`> fb${bn}`,
 `PR: MU586/12OCT26*LAX,BN${bn} PNR RL TESTXX`,
 `1. TEST/PASSENGER BN${bn} *35A S PVG FBA/1PC ET TKNE/7810000000001/1`,
 'PASSPORT :XX1234567/P/NAT/CHN/900101/350730/CHN/N/A',
 ...remarks,'BAGTAG/0000000001/PVG /0000000002/PVG',...extra
];}
function rows(records){return findSYInfo([...header,...records.flat()].join('\n'),'12OCT26',{preferredFlightNo:'MU586'}).bnAudit;}
const codes=['PSM-PSMEXBG0PCTSXL','PSM-PSMEXBG0PCXCSQ','PSM-PSMEXBG0PCTXLK','PSM-PSMEXBG0PCQTQK EDI','PSM-PSMEXBG0PCQTQK','PSM-PSMEXBG0PCJMSQ'];
test('all supplied PSM baggage codes waive an otherwise failing two-bag one-piece allowance',()=>{
 assert.equal(rows([record('160')])[0].bagStatus,'fail');
 for(const code of codes){const row=rows([record('160',[code])])[0];assert.equal(row.bagStatus,'pass',code);assert.match(row.bagReason,/waiver found/);assert.ok(row.bagReason.includes(code.replace(/^PSM-/,'').split(' ')[0]));}
});
test('PSM baggage waivers also cover destination warnings and retain the waiver explanation with EDI inbound',()=>{
 const outbound=[' O/FM831/13OCT BN015 44A B HKT'];
 const base=record('160',[],outbound).map(line=>line.replace('FBA/1PC','FBA/3PC'));
 assert.equal(rows([base])[0].bagStatus,'review');
 for(const code of codes){const row=rows([record('160',[code],outbound.concat([' I/DL800/12OCT BN999 T FLL']))])[0];assert.equal(row.bagStatus,'pass',code);assert.match(row.bagReason,/waiver found/);}
});
test('similar, unrelated and non-PSM remarks do not grant baggage waivers; existing EXBG0PC is retained',()=>{
 for(const code of ['PSM-PSMEXBG0PCTSXLX','PSM-PSMEXBG0PCOTHER','PSM-PSMEXBG0KGQTQK','PSM-PSMEXBG1PCQTQK','PSM-TSXL','CKIN PSM-PSMEXBG0PCQTQK'])assert.equal(rows([record('160',[code])])[0].bagStatus,'fail',code);
 assert.equal(rows([record('160',['  psm-psmexbg0pcqtqk edi'])])[0].bagStatus,'pass');
 assert.equal(rows([record('160',['PSM-EXBG0PC'])])[0].bagStatus,'pass');
});
test('baggage waivers belong to their BN and cannot override passport or ticket failures',()=>{
 const result=rows([record('160',['PSM-PSMEXBG0PCQTQK']),record('161')]);
 assert.equal(result.find(r=>Number(r.bn)===160).bagStatus,'pass');assert.equal(result.find(r=>Number(r.bn)===161).bagStatus,'fail');
 const invalid=record('160',['PSM-PSMEXBG0PCQTQK']).map(line=>line.replace(' ET TKNE/7810000000001/1','').replace('/350730/','/250730/'));
 const row=rows([invalid])[0];assert.equal(row.bagStatus,'pass');assert.equal(row.tkStatus,'fail');assert.equal(row.apiStatus,'fail');
});
