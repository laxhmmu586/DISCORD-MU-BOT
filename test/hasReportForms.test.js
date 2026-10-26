const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),Excel=require('exceljs'),express=require('express'),Database=require('better-sqlite3');
const forms=require('../hasReportForms'),{registerHasReports}=require('../hasReports'),{calculate}=require('../public/public/has-report-math');
const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip');
test('forms retain template structure and formulas with blank private inputs',async()=>{
 for(const kind of forms.kinds){
  const model=await forms.template(kind,'2026-10',{station:'LAX',account:'MU'});
  assert(Object.values(model.cells).filter(c=>c.editable).every(c=>c.value===''));
  assert.doesNotThrow(()=>calculate(model.cells));
  if(kind==='terrific'){assert.equal(model.cells.A2.value,'Amount ($) *');assert.match(model.cells.G2.value,/1500 character/);}
  const address=kind==='terrific'?'C4':'A4';model.cells[address].value='Entered & checked <value>';
  if(kind==='expense'){model.cells.H48.value=9.54;model.cells.J48.value=9.54;model.cells.H49.value=98.66;model.cells.J49.value=98.66;}
  const result=await forms.exportForm(model),book=new Excel.Workbook();await book.xlsx.load(result);const sheet=book.worksheets[0];
  assert.equal(sheet.getCell(address).value,'Entered & checked <value>');
  assert.deepEqual(sheet.model.merges,model.workbook.worksheets[0].model.merges);
  assert.deepEqual(sheet.pageSetup,model.workbook.worksheets[0].pageSetup);
  if(kind==='expense'){assert(Math.abs(sheet.getCell('J72').result-108.2)<1e-9);assert.equal(sheet.getCell('J72').formula,'J68-J70');}
  const original=await JSZip.loadAsync(await fs.readFile('data/has-report-templates/'+kind+'.xlsx')),exported=await JSZip.loadAsync(result);
  for(const name of Object.keys(original.files))if(!original.files[name].dir&&name!=='xl/worksheets/sheet1.xml')assert.deepEqual(await exported.file(name).async('nodebuffer'),await original.file(name).async('nodebuffer'),name+' preserved');
 }
});
test('form endpoints enforce Supervisor+, shared saves, conflicts, account/month isolation and downloads',async t=>{
 const db=new Database(':memory:'),users={supervisor:{position:'Supervisor',station:'LAX',account:'MU'},lead:{position:'Lead',station:'LAX',account:'MU'},agent:{position:'Agent',station:'LAX',account:'MU'},other:{position:'Supervisor',station:'SFO',account:'XX'},hq:{position:'Supervisor',station:'HQ',account:'HQ'}};
 const app=express();app.use(express.json());const reports=registerHasReports(app,{employees:{db},profiles:{linked:u=>users[u.uid]},authenticate:async req=>({uid:req.headers.authorization})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{reports.close();server.close();db.close();});
 const request=async(user,path,body)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/has-report-api'+path,{headers:{Authorization:user,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:res.status,data:res.headers.get('Content-Type').includes('json')?await res.json():Buffer.from(await res.arrayBuffer())};};
 for(const kind of forms.kinds){
  const url='/'+kind+'/2026-10',address=kind==='terrific'?'C4':'A4';
  for(const user of ['lead','agent','hq'])for(const suffix of ['', '/export','/updates','/stream'])assert.equal((await request(user,url+suffix)).status,403);
  assert.equal((await request('lead',url,{revision:0,values:{[address]:'Denied'}})).status,403);
  assert.equal((await request('supervisor',url,{revision:0,values:{[address]:'Saved'}})).status,200);
  assert.equal((await request('supervisor',url)).data.cells[address].value,'Saved');
  assert.equal((await request('supervisor',url,{revision:0,values:{[address]:'Conflict'}})).status,409);
  assert.equal((await request('other',url)).data.cells[address].value,'');
  assert.equal((await request('supervisor','/'+kind+'/2026-11')).data.cells[address].value,'');
  assert.equal((await request('supervisor',url,{revision:1,values:{A1:'Overwrite header'}})).status,400);
  const download=await request('supervisor',url+'/export');assert.equal(download.status,200);const book=new Excel.Workbook();await book.xlsx.load(download.data);assert.equal(book.worksheets[0].getCell(address).value,'Saved');
 }
});
