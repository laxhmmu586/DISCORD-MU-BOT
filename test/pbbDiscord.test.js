const test=require('node:test'),assert=require('node:assert/strict');
const {discordMessage}=require('../pbb');

for(const type of ['arrival','departure'])test(`${type} Discord notification has exactly four lines`,()=>{
 const message=discordMessage({type,flightNo:'MU583',date:'2026-10-14',gate:'134',bridges:['L1'],signatures:{driver:{name:'TEST, DRIVER'},spotter:{name:'TEST SPOTTER'}}});
 assert.deepEqual(message.split('\n'),[
  `Jet Bridge ${type.toUpperCase()} | MU583 | 2026-10-14 |`,
  'Gate 134 | L1',
  'Driver: TEST, DRIVER ✓',
  'Spotter: TEST SPOTTER ✓'
 ]);
});

test('line breaks in display values cannot add notification lines',()=>{
 const message=discordMessage({type:'arrival',flightNo:'MU583',date:'2026-10-14',gate:'134',bridges:['L2'],signatures:{driver:{name:' TEST,\r\nDRIVER '},spotter:{name:'TEST\nSPOTTER'}}});
 assert.equal(message.split('\n').length,4);
 assert.equal(message.split('\n')[2],'Driver: TEST, DRIVER ✓');
 assert.equal(message.split('\n')[3],'Spotter: TEST SPOTTER ✓');
});
