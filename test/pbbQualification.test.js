const test=require('node:test'),assert=require('node:assert/strict');
const status=require('../public/public/pbb-qualification');
test('qualification warning starts strictly below one calendar month; expired takes priority',()=>{
 assert.equal(status('2026-11-20','2026-10-21'),'warning');
 assert.equal(status('2026-11-21','2026-10-21'),'');
 assert.equal(status('2026-11-22','2026-10-21'),'');
 assert.equal(status('2026-10-21','2026-10-21'),'warning');
 assert.equal(status('2026-10-20','2026-10-21'),'expired');
 assert.equal(status('','2026-10-21'),'');
});
test('calendar month boundary clamps at month end, including leap year and year rollover',()=>{
 assert.equal(status('2027-02-27','2027-01-31'),'warning');
 assert.equal(status('2027-02-28','2027-01-31'),'');
 assert.equal(status('2028-02-28','2028-01-31'),'warning');
 assert.equal(status('2028-02-29','2028-01-31'),'');
 assert.equal(status('2027-01-30','2026-12-31'),'warning');
 assert.equal(status('2027-01-31','2026-12-31'),'');
});
