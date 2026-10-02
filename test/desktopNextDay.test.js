const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(authorized = true) {
  const source = fs.readFileSync(require.resolve('../index'), 'utf8');
  const start = source.indexOf("app.post(['/nextday-info/send'");
  const end = source.indexOf('// Send Message API', start);
  let handler, reads = 0, mailed;
  const details = { firstClass:'1', businessClass:'2', economyClass:'3', internationalTransfer:'4', domesticTransfer:'5', overnightPassengers:'6' };
  const context = { app:{post:(_routes, fn)=>handler=fn}, console, require:()=>({verifyDesktopToken:async()=>authorized}),
    todayIsoUtc:()=> '2026-10-02', addIsoDays:()=> '2026-10-03', isoDateToEmailSubjectDate:()=> 'Oct-03', isoDateToSyDate:()=> '03OCT26',
    getLatestFlightLog:async()=>{reads++;return 'cloud';}, findSYInfo:()=>({}), nextDayInfoDetailsFromSyInfo:()=>details,
    buildNextDayInfoEmailBody:(_date,d)=>JSON.stringify(d), buildNextDayInfoDetailLines:()=>'',
    sendNextDayInfoEmail:async data=>{mailed=data;return {id:'fixture'};}, sendNextDayInfoToDiscord:async()=>({sent:true}),
    settleWithin:p=>p, deliveryError:r=>r.status==='rejected'?'failed':'' };
  vm.runInNewContext(source.slice(start,end), context);
  return { details, run:async(path,body)=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};await handler({path,body,headers:{authorization:'Bearer fixture'}},res);return {res,reads,mailed};} };
}
test('desktop delivers local figures through existing Gmail without reading Drive', async()=>{
  const f=fixture();const d={...f.details,economyClass:'252'};
  const {res,reads,mailed}=await f.run('/desktop-nextday-info/send',{source:'desktop-local',flightNo:'MU586',flightDate:'03OCT26',details:d});
  assert.equal(res.body.ok,true);assert.equal(reads,0);assert.equal(JSON.parse(mailed.text).economyClass,'252');
  assert.equal(mailed.to.join(','),'LAXHMXH@hallmark-aviation.com,dg-lax-lounge@qantas.com.au');
});
test('desktop refuses unsigned, wrong-date or incomplete input without sending', async()=>{
  for(const [authorized,change,code] of [[false,{},401],[true,{flightDate:'02OCT26'},400],[true,{details:{}},400],[true,{source:''},400]]){
    const f=fixture(authorized);const r=await f.run('/desktop-nextday-info/send',{source:'desktop-local',flightNo:'MU586',flightDate:'03OCT26',details:f.details,...change});
    assert.equal(r.res.statusCode,code);assert.equal(r.reads,0);assert.equal(r.mailed,undefined);
  }
});
test('online Nextday retains its fresh Drive lookup',async()=>{
  const f=fixture();const r=await f.run('/nextday-info/send',{flightNo:'MU586'});
  assert.equal(r.reads,1);assert.equal(r.res.body.ok,true);
});
