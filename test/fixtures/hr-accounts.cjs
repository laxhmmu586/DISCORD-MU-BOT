const express=require('express'),Database=require('better-sqlite3');
const {createEmployeeStore,registerEmployees}=require('../../has/server/employees'),{createProfileStore}=require('../../has/server/employeeProfiles');
async function createFixture(port=0){
 const db=new Database(':memory:');
 const seed=[{id:'owner',name:'Owner',position:'Business Manager',loginId:'lake@mu.com'},
 {id:'bm',name:'Business Manager',position:'Business Manager',loginId:'bm@example.test'},
 {id:'existing',name:'Existing Employee',nickname:'Existing',position:'Agent',eid:'21470',code:'23239',pbbId:'TBIT-1',pbbExpiry:'2027-12-31',additionalAccounts:[{station:'LAX',account:'CZ'}]},
 {id:'signup',name:'',nickname:'Q',position:'Agent',loginId:'signup@example.test',station:'LAX',account:'CZ'},
 {id:'other-google',name:'Other Google Employee',position:'Agent'},
 {id:'foreign',name:'Foreign Employee',position:'Agent',station:'SFO',account:'MU'}].map(row=>({station:'LAX',account:'MU',attach:false,detach:false,spotter:false,...row}));
 const store=createEmployeeStore(db,{seed});store.save(store.get(),{email:'lake@mu.com'});const profiles=createProfileStore({...store,db});
 for(const row of [['owner','owner','password'],['bm','bm','password'],['existing-password','existing','password'],['google-signup','signup','google.com'],['other-google-uid','other-google','google.com']])db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run(...row,'2026-10-31');
 const app=express();app.use(express.json());
 const authenticate=async req=>{const uid=String(req.headers.authorization||req.headers['x-user']||'').replace(/^Bearer /,'');if(!uid)throw Error('Sign in required');return {uid,email:uid==='owner'?'lake@mu.com':uid==='other-admin'?'tamsun10@gmail.com':uid+'@example.test'};};
 let changes=0;registerEmployees(app,{store,profiles,authenticate,firebaseDirectory:{list:async()=>[],get:async()=>null,setDisabled:async()=>{}},onChange:()=>changes++});
 db.prepare('INSERT OR REPLACE INTO employee_reporting VALUES(?,?)').run('existing','bm');
 // The same store backs the homepage roster fixture; no production data is used.
 require('../../has/server/staffSchedule').registerStaffSchedule(app,{employees:{...store,db},profiles,authenticate,now:()=>new Date('2026-10-31T18:00:00Z')});
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run('2026-10-31',JSON.stringify({assignments:{bm:{code:'D'},existing:{code:'C'},signup:{code:'A'}}}));
 const initial=db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data,links=db.prepare('SELECT * FROM employee_accounts').all();
 app.post('/test-reset',(req,res)=>{db.transaction(()=>{db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(initial);db.exec('DELETE FROM employee_accounts;DELETE FROM employee_google_link_audit;DELETE FROM employee_profile_merges');const insert=db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)');for(const row of links)insert.run(row.uid,row.employee_id,row.provider,row.created_at);})();res.json({ok:true});});
 app.get('/profile-api',(req,res)=>{const uid=String(req.headers.authorization||'').replace(/^Bearer /,'');res.json(profiles.status({uid,email:uid==='owner'?'lake@mu.com':uid+'@example.test',provider:'password'}));});app.get('/has-report-api/context',(req,res)=>res.json({permissions:{},canAdmin:true}));
 app.use(require('../../has/static').withShared(require('node:path').join(__dirname,'../../public/public')));
 const server=app.listen(port,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const request=async(role,path='',body)=>{const response=await fetch(origin+'/employee-admin-api/organization'+path,{method:body?'POST':'GET',headers:{...(role?{Authorization:role}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 return {app,db,store,profiles,origin,request,get changes(){return changes;},close(){server.closeAllConnections();server.close();db.close();}};
}
module.exports={createFixture};
