const test=require('node:test'),assert=require('node:assert/strict');
const {counts,weekly,dailyTotal,periodStart,periods}=require('../public/public/schedule-summary');
test('coverage follows operational duties: Management counts D only and combined duties remain separate',()=>{
 const codes=['K','D','D','C','CL','A','GS','BL','B','FL','F','Q','EC','X','VAC'];
 const employees=codes.map((_,i)=>({id:'e'+i})),assignments=Object.fromEntries(codes.map((code,i)=>['e'+i,{code}]));
 assignments.deletedEmployee={code:'D'};
 const result=counts([{assignments},{}],employees);
 assert.equal(result[0].label,'Management');assert.deepEqual(result[0].counts,[2,0]);
 for(const code of ['C','CL','A','GS','BL','B','FL','F','Q','EC'])assert.deepEqual(result.find(row=>row.codes.includes(code)).counts,[1,0]);
 assert.equal(result.some(row=>row.codes.some(code=>['K','X','VAC'].includes(code))),false);
});
test('Daily Hour applies the ten duty weights without adding the period charge to any day',()=>{
 const codes=['D','C','CL','A','GS','BL','B','FL','F','Q','K','EC','X','VAC'];
 const employees=codes.map((_,i)=>({id:'e'+i})),assignments=Object.fromEntries(codes.map((code,i)=>['e'+i,{code}]));
 assignments.removedEmployee={code:'D'};
 assert.equal(dailyTotal({assignments},employees),58);
 assert.equal(dailyTotal({assignments:{}},employees),0);
 assignments.e0.code='X';assert.equal(dailyTotal({assignments},employees),50);
});
test('Friday–Thursday period adds 40 exactly once, including an empty period',()=>{
 const days=values=>values.map(planned=>({planned}));
 assert.deepEqual(weekly(days([56,56,56,56,56,56,62])),{complete:true,total:438,budget:427,variance:11});
 assert.deepEqual(weekly(days([54,54,54,54,54,54,58])),{complete:true,total:422,budget:427,variance:-5});
 assert.deepEqual(weekly(days([55,55,55,55,55,55,57])),{complete:true,total:427,budget:427,variance:0});
 for(const missing of [null,undefined,'61',NaN])assert.deepEqual(weekly(days([61,61,61,61,61,61,missing])),{complete:false,total:null,budget:427,variance:null});
 assert.equal(weekly(days([61,61])).total,null);
 assert.equal(weekly(days([0,0,0,0,0,0,0])).variance,-387);
 const flexible=days([56,56,56,56,56,56,62]);flexible[0].budget=65;
 assert.deepEqual(weekly(flexible),{complete:true,total:438,budget:431,variance:7});
 assert.equal(weekly(days([0,0,0,0,0,0,0])).total,40);
 assert.equal(periodStart('2026-10-27'),'2026-10-23');assert.equal(periodStart('2026-10-30'),'2026-10-30');assert.equal(periodStart('2027-01-01'),'2027-01-01');
 assert.deepEqual(periods([{date:'2026-10-29'},{date:'2026-10-30'}]).map(p=>p.start),['2026-10-23','2026-10-30']);
});
