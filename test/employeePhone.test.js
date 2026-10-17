const test=require('node:test'),assert=require('node:assert/strict'),format=require('../public/public/employee-phone');
test('employee US phone numbers use one format without destroying incomplete or international numbers',()=>{
 for(const input of ['6268891216','(626) 889-1216','+1 626 889 1216','1-626-889-1216','626.889.1216',' 626-889-1216 '])assert.equal(format(input),'626-889-1216');
 for(const input of ['','555','+44 20 7946 0958','626-889-1216 ext 10'])assert.equal(format(input),input);
});
