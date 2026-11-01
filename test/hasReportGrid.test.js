const test=require('node:test'),assert=require('node:assert/strict');
const grid=require('../has/public/has-report-grid'),{parseTSV}=require('../has/public/has-recharge-grid');
function model(){const cells={};for(let r=1;r<=8;r++)for(const c of ['A','B','C'])cells[c+r]={value:'',editable:r>1,formulaAllowed:c==='A'};return {rows:8,columns:3,cells};}
test('report clipboard preserves multiline text and numbers in a rectangular TSV block',()=>{
 const m=model();m.cells.A2.value=12;m.cells.B2.value='Name\t"quoted"\nsecond line';m.cells.C2.value='';
 const result=grid.copy(m,{anchor:'A2',focus:'C2'},()=>''),rows=parseTSV(result.text);
 assert.deepEqual(rows,[['12','Name\t"quoted"\nsecond line','']]);
 assert.deepEqual(grid.planPaste(m,{anchor:'A3',focus:'A3'},JSON.parse(result.rich).cells).changes,{A3:12,B3:m.cells.B2.value,C3:''});
});
test('paste expands from the selected cell, fills a selection from one value and rejects protected boundaries atomically',()=>{
 const m=model();assert.deepEqual(grid.planPaste(m,{anchor:'B3',focus:'C4'},[['same']]).changes,{B3:'same',C3:'same',B4:'same',C4:'same'});
 assert.throws(()=>grid.planPaste(m,{anchor:'B8',focus:'B8'},[['x','y'],['z','w']]),/does not fit/);
 assert.throws(()=>grid.planPaste(m,{anchor:'B1',focus:'B1'},[['x'],['y']]),/read-only/);
 assert.throws(()=>grid.planPaste(m,{anchor:'A2',focus:'A2'},[['x'],['y','z']]),/rectangular/);
 assert.equal(m.cells.B2.value,'');
});
test('fill repeats selected rows and adjusts relative references while preserving absolute references',()=>{
 const m=model();m.cells.A2.value='=SUM(B2:C2)+$B$7+B$7+$B2';m.cells.B2.value='Recipient';m.cells.A3.value=25;m.cells.B3.value='Other';
 const plan=grid.planFill(m,{anchor:'A2',focus:'B3'},6);
 assert.equal(plan.changes.A4,'=SUM(B4:C4)+$B$7+B$7+$B4');assert.equal(plan.changes.B4,'Recipient');assert.equal(plan.changes.A5,25);assert.equal(plan.changes.B5,'Other');assert.equal(plan.changes.A6,'=SUM(B6:C6)+$B$7+B$7+$B6');
 assert.deepEqual(plan.range,{anchor:'A2',focus:'B6'});
 assert.equal(grid.shiftFormula('=A1','A3','A2'),'=#REF!');
 m.cells.B6.editable=false;assert.throws(()=>grid.planFill(m,{anchor:'A2',focus:'B3'},6),/read-only/);assert.equal(m.cells.A4.value,'');
});
test('internal copied formulas shift on paste; externally pasted formulas retain their references',()=>{
 const m=model();assert.equal(grid.planPaste(m,{anchor:'A5',focus:'A5'},[[{address:'A2',value:'=B2+$C$2'}]]).changes.A5,'=B5+$C$2');
 assert.equal(grid.planPaste(m,{anchor:'A5',focus:'A5'},[['=B2+$C$2']]).changes.A5,'=B2+$C$2');
});
