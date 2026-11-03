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
