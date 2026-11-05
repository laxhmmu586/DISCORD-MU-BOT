const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerWorkspacePagePermissions}=require('../has/server/workspacePagePermissions');

test('workspace policies protect dedicated APIs and restrict management to the two configured identities',async t=>{
 const db=new Database(':memory:'),app=express();
 const people=[{id:'lead',position:'Lead'},{id:'agent',position:'Agent'}];
 registerWorkspacePagePermissions(app,{
  employees:{db,get:()=>({employees:people})},profiles:{linked:user=>people.find(row=>row.id===user.email)},
  authenticate:async req=>{if(!req.get('Authorization'))throw Error('Missing authorization');return {email:req.get('Authorization')};}
 });
 app.get('/staff-schedule-api',(_,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const call=(path,email,body)=>fetch('http://127.0.0.1:'+server.address().port+path,{headers:{Authorization:email,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const permission='/has-page-api/schedule/permissions',access='/has-page-api/schedule/access';
 assert.equal((await call(permission,'lax@mu.com')).status,403);
 assert.equal((await call(permission,'lax@mu.com',{restricted:true,revision:0,roles:['Lead'],members:[]})).status,403);
 assert.equal((await call(permission,'nextweek1216@gmail.com')).status,200);
 assert.equal((await call(permission,'lake@mu.com',{restricted:true,revision:0,roles:['Lead'],members:[]})).status,200);
 assert.deepEqual(await (await call(access,'agent')).json(),{canAccess:false});
 assert.equal((await call('/staff-schedule-api','agent')).status,403);
 assert.equal((await call('/staff-schedule-api','lead')).status,200);
});

test('account audiences migrate existing policies and authorize primary and additional station accounts',async t=>{
 const db=new Database(':memory:'),app=express();
 t.after(()=>db.close());
 db.exec("CREATE TABLE page_view_permissions(page TEXT PRIMARY KEY, revision INTEGER NOT NULL, roles TEXT NOT NULL, members TEXT NOT NULL); INSERT INTO page_view_permissions VALUES ('schedule',2,'[\"Lead\"]','[\"selected\"]')");
 const people=[
  {id:'primary',position:'Agent',station:'LAX',account:'MU'},
  {id:'additional',position:'Agent',station:'LAX',account:'CI',additionalAccounts:[{station:'LAX',account:'MU'}]},
  {id:'other-station',position:'Agent',station:'SFO',account:'MU'},
  {id:'other-account',position:'Agent',station:'LAX',account:'CI'},
  {id:'lead',position:'Lead',station:'SFO',account:'MU'},
  {id:'selected',position:'Agent',station:'LAX',account:'CI'}
 ];
 registerWorkspacePagePermissions(app,{
  employees:{db,get:()=>({employees:people})},profiles:{linked:user=>people.find(row=>row.id===user.email)},
  authenticate:async req=>({email:req.get('Authorization')})
 });
 app.get('/staff-schedule-api',(_,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const call=(path,email,body)=>fetch('http://127.0.0.1:'+server.address().port+path,{headers:{Authorization:email,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const path='/has-page-api/schedule/permissions',access='/has-page-api/schedule/access';
 const migrated=await (await call(path,'lake@mu.com')).json();
 assert.deepEqual(migrated.accounts,[]);assert.equal(migrated.revision,2);assert.deepEqual(migrated.roles,['Lead']);assert.deepEqual(migrated.members,['selected']);
 assert(migrated.accountOptions.some(scope=>scope.station==='LAX'&&scope.account==='MU'));
 const policy={revision:2,restricted:true,roles:['Lead'],members:['selected'],accounts:[{station:'lax',account:'mu'},{station:'LAX',account:'MU'}]};
 const saved=await (await call(path,'lake@mu.com',policy)).json();
 assert.deepEqual(saved.accounts,[{station:'LAX',account:'MU'}]);assert.equal(saved.revision,3);
 for(const id of ['primary','additional','lead','selected']){
  assert.deepEqual(await (await call(access,id)).json(),{canAccess:true},id);
  assert.equal((await call('/staff-schedule-api',id)).status,200,id);
 }
 for(const id of ['other-station','other-account','unlinked']){
  assert.deepEqual(await (await call(access,id)).json(),{canAccess:false},id);
  assert.equal((await call('/staff-schedule-api',id)).status,403,id);
 }
 assert.equal((await call(path,'lake@mu.com',policy)).status,409);
 for(const accounts of [null,[{}],[{station:'LAX',account:'UNKNOWN'}]])assert.equal((await call(path,'lake@mu.com',{...policy,revision:3,accounts})).status,400);
 // An older open editor can update roles without deleting account grants it cannot display.
 const legacy=await (await call(path,'lake@mu.com',{revision:3,restricted:true,roles:[],members:[]})).json();
 assert.deepEqual(legacy.accounts,saved.accounts);
 assert.equal((await call(path,'primary',{...policy,revision:4})).status,403);
 const reset=await (await call(path,'lake@mu.com',{revision:4,restricted:false,roles:[],members:[],accounts:[]})).json();
 assert.deepEqual(reset.accounts,[]);assert.equal(reset.restricted,false);
 assert.equal((await call('/staff-schedule-api','other-account')).status,200);
});
