const test=require('node:test'),assert=require('node:assert/strict');
const {createBriefingBooking}=require('../has/server/briefingBooking');
const sy=(flight='MU586',date='31OCT26',counts='001/055/248',time='14:00:00')=>`2026 October 31, Saturday, ${time}
>SY
 SY: ${flight}/${date} LAX/0 OP/NAM
*LAXPVG R${counts} C001/020/111
 RET002/056/252 CET001/020/111 I02
`;
test('SY R counts supply F/J/Y without borrowing check-in, ticketed or infant counts',async()=>{
 const service=createBriefingBooking({getLog:async()=>sy()});
 assert.deepEqual((await service.read('2026-10-31','MU586')).fields,{bookingF:'1',bookingJ:'55',bookingY:'248'});
 for(const [date,flight] of [['2026-10-30','MU586'],['2026-10-31','MU578'],['2027-10-31','MU586']])assert.equal((await service.read(date,flight)).status,'unavailable');
});
test('latest exact SY wins across files, with zero counts and incomplete captures respected',async()=>{
 const {FILE_BOUNDARY}=require('../flightContext');
 const log=sy('MU586','31OCT26','000/000/000','15:00:00')+FILE_BOUNDARY+sy()+sy('MU578','31OCT26','999/999/999','16:00:00');
 assert.deepEqual((await createBriefingBooking({getLog:async()=>log}).read('2026-10-31','MU586')).fields,{bookingF:'0',bookingJ:'0',bookingY:'0'});
 const incomplete=sy()+sy('MU586','31OCT26','broken','17:00:00');
 assert.equal((await createBriefingBooking({getLog:async()=>incomplete}).read('2026-10-31','MU586')).status,'unavailable');
});
test('log reads share a TTL cache, retry failures after expiry and refresh changed bookings',async()=>{
 let calls=0,stamp=0,log=sy();const service=createBriefingBooking({getLog:async()=>{calls++;if(log===null)throw Error('offline');return log;},now:()=>stamp,ttl:30});
 await Promise.all([service.read('2026-10-31','MU586'),service.read('2026-10-31','MU578')]);assert.equal(calls,1);
 log=sy('MU586','31OCT26','002/056/249');stamp=31;assert.equal((await service.read('2026-10-31','MU586')).fields.bookingF,'2');assert.equal(calls,2);
 log=null;stamp=62;assert.equal((await service.read('2026-10-31','MU586')).status,'unavailable');await service.read('2026-10-31','MU586');assert.equal(calls,3);
 log=sy();stamp=93;assert.equal((await service.read('2026-10-31','MU586')).status,'available');assert.equal(calls,4);
});
