const test=require('node:test'),assert=require('node:assert/strict');
const {period,count,message,createSender}=require('../hasWheelchairMail');
test('Los Angeles 9am boundaries, year rollover and leap-year month end',()=>{
 for(const [date,month,start,end] of [
  ['2026-10-16T15:59:00Z','2026-09',16,30],['2026-10-16T16:00:00Z','2026-10',1,15],
  ['2026-11-01T15:59:00Z','2026-10',1,15],['2026-11-01T17:00:00Z','2026-10',16,31],
  ['2027-01-01T17:00:00Z','2026-12',16,31],['2028-03-01T17:00:00Z','2028-02',16,29],
  ['2027-01-01T16:59:00Z','2026-12',1,15],['2026-10-25T20:00:00Z','2026-10',1,15]
 ]){const p=period(new Date(date));assert.deepEqual([p.month,p.start,p.end],[month,start,end]);}
});
test('Gmail request encodes the verified totals, recipients and stable Message-ID',async()=>{
 let request,search,sends=0;const sender=createSender(()=>({userId:'me',gmail:{users:{messages:{list:async q=>{search=q;return {data:{messages:[]}};},send:async(q,options)=>{request=q;assert.equal(options.retry,false);sends++;return {data:{id:'mail-id'}};}}}}}));
 const range=period(new Date('2026-10-16T16:00:00Z')),mail=message(range,{arrival:147,departure:125,total:272});assert.equal(await sender(mail,range.key),'mail-id');assert.equal(sends,1);
 const raw=Buffer.from(request.requestBody.raw,'base64url').toString(),body=Buffer.from(raw.split('\r\n\r\n')[1],'base64').toString();assert.match(raw,/To: laurence.chai@chinaeastern-usa.com/);assert.match(raw,/Cc: lake.xia@hallmark-aviation.com/);assert.match(raw,/Message-ID: <wheelchair-2026-10-1@mufcapp.net>/);assert.match(body,/Arrival: 147\nDeparture: 125\nTotal: 272/);assert.match(search.q,/subject:/);
});
test('Sent reconciliation works even when Gmail rewrites Message-ID',async()=>{
 let sends=0;const subject='Wheelchair count summary for October 1–15, 2026';const sender=createSender(()=>({userId:'me',gmail:{users:{messages:{list:async()=>({data:{messages:[{id:'existing'}]}}),get:async()=>({data:{payload:{headers:[{name:'Subject',value:subject},{name:'To',value:'laurence.chai@chinaeastern-usa.com'},{name:'Cc',value:'lake.xia@hallmark-aviation.com'},{name:'Message-ID',value:'<rewritten@gmail.com>'}]}}}),send:async()=>{sends++;}}}}}));assert.equal(await sender({subject,text:'unused'},'2026-10:1'),'existing');assert.equal(sends,0);
});
test('a broad Gmail search result with a different subject does not suppress a report',async()=>{
 let sends=0;const sender=createSender(()=>({userId:'me',gmail:{users:{messages:{list:async()=>({data:{messages:[{id:'unrelated'}]}}),get:async()=>({data:{payload:{headers:[{name:'Subject',value:'Other period'}]}}}),send:async()=>{sends++;return {data:{id:'new'}};}}}}}));assert.equal(await sender({subject:'Wheelchair count summary for November 1–15, 2026',text:'report'},'2026-11:1'),'new');assert.equal(sends,1);
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
