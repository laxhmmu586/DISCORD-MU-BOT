const test=require('node:test'),assert=require('node:assert/strict');
const grid=require('../public/public/schedule-grid'),{roles,colors}=require('../staffSchedule');
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
