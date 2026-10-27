const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const Word=require('../hasWordReports'),Emergency=require('../hasEmergencyChecklist');
const JSZip=require('node:module').createRequire(require.resolve('exceljs'))('jszip');
async function fixture(t){
 const express=require('express'),Database=require('better-sqlite3'),db=new Database(':memory:'),app=express();
 const users={};for(const role of ['Agent','CSA','Lead','Supervisor','Senior Supervisor','Duty Manager','Business Manager','Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'])users[role]={position:role,station:'LAX',account:'MU',name:role,additionalAccounts:[{station:'SFO',account:'XX'}]};
 users.other={position:'Business Manager',station:'SFO',account:'XX',name:'Other'};users.hq={position:'Supervisor',station:'HQ',account:'HQ'};
 app.use(express.json());const reports=require('../hasReports').registerHasReports(app,{employees:{db},profiles:{linked:u=>users[u.uid]},authenticate:async req=>{const uid=req.headers.authorization;if(!users[uid])throw Error();return {uid};}});
 app.use(express.static(path.join(__dirname,'../public/public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{reports.close();server.close();db.close();});
 const request=(user,url,body)=>fetch('http://127.0.0.1:'+server.address().port+'/has-report-api'+url,{headers:{authorization:user,'content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 return {request,users};
}
test('Word packages fill every declared slot and preserve all non-content parts',async()=>{
 for(const kind of Word.kinds){
  const spec=Word.definition(kind),source=await JSZip.loadAsync(await fs.readFile(path.join(__dirname,'../data/has-word-templates',kind+'.docx')));
  const values=Object.fromEntries(spec.fields.map((f,i)=>[f.key,f.type==='checkbox'?true:f.type==='date'?'2026-10-27':f.type==='textarea'?'Review & follow up\nSecond line <verified>':`Field ${i}`]));
  const blank=await JSZip.loadAsync(await Word.exportWord(kind)),filled=await JSZip.loadAsync(await Word.exportWord(kind,values)),xml=await filled.file('word/document.xml').async('string');
  assert.doesNotMatch(xml,/\{\{[a-z0-9_]+\}\}/);
  for(const field of spec.fields)if(!['checkbox','date'].includes(field.type))assert.ok(xml.includes(field.type==='textarea'?'Review &amp; follow up':values[field.key]),kind+': '+field.key);
  assert.match(xml,/<w:br\/>/);for(const name of Object.keys(source.files))if(!source.files[name].dir&&name!=='word/document.xml')assert.deepEqual(await filled.file(name).async('nodebuffer'),await source.file(name).async('nodebuffer'),kind+': '+name);
  if(kind==='cos'){assert.ok(spec.fields.every(field=>field.fallback===''));assert.doesNotMatch(await blank.file('word/document.xml').async('string'),/\{\{[a-z0-9_]+\}\}/);}
 }
 assert.throws(()=>Word.validate('cos',{bad:'value'}),/Unknown/);assert.throws(()=>Word.validate('cos',{status_0:'true'}),/checkbox/);assert.throws(()=>Word.validate('cos',{notice:'2026-02-30'}),/date/);assert.throws(()=>Word.validate('cos',{name:'\u0000'}),/Invalid/);
});
test('All Supervisor+ Word forms use only primary Main Account; deny lower roles and stale edits',async t=>{
 const {request,users}=await fixture(t);
 for(const role of Object.keys(users)){
  const allowed=!['Agent','CSA','Lead','hq'].includes(role),ctx=await (await request(role,'/context')).json();
  for(const kind of Word.kinds){assert.equal(ctx.permissions[kind],allowed);assert.equal((await request(role,'/word/'+kind)).status,allowed?200:403);}
 }
 const body={revision:0,values:{name:'Primary account only'},station:'SFO',account:'XX',scope:{station:'SFO',account:'XX'}};
 assert.equal((await request('Business Manager','/word/cos?station=SFO&account=XX',body)).status,200);
 const own=await (await request('Business Manager','/word/cos')).json();assert.equal(own.values.name,'Primary account only');assert.deepEqual(own.scope,{station:'LAX',account:'MU'});
 assert.deepEqual((await (await request('other','/word/cos')).json()).values,{});
 assert.equal((await request('Business Manager','/word/cos',body)).status,409);
 for(const role of ['Agent','CSA','Lead','hq'])for(const kind of Word.kinds){assert.equal((await request(role,'/word/'+kind,{revision:0,values:{}})).status,403);assert.equal((await request(role,'/word/'+kind+'/export')).status,403);}
 const download=await request('Business Manager','/word/cos/export?account=XX');assert.equal(download.status,200);assert.match(download.headers.get('content-type'),/wordprocessingml/);assert.match(await (await JSZip.loadAsync(await download.arrayBuffer())).file('word/document.xml').async('string'),/Primary account only/);
 users['Business Manager'].position='Lead';assert.equal((await request('Business Manager','/word/cos/export')).status,403);
 assert.equal((await request('unknown','/word/cos')).status,401);
});
test('Checklist category order, per-item Agent access and scoped emergency editing/download',async t=>{
 const {request}=await fixture(t);
 const sup=await (await request('Supervisor','/checklist')).json();assert.deepEqual(sup.categories.map(c=>c.name),['SAFETY','Workers Comp']);assert.deepEqual(sup.categories.map(c=>c.items.length),[3,3]);
 for(const role of ['Agent','CSA','Lead']){
  assert.equal((await (await request(role,'/context')).json()).canChecklist,true);
  const list=await (await request(role,'/checklist')).json();assert.deepEqual(list.categories.map(c=>c.name),['SAFETY']);assert.deepEqual(list.categories[0].items.map(i=>i.id),['bomb-threat','emergency-notification']);
  for(const action of ['preview','export'])for(const id of ['incident-occurrence','concentra','lax-reliant','ca-mpn'])assert.equal((await request(role,'/checklist/'+id+'/'+action)).status,403);
  assert.equal((await request(role,'/checklist/bomb-threat/export')).status,200);assert.equal((await request(role,'/checklist/emergency-notification/export')).status,200);
  assert.equal((await request(role,'/checklist/emergency-notification/content',{revision:0,values:{paragraph_11:'Phone: 123'}})).status,403);
 }
 assert.equal((await request('hq','/checklist')).status,403);
 for(const category of sup.categories)for(const item of category.items){
  if(item.format==='pdf'){const result=await request('Supervisor','/checklist/'+item.id+'/export');assert.equal(result.status,200);const source=require('../hasChecklists').items.find(i=>i.id===item.id);assert.deepEqual(Buffer.from(await result.arrayBuffer()),await fs.readFile(path.join(__dirname,'../data/has-checklists',source.file)));}
 }
 const edit={revision:0,values:{paragraph_11:'Phone: 555-0100\nLAX/MU only'},scope:{station:'SFO',account:'XX'}};
 assert.equal((await request('Business Manager','/checklist/emergency-notification/content',edit)).status,200);assert.equal((await request('Business Manager','/checklist/emergency-notification/content',edit)).status,409);
 const current=await (await request('Agent','/checklist/emergency-notification/content')).json();assert.equal(current.values.paragraph_11,edit.values.paragraph_11);assert.equal(current.canEdit,false);assert.deepEqual(current.scope,{station:'LAX',account:'MU'});
 assert.deepEqual((await (await request('other','/checklist/emergency-notification/content')).json()).values,{});
 const downloaded=await request('Agent','/checklist/emergency-notification/export'),zip=await JSZip.loadAsync(await downloaded.arrayBuffer());assert.match(await zip.file('word/document.xml').async('string'),/555-0100/);
 assert.deepEqual(await Emergency.exportWord(),await fs.readFile(path.join(__dirname,'../data/has-checklists/emergency-procedure-notification.docx')));
});
test('Recharge headings are scoped labels and do not change WWH manual hours or charge roles',async t=>{
 const {request}=await fixture(t);
 assert.equal((await request('Business Manager','/wwh/2026-10',{revision:0,values:{K5:7}})).status,200);
 assert.equal((await request('Lead','/rechargeable/2026-10',{revision:0,roleLabels:['A','B','C']})).status,403);
 assert.equal((await request('Business Manager','/rechargeable/2026-10',{revision:0,roleLabels:['','','']})).status,400);
 const labels=['Ground Staff','Team Leader','Duty Lead'];assert.equal((await request('Business Manager','/rechargeable/2026-10',{revision:0,roleLabels:labels,scope:{station:'SFO',account:'XX'}})).status,200);
 const current=await (await request('Business Manager','/rechargeable/2026-10')).json();assert.deepEqual(current.roleLabels,labels);assert.equal(current.rechargeLinked,false);
 assert.equal((await (await request('Business Manager','/wwh/2026-10')).json()).cells.K5.value,7);
 assert.equal((await (await request('other','/rechargeable/2026-10')).json()).roleLabels,undefined);
 assert.equal((await request('Business Manager','/rechargeable/2026-10',{revision:0,roleLabels:labels})).status,409);
 const entry={day:2,lines:[{row:23,name:'Example',role:'Agent',category:'ST',hours:2}]};assert.equal((await request('Business Manager','/rechargeable/2026-10',{revision:1,entry})).status,200);
 const saved=await (await request('Supervisor','/rechargeable/2026-10')).json();assert.deepEqual(saved.roleLabels,labels);assert.equal(saved.entries[0].lines[0].role,'Agent');
});
