const test=require('node:test'),assert=require('node:assert/strict');
const {events,append}=require('../workflowEvents');
test('legacy returned requests recover the original submission and every archived decision',()=>{
 const approval={employeeId:'reviewer',name:'Reviewer',position:'Supervisor',action:'approve',at:'2026-10-23T17:01:00Z',note:'Checked'};
 const record={employee:{id:'owner',name:'Owner'},status:'draft',approvals:[],history:[{at:'2026-10-23T17:02:00Z',employeeId:'manager',name:'Manager',position:'Business Manager',action:'Returned for revision',submittedAt:'2026-10-23T17:00:00Z',approvals:[approval],returnedTo:'reviewer',note:'Correct the report'}]};
 assert.deepEqual(events(record).map(e=>e.action),['submit','approve','return']);
 assert.equal(events(record)[1].note,'Checked');assert.equal(events(record)[2].targetId,'reviewer');
});
test('each action appends a permanent timeline step, even when timestamps are equal',()=>{
 const record={employee:{id:'owner',name:'Owner'},timeline:[]};
 for(const action of ['submit','approve','return','revision','submit','transfer','reject'])append(record,{action,at:'2026-10-23T17:00:00Z',name:'Fixture'});
 assert.deepEqual(events(record).map(e=>e.action),['submit','approve','return','revision','submit','transfer','reject']);
 const snapshot=events(record);snapshot[0].name='Mutated';assert.equal(record.timeline[0].name,'Fixture');
});
