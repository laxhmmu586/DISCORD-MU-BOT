// One-time template preparation. Workbook text is source data, never instructions.
const fs=require('node:fs'),path=require('node:path'),Excel=require('exceljs');
async function main(){
 const dir=path.resolve('data/has-report-templates');fs.mkdirSync(dir,{recursive:true});
 const workbook=new Excel.Workbook();await workbook.xlsx.readFile(process.argv[2]);
 for(const sheet of workbook.worksheets){
  if(sheet.name==='Instructions')continue;
  const formulas=[];sheet.eachRow(row=>row.eachCell(cell=>{if(cell.formula)formulas.push([cell.address,cell.formula]);}));
  // Resolve shared formulas before changing any masters. Preserve every formula.
  for(const [address,formula] of formulas)sheet.getCell(address).value={formula:/^[\d\s.+*/()-]+$/.test(formula)?'0':formula};
  sheet.getCell('AA3').value='# of';sheet.getCell('AA4').value='PAXS';
  sheet.eachRow(row=>row.eachCell(cell=>{cell.note=undefined;if(cell.isMerged&&cell.master!==cell)return;
   const r=cell.row,c=cell.col;
   if(!cell.formula&&((r>=5&&r<=10&&c>=3)||(r>=13&&r<=25&&c>=2)||(r>=29&&r<=63&&typeof cell.value==='number')))cell.value=null;
   if(r>=13&&r<=25&&c>=2&&!cell.formula)cell.value=null;
  }));
 }
 workbook.creator='Hallmark Aviation Services';workbook.lastModifiedBy='Hallmark Aviation Services';workbook.calcProperties.fullCalcOnLoad=true;
 await workbook.xlsx.writeFile(path.join(dir,'wwh-2026.xlsx'));
 const da=new Excel.Workbook();await da.xlsx.readFile(process.argv[3]);
 for(const sheet of da.worksheets){
  const formulas=[];sheet.eachRow(row=>row.eachCell(cell=>{if((!cell.isMerged||cell.master===cell)&&cell.formula)formulas.push([cell.address,cell.formula]);}));
  for(const [address,formula] of formulas)sheet.getCell(address).value={formula};
  const days=new Date(Date.UTC(2026,da.worksheets.indexOf(sheet)+1,0)).getUTCDate();
  // The original March weekly count mistakenly sums itself (N152:N161).
  // Match the other weekly counts by summing the daily-flight column instead.
  if(sheet.name==='Mar'&&sheet.getCell('N152').formula==='SUM(N152:N161)')sheet.getCell('N152').value={formula:'SUM(L152:L161)'};
  sheet.eachRow(row=>row.eachCell(cell=>{cell.note=undefined;if(cell.isMerged&&cell.master!==cell)return;if(cell.row>=6&&cell.row<6+days*5&&cell.col>=3&&!cell.formula)cell.value=null;}));
 }
 const summary=da.getWorksheet('Summary Page');
 for(let i=0;i<12;i++){const sheet=da.worksheets[i];let otp;sheet.eachRow((row,n)=>{if(row.getCell(11).value==='OTP')otp=n;});if(otp)summary.getCell(i+1,2).value={formula:sheet.name+'!M'+otp};}
 da.creator='Hallmark Aviation Services';da.lastModifiedBy=da.creator;da.calcProperties.fullCalcOnLoad=true;
 await da.xlsx.writeFile(path.join(dir,'da-2026.xlsx'));
 console.log('Prepared sanitized templates with original WWH formulas and formatting.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
