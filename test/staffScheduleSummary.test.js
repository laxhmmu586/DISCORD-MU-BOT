const test=require('node:test'),assert=require('node:assert/strict');
const {counts,weekly,dailyTotal,periodStart,periods}=require('../has/public/schedule-summary');
test('coverage follows operational duties: Management counts D only and combined duties remain separate',()=>{
 const codes=['K','D','D','C','CL','A','G','BL','B','FL','F','Q','EC','X','VAC'];
 const employees=codes.map((_,i)=>({id:'e'+i})),assignments=Object.fromEntries(codes.map((code,i)=>['e'+i,{code}]));
 assignments.deletedEmployee={code:'D'};
 const result=counts([{assignments},{}],employees);
 assert.equal(result[0].label,'Management');assert.deepEqual(result[0].counts,[2,0]);
 for(const code of ['CL','A','G','BL','B','FL','F','Q'])assert.deepEqual(result.find(row=>row.codes.includes(code)).counts,[1,0]);
 assert.deepEqual(result.find(row=>row.label==='Check-in').counts,[2,0]);
 assert.equal(result.some(row=>row.label==='Early Checkin'),false);
 assert.equal(result.some(row=>row.codes.some(code=>['K','X','VAC'].includes(code))),false);
});
test('Daily Hour applies the ten duty weights without adding the period charge to any day',()=>{
 const codes=['D','C','CL','A','G','BL','B','FL','F','Q','K','EC','X','VAC'];
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

test('coverage color thresholds and non-budget Arrival Card Assistant',()=>{
 const {coverageColor,formula}=require('../has/public/schedule-summary');
 const cases={C:[[4,'#ff0000'],[5,'#45818e'],[6,null]],A:[[1,'#ff0000'],[2,'#93c47d'],[3,null],[4,'#9900ff']],G:[[0,'#ffffff'],[1,'#93c47d'],[2,'#ff0000'],[3,null]],BL:[[0,null],[1,'#46bdc6'],[2,'#ffd966']],B:[[0,'#ff0000'],[1,'#46bdc6'],[2,'#ffd966']],FL:[[0,'#ffffff'],[1,'#46bdc6'],[2,'#ff0000']],F:[[0,null],[1,'#46bdc6'],[2,null]],Q:[[0,null],[1,'#46bdc6'],[2,null]]};
 for(const [code,values] of Object.entries(cases))for(const [count,color] of values)assert.equal(coverageColor(code,count),color,code+' '+count);
 assert.equal(dailyTotal({assignments:{q:{code:'Q'}}},[{id:'q'}]),0);
 assert(!formula.includes('Q'));
});

test('Daily Hour colors clamp at 50 and 64 and interpolate between',()=>{
 const {dailyHourColor}=require('../has/public/schedule-summary');
 for(const value of [0,49.5,50])assert.equal(dailyHourColor(value),'#9ed7f2');
 assert.equal(dailyHourColor(57),'#ff8080');for(const value of [64,70])assert.equal(dailyHourColor(value),'#ff0000');
 for(const value of [null,undefined,NaN,'57',-1])assert.equal(dailyHourColor(value),null);
});
test('Clock-in times shift every endpoint on March 14, including meals and F alternative',()=>{
 const {clockInTimes}=require('../has/public/schedule-summary');
 assert.equal(clockInTimes('2026-10-31'),null);
 const winter=clockInTimes('2026-11-01');assert.deepEqual(clockInTimes('2027-03-13'),winter);assert.equal(winter.length,10);
 const summer=clockInTimes('2027-03-14');
 for(let i=0;i<winter.length;i++){assert.equal(summer[i].code,winter[i].code);const a=winter[i].time.match(/\d{2}:\d{2}/g),b=summer[i].time.match(/\d{2}:\d{2}/g);assert.deepEqual(b,a.map(t=>String(Number(t.slice(0,2))+1).padStart(2,'0')+t.slice(2)));}
 assert.equal(summer.find(d=>d.code==='CL').time,'07:45-12:45 🍴 13:15-16:15');
});


test('custom display labels count toward neither original nor replacement coverage or daily-hour estimates',()=>{
 const employees=[{id:'one'},{id:'two'}],day={assignments:{one:{code:'C',displayLabel:'A'},two:{code:'C'}}},result=counts([day],employees);assert.equal(result.find(row=>row.codes.includes('C')).counts[0],1);assert.equal(result.find(row=>row.codes.includes('A')).counts[0],0);assert.equal(dailyTotal(day,employees),4);
 day.assignments.one.displayLabel='C';assert.equal(dailyTotal(day,employees),8);delete day.assignments.one.displayLabel;assert.equal(dailyTotal(day,employees),8);
});

test('G and historical GS count together exactly once with four hours per gate specialist',()=>{
 const employees=['one','two','custom'].map(id=>({id})),day={assignments:{one:{code:'G'},two:{code:'GS'},custom:{code:'G',displayLabel:'Training'}}};
 assert.equal(counts([day],employees).find(row=>row.codes.includes('G')).counts[0],2);
 assert.equal(dailyTotal(day,employees),8);
 const {formula,coverageColor}=require('../has/public/schedule-summary');assert(formula.includes('G × 4'));assert(!formula.includes('GS'));assert.equal(coverageColor('G',2),coverageColor('GS',2));
});
