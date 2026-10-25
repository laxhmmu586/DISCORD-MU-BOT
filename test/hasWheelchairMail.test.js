const test=require('node:test'),assert=require('node:assert/strict');
const {period,count,message,createMailer}=require('../hasWheelchairMail');
test('Los Angeles 9am boundaries, year rollover and leap-year month end',()=>{
 for(const [date,month,start,end] of [
  ['2026-10-16T15:59:00Z','2026-09',16,30],['2026-10-16T16:00:00Z','2026-10',1,15],
  ['2026-11-01T15:59:00Z','2026-10',1,15],['2026-11-01T17:00:00Z','2026-10',16,31],
  ['2027-01-01T17:00:00Z','2026-12',16,31],['2028-03-01T17:00:00Z','2028-02',16,29],
  ['2027-01-01T16:59:00Z','2026-12',1,15],['2026-10-25T20:00:00Z','2026-10',1,15]
 ]){const p=period(new Date(date));assert.deepEqual([p.month,p.start,p.end],[month,start,end]);}
});
test('count only period days, including inserted rows and separate arrival/departure',()=>{
 const model={days:[{day:1,start:6,end:11},{day:16,start:12,end:16}]};
 const values={O6:2,P7:'3',O11:4,O12:10,P16:5};
 assert.deepEqual(count(model,values,{start:1,end:15}),{arrival:6,departure:3,total:9});
 assert.deepEqual(count(model,values,{start:16,end:31}),{arrival:10,departure:5,total:15});
 assert.throws(()=>count(model,{O6:'oops'},{start:1,end:15}),/Invalid/);
 const mail=message(period(new Date('2026-10-16T16:00:00Z')),{arrival:6,departure:3,total:9});
 assert.equal(mail.to,'laurence.chai@chinaeastern-usa.com');assert.equal(mail.cc,'lake.xia@hallmark-aviation.com');assert.match(mail.text,/Total: 9/);
});
