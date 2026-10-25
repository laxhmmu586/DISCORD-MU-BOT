const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3'),Excel=require('exceljs');
const {template,registerHasReports}=require('../hasReports'),{reportMonth}=require('../hasReportCalendar'),{calculate}=require('../public/public/has-report-math');
const scope={station:'LAX',account:'MU'};
async function fixture(t){const db=new Database(':memory:'),app=express();app.use(express.json());const service=registerHasReports(app,{employees:{db},reportDb:db,profiles:{linked:()=>({...scope,position:'Business Manager'})},authenticate:async()=>({uid:'test'})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});return async(path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/has-report-api'+path,{headers:{'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const type=response.headers.get('Content-Type');return {status:response.status,headers:response.headers,data:type?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};};}
test('future calendars update weekdays, Friday-Thursday reporting weeks, leap day and summary ranges',async()=>{
 const da=await template('da','2027-01',scope);assert.equal(da.cells.B6.value,'FRI');assert.equal(da.cells.A156.value,31);assert.equal(da.cells.B156.value,'SUN');assert.equal(da.cells.N6.formula,'SUM(L6:L20)');assert.equal(da.rows,163);assert.equal(da.workbook.getWorksheet('Jan').getCell('I4').value.getUTCFullYear(),2027);
 const wwh=await template('wwh','2027-01',scope);assert.equal(wwh.cells.B5.value,'1-7 JAN');assert.equal(wwh.cells.B9.value,'29-31 JAN');assert.equal(wwh.cells.B10.value,'');
 const december=await template('wwh','2026-12',scope);assert.equal(december.cells.B5.value,'1-3 DEC');assert.equal(december.cells.B6.value,'4-10 DEC');assert.equal(december.cells.B9.value,'25-31 DEC');
 const leap=await template('da','2028-02',scope);assert.equal(leap.cells.A146.value,29);assert.equal(leap.cells.B146.value,'TUE');assert.equal(leap.rows,153);assert.equal(leap.cells.L152.formula,'SUM(L6:L150)');assert.doesNotThrow(()=>calculate(leap.cells));
 const century=await template('da','2100-02',scope);assert.equal(century.rows,148);assert.throws(()=>reportMonth('2025-12'),/2026 or later/);assert.throws(()=>reportMonth('2027-13'),/2026 or later/);
});
test('WWH periods cover every day once and follow Friday to Thursday across years',async()=>{
 for(const year of [2026,2027,2028])for(let month=1;month<=12;month++){
  const model=await template('wwh',year+'-'+String(month).padStart(2,'0'),scope),last=new Date(Date.UTC(year,month,0)).getUTCDate();let expected=1;
  for(let row=5;row<=10;row++){const value=model.cells['B'+row].value;if(!value)continue;const match=/^(\d+)(?:\s*-\s*(\d+))?/.exec(value);assert(match);const start=+match[1],end=+(match[2]||match[1]);assert.equal(start,expected);if(start!==1)assert.equal(new Date(Date.UTC(year,month-1,start)).getUTCDay(),5);if(end!==last)assert.equal(new Date(Date.UTC(year,month-1,end)).getUTCDay(),4);expected=end+1;}
  assert.equal(expected,last+1);
 }
});
test('annual downloads include all twelve months from the selected year without mixing prior-year data',async t=>{
 const request=await fixture(t);
 for(const [month,pax] of [['2026-01',100],['2027-01',200],['2027-02',300]])assert.equal((await request('/da/'+month,{revision:0,values:{C6:'MU583',K7:pax,L6:1}})).status,200);
 assert.equal((await request('/wwh/2027-01')).data.calculated.AA11,200);assert.equal((await request('/wwh/2026-01')).data.calculated.AA11,100);
 const da=await request('/da/2027-01/export');assert.equal(da.status,200);assert.match(da.headers.get('Content-Disposition'),/DA_LAX_MU_2027\.xlsx/);const db=new Excel.Workbook();await db.xlsx.load(da.data);assert.equal(db.getWorksheet('Jan').getCell('K7').value,200);assert.equal(db.getWorksheet('Feb').getCell('K7').value,300);assert.equal(db.getWorksheet('Dec').getCell('I4').value.getUTCFullYear(),2027);assert.equal(db.getWorksheet('Summary Page').getCell('B2').formula,'Feb!M148');
 const wwh=await request('/wwh/2027-01/export');assert.equal(wwh.status,200);assert.match(wwh.headers.get('Content-Disposition'),/WWH_LAX_MU_2027\.xlsx/);const wb=new Excel.Workbook();await wb.xlsx.load(wwh.data);assert.equal(wb.getWorksheet('Jan').getCell('AA11').result,200);assert.equal(wb.getWorksheet('Feb').getCell('AA11').result,300);assert.equal(wb.getWorksheet('Jan').getCell('B5').value,'1-7 JAN');assert.equal(wb.getWorksheet('Dec').getCell('O2').value.getUTCFullYear(),2027);assert.equal(wb.getWorksheet('Feb').getCell('AA5').formula,"SUM('DA Source Feb'!K6:K25)");
 assert.equal((await request('/da/2026-01')).data.cells.K7.value,100);
});
