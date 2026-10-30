const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),Excel=require('exceljs'),express=require('express'),Database=require('better-sqlite3');
const forms=require('../hasReportForms'),{registerHasReports}=require('../hasReports'),{calculate}=require('../public/public/has-report-math');
const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip');
test('every editable form cell survives export, including empty styled cells and later lines',async()=>{
 for(const kind of forms.kinds){const model=await forms.template(kind,'2026-10',{}),expected={};
  for(const [address,cell] of Object.entries(model.cells))if(cell.editable)expected[address]=cell.value=cell.formulaAllowed?1.25:'Entry '+address;
  const book=new Excel.Workbook();await book.xlsx.load(await forms.exportForm(model));
  for(const [address,value] of Object.entries(expected))assert.equal(book.worksheets[0].getCell(address).value,value,kind+' '+address);
 }
});
test('forms retain template structure and formulas with blank private inputs',async()=>{
 for(const kind of forms.kinds){
  const model=await forms.template(kind,'2026-10',{station:'LAX',account:'MU'});
  assert(Object.entries(model.cells).filter(([address,c])=>c.editable).every(([address,c])=>c.value===''||c.value==='LAX/MU'&&(kind==='terrific'?/^F\d+$/.test(address):address==='A7')));
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

test('Terrific Ten dynamic rows export populated cells while preserving other workbook parts',async()=>{
 const original=await JSZip.loadAsync(await fs.readFile('data/has-report-templates/terrific.xlsx'));
 for(const count of [1,14,23]){
  const model=await forms.template('terrific','2026-10',{}, {terrificRows:count}),address='G'+(count+2);assert.equal(model.rows,count+2);assert(model.cells[address].editable);model.cells[address].value='Last recipient '+count;
  const bytes=await forms.exportForm(model),book=new Excel.Workbook();await book.xlsx.load(bytes);assert.equal(book.worksheets[0].rowCount,count+2);assert.equal(book.worksheets[0].getCell(address).value,'Last recipient '+count);
  const exported=await JSZip.loadAsync(bytes);for(const name of Object.keys(original.files))if(!original.files[name].dir&&name!=='xl/worksheets/sheet1.xml')assert.deepEqual(await exported.file(name).async('nodebuffer'),await original.file(name).async('nodebuffer'));
 }
});

test('Terrific Ten rows persist, reject stale layouts, and require confirmation for populated removal',async t=>{
 const db=new Database(':memory:'),app=express();app.use(express.json());const user={position:'Supervisor',station:'LAX',account:'MU',name:'Editor'},service=registerHasReports(app,{employees:{db},reportDb:db,profiles:{linked:u=>u.uid==='lead'?{...user,position:'Lead'}:user},authenticate:async req=>({uid:req.headers.authorization})}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(path='',body,who='sup')=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/has-report-api/terrific/2026-10'+path,{headers:{Authorization:who,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 assert.equal((await request('/rows',{revision:0,delta:1},'lead')).status,403);assert.equal((await request('/rows',{revision:0,delta:1})).status,200);assert.equal((await request('/rows',{revision:0,delta:1})).status,409);
 let state=(await request()).data;assert.equal(state.rows,16);assert.equal(state.layoutRevision,1);assert.equal((await request('',{revision:1,layoutRevision:0,values:{G16:'stale'}})).status,409);
 assert.equal((await request('',{revision:state.revision,layoutRevision:state.layoutRevision,values:{G16:'Keep until confirmed'}})).status,200);state=(await request()).data;
 assert.equal((await request('/rows',{revision:state.revision,layoutRevision:state.layoutRevision,delta:-1})).status,409);assert.equal((await request('/rows',{revision:state.revision,layoutRevision:state.layoutRevision,delta:-1,confirmRemoval:true})).status,200);state=(await request()).data;assert.equal(state.rows,15);assert.equal(state.cells.G16,undefined);assert.equal(state.values.G16,undefined);
});

test('Expense and all Terrific Ten Account rows use the active scope and preserve manual account text in exports',async()=>{for(const kind of forms.kinds){const model=await forms.template(kind,'2026-10',{station:'SFO',account:'XX'},kind==='terrific'?{terrificRows:20}:{}),address=kind==='terrific'?'F3':'A7';assert.equal(model.cells[address].value,'SFO/XX');if(kind==='terrific')assert.equal(model.cells.F22.value,'SFO/XX');model.cells[address].value='Manual department';const book=new Excel.Workbook();await book.xlsx.load(await forms.exportForm(model));assert.equal(book.worksheets[0].getCell(address).value,'Manual department');}});
