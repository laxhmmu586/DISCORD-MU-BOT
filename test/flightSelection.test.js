const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const {discoverFlights,scopedLog,operationalDate,FILE_BOUNDARY}=require('../flightContext');
const parser=require('../flightParser');
const sample=fs.readFileSync(require.resolve('./fixtures/flight-selection-supplied.log'),'utf8');
const flights=['MU586','MU9586','MU578','MU9578'];
test('today uses Los Angeles date and excludes tomorrow, arrivals and non-LAX origins',()=>{
  assert.equal(operationalDate(new Date('2026-10-09T02:00:00Z')),'08OCT26');
  assert.equal(operationalDate(new Date('2026-10-09T07:00:00Z')),'09OCT26');
  const mixed=flights.map(f=>sample.replaceAll('MU586',f).replace('GTD/????','GTD/132')).join('\n')+'\n'+sample.replaceAll('08OCT26','09OCT26')+'\n'+sample.replaceAll('MU586','MU583')+'\n'+sample.replaceAll('MU586','MU577');
  const found=discoverFlights(mixed,{date:'08OCT26'});
  assert.deepEqual(found.map(f=>f.flightNo),flights); assert.ok(found.every(f=>f.gate==='132'));
  assert.equal(discoverFlights(sample,{date:'08OCT26'}).length,1);
  assert.equal(discoverFlights(sample.replaceAll('LAX/0','PVG/0').replaceAll('*LAXPVG','*PVGLAX')).length,0);
});
test('mixed flight FB14 and PN1 retain only the selected passenger and continuation history',()=>{
  const mixed=flights.map((f,i)=>sample.replaceAll('MU586',f).replaceAll('SAMPLE/PASSENGER',`TEST/PAX${String.fromCharCode(65+i)}`).replaceAll('35J',`${35+i}J`)).join('\n');
  for(const [i,flight] of flights.entries()) {
    const log=scopedLog(mixed,flight,'08OCT26'); parser.parseIncrementalLog(log);
    assert.equal(parser.passengers['014'].name,`TEST/PAX${String.fromCharCode(65+i)}`);
    assert.equal(parser.passengers['014'].flight,flight);
    assert.equal(parser.passengers['014'].seat,`${35+i}J`);
    assert.match(parser.passengers['014'].checkinDetails.join('\n'),/MOD LAX49014 AGT24102\/08OCT1049/);
    assert.doesNotMatch(log,new RegExp(flights.filter(f=>f!==flight).join('|')));
  }
});
test('terminal boundaries prevent an unlabelled continuation inheriting another file flight',()=>{
  const log=sample+FILE_BOUNDARY+'>PN1\n MOD OTHER-TERMINAL\n';
  assert.doesNotMatch(scopedLog(log,'MU586','08OCT26'),/OTHER-TERMINAL/);
});

test('MU9578 is parsed as the selected SY flight without mixing existing flights',()=>{
 const {findSYInfo}=require('../syParser');
 const log=flights.map(f=>sample.replaceAll('MU586',f)).join('\n');
 const selected=scopedLog(log,'MU9578','08OCT26');
 const sy=findSYInfo(selected,'08OCT26',{preferredFlightNo:'MU9578',strictPreferredFlight:true});
 assert.equal(sy.flightNo,'MU9578');assert.equal(sy.flightDate,'08OCT26');
});

test('SY route accepts MU9578 independently of boarding sheet configuration',()=>{
 const vm=require('node:vm'),{normalizeSupportedFlight}=require('../flightContext');
 const server=fs.readFileSync(require.resolve('../index.js'),'utf8');
 const selection=server.match(/const selectedFlight = normalizeSupportedFlight[^\n]+;\r?\n[^\n]+Flight does not match selection[^\n]+/)[0];
 for(const flightNo of ['MU9578','mu9578','09578']){
  const context={req:{query:{flightNo}},syRawMatch:null,normalizeSupportedFlight};
  assert.equal(vm.runInNewContext('(function(){'+selection+';return selectedFlight;})()',context),'MU9578');
 }
 assert.equal(normalizeSupportedFlight('MU577'),'');
});
