const test=require('node:test'),assert=require('node:assert/strict');
const {parseTSV,planPaste}=require('../has/public/has-recharge-grid');
test('Arrow keys, Tab and Enter navigate grid cells with correct boundaries',()=>{
 const {nextCell}=require('../has/public/has-recharge-grid');
 for(const [key,target] of [['ArrowUp','C23'],['ArrowDown','C25'],['ArrowLeft','B24'],['ArrowRight','D24'],['Tab','D24'],['Enter','C25']])assert.equal(nextCell('C24',key),target);
 assert.equal(nextCell('C24','Tab',true),'B24');assert.equal(nextCell('C24','Enter',true),'C23');
 assert.equal(nextCell('N23','Tab'),'A24');assert.equal(nextCell('A24','Tab',true),'N23');
 assert.equal(nextCell('A23','ArrowLeft'),'A23');assert.equal(nextCell('A23','ArrowUp'),'A23');assert.equal(nextCell('N59','ArrowRight'),'N59');assert.equal(nextCell('N59','ArrowDown'),'N59');
 assert.equal(nextCell('N59','Tab'),null);assert.equal(nextCell('A23','Tab',true),null);assert.equal(nextCell('A16','ArrowDown'),null);
});
test('Excel paste keeps name rows, rectangular cells, CRLF and quoted values',()=>{
 assert.deepEqual(planPaste('A23','TAMSUN\r\nNORMA\r\nVICKY\r\n'),[{address:'A23',value:'TAMSUN'},{address:'A24',value:'NORMA'},{address:'A25',value:'VICKY'}]);
 assert.deepEqual(planPaste('B23','1.00\t2\r\n3\t4\r\n').map(x=>[x.address,x.value]),[['B23','1.00'],['C23','2'],['B24','3'],['C24','4']]);
 assert.deepEqual(parseTSV('"NAME ""A"""\t"two\nlines"'),[['NAME "A"','two\nlines']]);
 assert.equal(planPaste('B23','"1,234.00"')[0].value,'1234.00');assert.equal(planPaste('B23','0')[0].value,'0');
});
test('Paste rejects invalid hours and overflow before changing any cells',()=>{
 for(const value of ['-1','abc','=1+1','10001','0.001','Infinity'])assert.throws(()=>planPaste('B23',value),/Hours/);
 assert.throws(()=>planPaste('A59','A\nB'),/exceed/);assert.throws(()=>planPaste('N23','one\ttwo'),/exceed/);assert.throws(()=>planPaste('A60','A'),/Choose/);
});
