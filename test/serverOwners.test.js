const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const owners=require('../has/server/serverOwners'),policy=require('../has/public/employee-permissions'),model=require('../has/public/organization-model');
test('server owners use exact identities and all catalog permissions override role defaults and denials',()=>{
 for(const email of ['lax@mu.com','nextweek1216@gmail.com',' LAX@MU.COM ','lake@mu.com']){assert(owners.isOwner(email));for(const {key} of policy.catalog)assert(policy.allowed({loginId:email,position:'Agent',permissionOverrides:{[key]:false}},key));}
 for(const email of ['lax@mu.com.attacker.test','nextweek1216+other@gmail.com','tamsun10@gmail.com'])assert(!owners.isOwner(email));
 assert(!policy.allowed({position:'Agent',email:'lax@mu.com'},'schedule.edit'));
 assert(!policy.allowed({loginId:'lax@mu.com'},'unknown'));
});
test('both owners manage all HR accounts, their own profile and permission overrides',async t=>{
 const db=new Database(':memory:'),{createEmployeeStore,registerEmployees}=require('../has/server/employees');
 const store=createEmployeeStore(db,{seed:[['one','lax@mu.com'],['two','nextweek1216@gmail.com'],['other','other@example.test']].map(([id,loginId])=>({id,loginId,name:id,position:'Agent',station:id==='other'?'SFO':'LAX',account:'MU',attach:false,detach:false,spotter:false}))});
 const app=express();app.use(express.json());registerEmployees(app,{store,profiles:{linked:user=>store.get().employees.find(row=>row.id===user.uid)},authenticate:async req=>({uid:req.get('X-User'),email:store.get().employees.find(row=>row.id===req.get('X-User'))?.loginId})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=(id,path='',body)=>fetch('http://127.0.0.1:'+server.address().port+'/employee-admin-api/organization'+path,{method:body?'POST':'GET',headers:{'X-User':id,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 for(const id of ['one','two']){const view=await(await request(id)).json();assert(view.access.isServerOwner);assert(view.access.canManagePending);assert.equal(view.employees.length,3);assert(model.canEdit(view.employees.find(row=>row.id===id),view.access,view.employees));
 assert.equal((await request(id,'',{id,revision:store.get().revision,changes:{nickname:'Owner'}})).status,200);
 for(const target of [id,'other'])assert.equal((await request(id,'/permissions',{id:target,revision:store.get().revision,permissions:{'schedule.edit':true}})).status,200);}
 assert.equal((await request('other')).status,403);
 let data=store.get();data.employees.push(...[['gm','General Manager','OPS'],['bm-mu','Business Manager','MU'],['bm-ek','Business Manager','EK']].map(([id,position,account])=>({id,name:id,position,account,station:'LAX',attach:false,detach:false,spotter:false})));store.save(data,{email:'lax@mu.com'});
 for(const id of ['bm-mu','bm-ek']){const view=await(await request(id)).json();assert.equal(view.employees.find(row=>row.id===id).reportsTo,'gm');assert(view.employees.some(row=>row.id==='gm'),'cross-account General Manager remains visible');}
 assert.equal((await request('one','',{id:'bm-ek',revision:store.get().revision,changes:{reportsTo:'gm'}})).status,200,'same General Manager accepts another account');
});
test('Business Managers default to a unique local General Manager while explicit reporting is retained',()=>{
 const bm={id:'bm',position:'Business Manager',station:'LAX',account:'MU'},gm={id:'gm',position:'General Manager',station:'LAX',account:'OPS'},foreign={...gm,id:'foreign',station:'SFO'};
 const apply=(row,extra=[])=>model.applyDefaultReporting([row,gm,foreign,...extra])[0];
 assert.equal(apply(bm).reportsTo,'gm');assert.equal(apply({...bm,reportsTo:'manual'}).reportsTo,'manual');assert.equal(apply({...bm,unassigned:true}).reportsTo,undefined);
 assert.equal(apply(bm,[{...gm,id:'duplicate'}]).reportsTo,undefined);
 assert.equal(apply(bm,[{...gm,id:'same-account',account:'MU'}]).reportsTo,'same-account');
 assert.equal(apply(bm,[{...gm,id:'cycle',account:'MU',reportsTo:'bm'}]).reportsTo,'gm');
 assert.equal(model.applyDefaultReporting([bm,{...gm,station:'HQ',account:'HQ'}])[0].reportsTo,'gm','shared headquarters General Manager can cover multiple accounts and stations');
});
