const test=require('node:test'),assert=require('node:assert/strict');
const {counts,weekly,dailyTotal}=require('../public/public/schedule-summary');
test('coverage follows operational duties: Management counts D only and combined duties remain separate',()=>{
 const codes=['K','D','D','C','CL','A','GS','BL','B','FL','F','Q','EC','X','VAC'];
 const employees=codes.map((_,i)=>({id:'e'+i})),assignments=Object.fromEntries(codes.map((code,i)=>['e'+i,{code}]));
 assignments.deletedEmployee={code:'D'};
 const result=counts([{assignments},{}],employees);
 assert.equal(result[0].label,'Management');assert.deepEqual(result[0].counts,[2,0]);
 for(const code of ['C','CL','A','GS','BL','B','FL','F','Q','EC'])assert.deepEqual(result.find(row=>row.codes.includes(code)).counts,[1,0]);
 assert.equal(result.some(row=>row.codes.some(code=>['K','X','VAC'].includes(code))),false);
});
test('Daily Hour applies all ten duty weights and the fixed 40 without counting K, EC, rest or vacation',()=>{
 const codes=['D','C','CL','A','GS','BL','B','FL','F','Q','K','EC','X','VAC'];
 const employees=codes.map((_,i)=>({id:'e'+i})),assignments=Object.fromEntries(codes.map((code,i)=>['e'+i,{code}]));
 assignments.removedEmployee={code:'D'};
 assert.equal(dailyTotal({assignments},employees),98);
 assert.equal(dailyTotal({assignments:{}},employees),40);
 assignments.e0.code='X';assert.equal(dailyTotal({assignments},employees),90);
});
test('weekly hours, 61 daily budget and signed variance match 438/427 and 422/427 examples',()=>{
 const days=values=>values.map(planned=>({planned}));
 assert.deepEqual(weekly(days([62,62,62,62,62,62,66])),{complete:true,total:438,budget:427,variance:11});
 assert.deepEqual(weekly(days([60,60,60,60,60,60,62])),{complete:true,total:422,budget:427,variance:-5});
 assert.deepEqual(weekly(days([61,61,61,61,61,61,61])),{complete:true,total:427,budget:427,variance:0});
 for(const missing of [null,undefined,'61',NaN])assert.deepEqual(weekly(days([61,61,61,61,61,61,missing])),{complete:false,total:null,budget:427,variance:null});
 assert.equal(weekly(days([61,61])).total,null);
 assert.equal(weekly(days([0,0,0,0,0,0,0])).variance,-427);
 const flexible=days([62,62,62,62,62,62,66]);flexible[0].budget=65;
 assert.deepEqual(weekly(flexible),{complete:true,total:438,budget:431,variance:7});
});
