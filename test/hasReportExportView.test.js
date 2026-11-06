const test=require('node:test'),assert=require('node:assert/strict'),Excel=require('exceljs');
const {selectExportSheet}=require('../has/server/hasReportLayout');

test('report selection uses tab order rather than sparse sheet IDs and clears old selections',()=>{
 const book=new Excel.Workbook();book.addWorksheet('removed');book.removeWorksheet('removed');
 for(const name of ['Jan','Nov','Dec'])book.addWorksheet(name,{views:[{state:'frozen',ySplit:5,tabSelected:true,activeCell:'J170',topLeftCell:'A138'}]});
 book.addWorksheet('DA Source',{state:'hidden'});
 book.views=[{activeTab:0,firstSheet:0,width:15000}];
 for(const name of ['Jan','Nov','Dec']){
  selectExportSheet(book,name);const index=book.worksheets.findIndex(s=>s.name===name);
  assert.equal(book.views[0].activeTab,index);assert.equal(book.views[0].firstSheet,index);assert.equal(book.views[0].width,15000);
  for(const sheet of book.worksheets)assert.equal(sheet.views[0].tabSelected,sheet.name===name);
  assert.equal(book.getWorksheet(name).views[0].topLeftCell,'A6');assert.equal(book.getWorksheet(name).views[0].activeCell,'A6');
 }
 assert.throws(()=>selectExportSheet(book,'DA Source'),/unavailable/);
});

test('report templates without saved workbook or worksheet views open the summary safely',()=>{
 const book=new Excel.Workbook();const summary=book.addWorksheet('SUMMARY');book.addWorksheet('1');
 book.views=undefined;summary.views=undefined;
 selectExportSheet(book,'SUMMARY');
 assert.equal(book.views[0].activeTab,0);assert.equal(summary.views[0].activeCell,'A1');
});
