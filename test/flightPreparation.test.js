const test = require('node:test');
const assert = require('node:assert/strict');
const {findSYInfo} = require('../syParser');
const {scopedLog} = require('../flightContext');
const commands = `2026 October 08, Thursday, 12:30:21
>IF MU586/10OCT
CKI TIME 1233                                                                   
                                                                                

2026 October 08, Thursday, 12:30:26
>FU MU586/10OCT/LAX/BDT/1145
                                                                                `;
const syLog = flight => `2026 October 08, Thursday, 12:00:00
>SY
 SY: ${flight}/08OCT26 LAX/0 OP/NAM
777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000
BDT1145 SD1230 ED1230
`;
function query(log, flight='MU586') {
 return findSYInfo(scopedLog(log,flight,'08OCT26'),'08OCT26',{preferredFlightNo:flight,strictPreferredFlight:true,preparationLog:log});
}
function steps(sy) {return sy.crewApis.steps.filter(s=>['initialFlight','bdtChg'].includes(s.key));}
test('actual date-scoped query retains today commands targeting October 10',()=>{
 const log=syLog('MU586')+commands;
 assert.doesNotMatch(scopedLog(log,'MU586','08OCT26'),/>IF|>FU/);
 assert.deepEqual(steps(query(log)).map(s=>[s.complete,s.time]),[[true,'12:30:21'],[true,'12:30:26']]);
 assert.equal(query(log).flightDate,'08OCT26');
});
test('preparation lookup excludes other flights, target dates and operation dates',()=>{
 for(const bad of [commands.replaceAll('MU586','MU9586'),commands.replaceAll('MU586','MU578'),commands.replaceAll('10OCT','11OCT'),commands.replaceAll('October 08','October 07')]) {
 assert.deepEqual(steps(query(syLog('MU586')+bad)).map(s=>s.complete),[false,false]);
 }
 assert.deepEqual(steps(query(syLog('MU578')+commands.replaceAll('MU586','MU578'),'MU578')).map(s=>s.complete),[true,true]);
});
test('future flight schedule informs BDT without replacing today flight data',()=>{
 const future=syLog('MU586').replace('08OCT26','10OCT26').replace('SD1230','SD1300').replace('BDT1145','BDT1215');
 const sy=query(syLog('MU586')+future+commands.replace('/BDT/1145','/BDT/1215'));
 assert.equal(sy.sd,'1230');assert.equal(sy.flightDate,'08OCT26');
 assert.deepEqual(steps(sy).map(s=>s.complete),[true,true]);
});
test('online search route passes unfiltered preparation evidence into the parser',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const server=fs.readFileSync(require.resolve('../index.js'),'utf8');
 const start=server.indexOf('      const preparationLog = log;');
 const end=server.indexOf('        if (!syInfo)',start);
 assert.ok(start>=0 && end>start);
 const body=server.slice(start,end)+'return syInfo; }';
 const log=syLog('MU586')+commands;
 const result=vm.runInNewContext('(function(){'+body+'})()',{
 log,scopedLog,selectedFlight:'MU586',selectedDate:'08OCT26',date:'08OCT26',
 syRawMatch:['SY MU586/08OCT26','','MU586','08OCT26'],parseIncrementalLog(){},parsePDLog(){},findSYInfo
 });
 assert.deepEqual(steps(result).map(s=>[s.complete,s.time]),[[true,'12:30:21'],[true,'12:30:26']]);
});
