const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3'),Excel=require('exceljs');
async function fixture(t){
 const db=new Database(':memory:'),app=express();app.use(express.json());
 const users={mu:{id:'mu',name:'MU Supervisor',position:'Supervisor',station:'LAX',account:'MU'},other:{id:'other',name:'Other Supervisor',position:'Supervisor',station:'SFO',account:'XX'},secondary:{id:'secondary',name:'Shared Supervisor',position:'Supervisor',station:'SFO',account:'XX',additionalAccounts:[{station:'LAX',account:'MU'}]},agent:{id:'agent',name:'MU Agent',position:'Agent',station:'LAX',account:'MU'}};
 const service=require('../has/server/hasReports').registerHasReports(app,{employees:{db},profiles:{linked:u=>users[u.uid]},authenticate:async req=>{if(!users[req.headers.authorization])throw Error('auth');return {uid:req.headers.authorization};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const call=async(user,entry,path,body,scope)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/'+entry+'-report-api'+path,{headers:{Authorization:user,'Content-Type':'application/json',...(scope?{'X-Workspace-Account':JSON.stringify(scope)}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():Buffer.from(await res.arrayBuffer())};};
 return {call,db};
}
test('MUFC exposes only three LAX/MU report types and cannot be redirected to another account',async t=>{
 const {call}=await fixture(t),ctx=await call('secondary','mufc','/context',null,{station:'SFO',account:'XX'});
 assert.equal(ctx.status,200);assert.deepEqual(ctx.data.scope,{station:'LAX',account:'MU'});assert.deepEqual(Object.keys(ctx.data.permissions).filter(k=>ctx.data.permissions[k]),['da','wwh','rechargeable']);assert.equal(ctx.data.canDashboard,false);
 for(const path of ['/context','/da/2026-11','/wwh/2026-11','/rechargeable/2026-11'])assert.equal((await call('other','mufc',path)).status,403);
 for(const path of ['/expense/2026-11','/terrific/2026-11','/cos/2026-11','/dashboard','/checklists','/context/extra'])assert.equal((await call('mu','mufc',path)).status,404);
 assert.equal((await call('agent','mufc','/da/2026-11')).status,403);assert.equal((await call('unknown','mufc','/context')).status,401);
 const has=await call('other','has','/context');assert.deepEqual(has.data.scope,{station:'SFO',account:'XX'},'HAS keeps its own account selection');
});
test('DA/WWH writes and revisions are shared in both directions, while other HAS accounts stay independent',async t=>{
 const {call,db}=await fixture(t);
 const saved=await call('mu','mufc','/da/2026-11',{revision:0,values:{K7:123,L6:1}});assert.equal(saved.status,200);
 const has=await call('mu','has','/da/2026-11');assert.equal(has.data.cells.K7.value,123);assert.equal(has.data.revision,1);
 assert.equal((await call('mu','has','/da/2026-11',{revision:1,values:{K7:234}})).status,200);
 const mufc=await call('secondary','mufc','/da/2026-11',null,{station:'SFO',account:'XX'});assert.equal(mufc.data.cells.K7.value,234);assert.deepEqual(mufc.data.scope,{station:'LAX',account:'MU'});
 assert.equal((await call('mu','mufc','/da/2026-11',{revision:1,values:{K7:999}})).status,409);
 const wwh=await call('mu','mufc','/wwh/2026-11');assert.equal(wwh.data.calculated.AA11,234,'WWH consumes the shared DA');
 assert.equal((await call('mu','has','/wwh/2026-11',{revision:0,values:{F5:40}})).status,200);assert.equal((await call('mu','mufc','/wwh/2026-11')).data.cells.F5.value,40);
 assert.equal((await call('mu','mufc','/wwh/2026-11',{revision:1,values:{G5:2}})).status,200);assert.equal((await call('mu','has','/wwh/2026-11')).data.cells.G5.value,2);
 assert.equal((await call('other','has','/da/2026-11')).data.cells.K7.value,'');
 assert.equal(db.prepare("SELECT count(*) n FROM has_reports WHERE kind='da' AND month='2026-11'").get().n,1,'One shared record, no replication table');
 const exported=await call('mu','mufc','/da/2026-11/export');assert.equal(exported.status,200);const book=new Excel.Workbook();await book.xlsx.load(exported.data);assert.equal(book.getWorksheet('Nov').getCell('K7').value,234);
});
test('Recharge entries, flight edits, WWH linkage and exports share the LAX/MU records',async t=>{
 const {call}=await fixture(t),entry={day:3,flight:'MU586',reason:'Delay',lines:[{name:'Test Agent',role:'Agent',category:'ST',hours:3}]};
 const saved=await call('mu','mufc','/rechargeable/2026-11',{revision:0,entry});assert.equal(saved.status,200);
 let has=await call('mu','has','/rechargeable/2026-11');assert.equal(has.data.entries[0].flight,'MU586');const id=has.data.entries[0].id;
 assert.equal((await call('mu','has','/rechargeable/2026-11',{revision:1,id,entry:{...entry,lines:[{...entry.lines[0],hours:5}]}})).status,200);
 const mufc=await call('mu','mufc','/rechargeable/2026-11');assert.equal(mufc.data.entries[0].lines[0].hours,5);
 assert.equal((await call('mu','mufc','/rechargeable/2026-11',{revision:2,dayFlight:{day:4,flight:'MU583'}})).status,200);has=await call('mu','has','/rechargeable/2026-11');assert.equal(has.data.dayFlights[4],'MU583');
 assert.equal((await call('mu','mufc','/rechargeable/2026-11',{revision:1,id,remove:true})).status,409);
 const wwh=await call('mu','mufc','/wwh/2026-11');assert(Object.values(wwh.data.cells).some(c=>c.linked&&c.value===5));
 const exported=await call('mu','mufc','/rechargeable/2026-11/export');assert.equal(exported.status,200);const book=new Excel.Workbook();await book.xlsx.load(exported.data);assert.equal(book.getWorksheet('4').getCell('B9').value,'MU583');
 assert.equal((await call('other','has','/rechargeable/2026-11')).data.entries.length,0);
});
