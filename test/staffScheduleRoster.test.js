const test=require('node:test'),assert=require('node:assert/strict');
const {orderRoster,digest}=require('../has/server/staffScheduleRoster');
test('reference groups and order match existing records across comma order, nicknames and casing',()=>{
 const reference=[{group:'Management',entries:[[digest('Example Manager')]]},{group:'Flight Control',entries:[[digest('FIRST AGENT')],[digest('SECOND AGENT')]]}];
 const rows=[{id:'third',name:'Unlisted Person',position:'Agent'},{id:'second',name:'Agent, Second (nickname)',position:'Agent'},{id:'manager',name:'Manager Example',position:'Business Manager'},{id:'first',name:'Different Name',nickname:'First Agent',position:'Agent'}];
 const result=orderRoster(rows,reference);assert.deepEqual(result.map(e=>e.id),['manager','first','second','third']);assert.deepEqual(result.map(e=>e.scheduleGroup),['Management','Flight Control','Flight Control','Other LAX / MU staff']);assert.equal(rows[0].scheduleGroup,undefined);
});
