const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerHasReports}=require('../has/server/hasReports');
test('Terrific Ten exposes viewer defaults without writing them, validates choices/issuer and preserves shared values',async t=>{
 const db=new Database(':memory:'),app=express();app.use(express.json());
 const users={one:{position:'Supervisor',station:'LAX',account:'MU',name:'First Supervisor'},two:{position:'Supervisor',station:'LAX',account:'MU',name:'Second Supervisor'}};
 const service=registerHasReports(app,{employees:{db},reportDb:db,profiles:{linked:u=>users[u.uid]},authenticate:async req=>({uid:req.headers.authorization})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 async function request(who='one',body,suffix=''){const response=await fetch('http://127.0.0.1:'+server.address().port+'/has-report-api/terrific/2026-11'+suffix,{headers:{Authorization:who,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
 const initial=(await request()).data;assert.equal(initial.revision,0);assert.equal(initial.defaults.issuedBy,users.one.name);assert.equal(initial.defaults.message,'Thank you! Keep up the great work!');assert.equal(initial.cells.E3.value,'');assert.equal(initial.cells.F3.value,'LAX/MU');assert.deepEqual(initial.cells.D3.choices,['Compliment','Manager Direction']);assert.equal(initial.cells.E3.maxLength,50);
 assert.equal((await request('two')).data.defaults.issuedBy,users.two.name);
 for(const values of [{B3:'Must not save',D3:'Other reason'},{B3:'Must not save',E3:'x'.repeat(51)}])assert.equal((await request('one',{revision:0,values})).status,400);
 assert.equal((await request()).data.revision,0);assert.equal((await request()).data.cells.B3.value,'');
 assert.equal((await request('one',{revision:0,values:{B3:'Recipient',D3:'Compliment',E3:users.one.name,F3:'Custom account',G3:'Custom message'}})).status,200);
 const shared=(await request('two')).data;assert.equal(shared.cells.E3.value,users.one.name);assert.equal(shared.cells.F3.value,'Custom account');assert.equal(shared.cells.G3.value,'Custom message');assert.equal(shared.defaults.issuedBy,users.two.name);
 assert.equal((await request('two',{revision:1,values:{D3:'Manager Direction',E3:'x'.repeat(50)}})).status,200);
 const added=await request('one',{revision:2,layoutRevision:0,delta:1},'/rows');assert.equal(added.status,200);
 assert.equal((await request('one',{revision:added.data.revision,layoutRevision:added.data.layoutRevision,delta:-1,confirmRemoval:false},'/rows')).status,200,'a default account does not make an otherwise blank row populated');
});
