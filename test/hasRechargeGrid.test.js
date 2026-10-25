const test=require('node:test'),assert=require('node:assert/strict');
const {parseTSV,planPaste}=require('../public/public/has-recharge-grid');
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
