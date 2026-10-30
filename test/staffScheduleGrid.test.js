const test=require('node:test'),assert=require('node:assert/strict');
const grid=require('../has/public/schedule-grid'),{roles,colors}=require('../has/server/staffSchedule');
const employees=[{id:'a'},{id:'b'},{id:'c'}],days=[{date:'2026-10-26',revision:3,assignments:{a:{code:'CL',color:'#123456'}}},{date:'2026-10-27',revision:4,assignments:{a:{code:'VAC',color:colors.VAC}}},{date:'2026-10-28',revision:5,assignments:{}}];
test('rectangular copy/paste preserves custom colors, vacation and blank cells',()=>{
 const range={anchor:{row:1,col:1},focus:{row:0,col:0}},copied=grid.copy(employees,days,range),cells=grid.parse(copied.rich,copied.text,roles,colors);
 assert.equal(copied.text,'CL\t🏖️\n\t');assert.deepEqual(cells[0],[{code:'CL',color:'#123456'},{code:'VAC',color:colors.VAC}]);assert.deepEqual(cells[1],[null,null]);
 const plan=grid.plan(employees,days,{anchor:{row:1,col:1},focus:{row:1,col:1}},cells);assert.equal(plan.changes.length,4);assert.deepEqual(plan.changes[0],{employeeId:'b',date:'2026-10-27',code:'CL',color:'#123456'});assert.equal(plan.changes[3].code,null);assert.deepEqual(plan.revisions,{'2026-10-27':4,'2026-10-28':5});
});
test('one copied cell fills a selected rectangle; text TSV parses duty codes safely',()=>{
 const range={anchor:{row:0,col:0},focus:{row:2,col:1}},cells=grid.parse('','x',roles,colors),plan=grid.plan(employees,days,range,cells);assert.equal(plan.changes.length,6);assert(plan.changes.every(change=>change.code==='X'));
 assert.equal(grid.parse('','c\tCL\nF\t🏖️\n',roles,colors)[1][1].code,'VAC');
 for(const text of ['INVALID','C\tF\nA','=SUM(A1)'])assert.throws(()=>grid.parse('',text,roles,colors));
 assert.throws(()=>grid.plan(employees,days,{anchor:{row:2,col:2},focus:{row:2,col:2}},[[cells[0][0],cells[0][0]]]));
});

test('rich clipboard carries remarks alongside duty colors',()=>{const grid=require('../has/public/schedule-grid'),employees=[{id:'a'}],days=[{date:'2026-10-28',revision:1,assignments:{a:{code:'C',color:'#99ff00',remark:'Check passport'}}}],range={anchor:{row:0,col:0},focus:{row:0,col:0}},copied=grid.copy(employees,days,range),cells=grid.parse(copied.rich,copied.text,{C:'Check-in'},{C:'#99ff00'});assert.equal(grid.plan(employees,days,range,cells).changes[0].remark,'Check passport');});


test('rich copy/paste preserves custom display text separately from the duty code',()=>{
 const people=[{id:'a'}],date='2026-10-29',range={anchor:{row:0,col:0},focus:{row:0,col:0}},days=[{date,revision:2,assignments:{a:{code:'C',color:'#00ff00',displayLabel:'EK',remark:'Custom duty'}}}];
 const copied=grid.copy(people,days,range);assert.equal(copied.text,'EK');const cells=grid.parse(copied.rich,copied.text,roles,colors),change=grid.plan(people,days,range,cells).changes[0];assert.equal(change.displayLabel,'EK');assert.equal(change.code,'C');assert.equal(change.remark,'Custom duty');
 for(const displayLabel of [null,42,'x'.repeat(21),'CI\nTI'])assert.throws(()=>grid.parse(JSON.stringify({kind:'staff-schedule',version:1,cells:[[{code:'C',color:'#00ff00',displayLabel}]]}),'',roles,colors));
});
