const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),Database=require('better-sqlite3');
const model=require('../has/public/departure-checklist-model');
async function fixture(t){
 const db=new Database(':memory:'),rows=[['agent','Agent'],['lead','Lead'],['supervisor','Supervisor'],['manager','Business Manager'],['other','Lead']].map(([id,position])=>({id,name:id+' employee',eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 const employees={...require('../has/server/employees').createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>{const person=employees.get().employees.find(row=>row.id===(user.uid==='override'?'agent':user.uid));return user.uid==='override'?{...person,permissionOverrides:{'briefing.edit':true}}:person;}},app=express();app.use(express.json());
 require('../has/server/briefing').registerBriefing(app,{employees,profiles,authenticate:async req=>{if(!req.headers.authorization)throw Error('No auth');return {uid:req.headers.authorization};},etab:{read:async()=>({status:'unavailable'})},now:()=>new Date('2026-11-02T20:00:00Z')});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path,body)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api/checklists'+path,{headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
 const form=(type='avih',changes={})=>({...model.blank(type),id:crypto.randomUUID(),date:'2026-11-02',flight:'MU586',direction:'departure',type,templateRevision:0,...changes});return {db,request,form};
}
test('checklist reads, writes and shared templates require Lead+ in LAX/MU, even with an Agent permission override',async t=>{
 const {request,form}=await fixture(t),path='?date=2026-11-02&flight=MU586';
 for(const [user,code] of [[null,401],['agent',403],['override',403],['other',403]]){
  assert.equal((await request(user,path)).status,code);assert.equal((await request(user,'',form())).status,code);assert.equal((await request(user,'/templates')).status,code);assert.equal((await request(user,'/templates',model.definitions.avih)).status,code);
 }
 for(const user of ['lead','supervisor','manager']){assert.equal((await request(user,path)).status,200);assert.equal((await request(user,'/templates')).status,200);}
 assert.equal((await request('lead',path+'&view=employee')).status,403);
 assert.equal((await request('lead','?date=2026-11-02&flight=MU583')).status,400);
 assert.equal((await request('lead','',form('avih',{direction:'arrival'}))).status,400);
});
test('multiple passenger forms persist independently by date, flight and type with conflict detection and auditing',async t=>{
 const {db,request,form}=await fixture(t),a=form(),b=form(),c=form('service-dog',{flight:'MU578'});a.values.passenger='Passenger A';a.values.telegramMinutes='15';a.checks[0]=true;b.values.passenger='Passenger B';
 for(const row of [a,b,c]){const response=await request('lead','',row);assert.equal(response.status,200);assert.equal(response.data.revision,1);}
 const list=(await request('lead','?date=2026-11-02&flight=MU586')).data.forms;assert.equal(list.length,2);assert.equal(list.find(row=>row.id===a.id).checks[0],true);assert.equal(list.find(row=>row.id===b.id).values.passenger,'Passenger B');
 assert.equal((await request('lead','?date=2026-11-03&flight=MU586')).data.forms.length,0);
 assert.equal((await request('lead','',a)).status,409);
 const saved=list.find(row=>row.id===a.id);saved.values.officer='Lead Officer';assert.equal((await request('supervisor','',saved)).status,200);
 assert.equal((await request('lead','',{...saved,flight:'MU578'})).status,409);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM briefing_audit WHERE field='departure-checklist'").get().n,4);
});
test('template edits support reorder/add/remove, preserve saved snapshots and reject stale forms or concurrent editors',async t=>{
 const {db,request,form}=await fixture(t),a=form();assert.equal((await request('lead','',a)).status,200);
 const original=(await request('lead','/templates')).data.templates.find(def=>def.type==='avih');assert.equal(original.items.length,15);
 const edited={...original,title:'Updated AVIH title',items:[{id:crypto.randomUUID(),zh:'新的检查项',en:'New check'},...original.items.slice(1).reverse()]};
 const changed=await request('lead','/templates',edited);assert.equal(changed.status,200);assert.equal(changed.data.revision,1);assert.equal((await request('supervisor','/templates',edited)).status,409);
 assert.equal((await request('lead','',form())).status,409);
 const b=form();b.templateRevision=1;assert.equal((await request('lead','',b)).status,200);
 const forms=(await request('lead','?date=2026-11-02&flight=MU586')).data.forms;const old=forms.find(row=>row.id===a.id),fresh=forms.find(row=>row.id===b.id);assert.equal(old.template.title,original.title);assert.equal(fresh.template.title,'Updated AVIH title');assert.equal(fresh.template.items[0].en,'New check');
 old.checks[0]=true;assert.equal((await request('lead','',old)).status,200);
 assert.equal((await request('lead','/templates',{...changed.data,items:[]})).status,400);
 assert.equal((await request('lead','/templates',{...changed.data,items:[original.items[0],original.items[0]]})).status,400);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM briefing_audit WHERE field='checklist-template'").get().n,1);
});
test('invalid form values cannot overwrite stored checklists',async t=>{
 const {request,form}=await fixture(t);
 for(const change of [{type:'constructor'},{id:'bad'},{revision:-1},{checks:[]},{checks:Array(15).fill('yes')},{values:{...model.blank('avih').values,telegramMinutes:'-1'}},{values:{...model.blank('avih').values,notes:'x'.repeat(2001)}},{values:{...model.blank('avih').values,unknown:'field'}}])assert.equal((await request('lead','',form('avih',change))).status,400);
});
test('print documents retain source items, checkmarks, entered values, and escape editable template text',()=>{
 for(const [type,count,sheets] of [['avih',15,1],['service-dog',12,2]]){
  const state={...model.blank(type),type,flight:'MU586',date:'2026-11-02'};assert.equal(state.checks.length,count);state.checks[0]=true;state.values.passenger='<script>alert(1)</script>';state.values.telegramMinutes='15';state.values.notes='Line 1\nLine 2';const html=model.printHtml(state);
  assert.equal((html.match(/class="cl-paper /g)||[]).length,sheets);assert(html.includes('☑'));assert(html.includes('☐'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('MU586'));assert(html.includes('Line 1\nLine 2'));
  if(type==='avih')assert(html.includes('起飞15分钟后'));else{assert(html.includes('0.5 IU/ml'));assert(html.includes('second check at the boarding gate'));assert(html.includes('PETC'));}
 }
});
