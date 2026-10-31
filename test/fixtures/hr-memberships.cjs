const {createFixture}=require('./hr-accounts.cjs');
async function createMembershipFixture(port=0){
 const f=await createFixture(port),current=f.store.get(),rows=[
 {id:'sup-mu',name:'MU Supervisor',position:'Supervisor',station:'LAX',account:'MU'},
 {id:'bm-cz',name:'CZ Manager',position:'Business Manager',station:'LAX',account:'CZ'},
 {id:'sup-cz',name:'CZ Supervisor',position:'Supervisor',station:'LAX',account:'CZ'},
 {id:'second',name:'Second Member',position:'Agent',station:'LAX',account:'CZ',additionalAccounts:[{station:'LAX',account:'MU'}]},
 {id:'third',name:'Third Member',position:'Agent',station:'SFO',account:'CZ',additionalAccounts:[{station:'SFO',account:'MU'},{station:'LAX',account:'MU'}]}
 ].map((row,i)=>({eid:String(3000+i),attach:false,detach:false,spotter:false,...row}));
 f.store.save({...current,employees:[...current.employees,...rows]},{email:'lake@mu.com'});
 const edge=f.db.prepare('INSERT INTO employee_reporting VALUES(?,?)');for(const values of [['sup-cz','bm-cz'],['second','team:LAX:CZ:Supervisor']])edge.run(...values);
 for(const row of rows)f.db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run(row.id,row.id,'password','now');
 require('../../has/server/briefing').registerBriefing(f.app,{employees:{...f.store,db:f.db},profiles:f.profiles,authenticate:async req=>({uid:String(req.headers.authorization||'').replace(/^Bearer /,'')}),now:()=>new Date('2026-10-31T18:00:00Z')});
 const stored=f.db.prepare('SELECT date,data FROM staff_schedule_days').all();for(const day of stored){const value=JSON.parse(day.data);for(const assignment of Object.values(value.assignments||{}))assignment.color=assignment.color||({A:'#4f6200',C:'#99ff00',D:'#ffff00'}[assignment.code]||'#eeeeee');f.db.prepare('UPDATE staff_schedule_days SET data=? WHERE date=?').run(JSON.stringify(value),day.date);}
 const person=async(uid,path,body)=>{const response=await fetch(f.origin+path,{method:body?'POST':'GET',headers:{Authorization:uid,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 return {...f,person};
}
module.exports={createMembershipFixture};
