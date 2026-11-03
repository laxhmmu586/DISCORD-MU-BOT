const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),Database=require('better-sqlite3');
const model=require('../has/public/departure-checklist-model');
async function fixture(t){
 const db=new Database(':memory:'),rows=[['agent','Agent'],['lead','Lead'],['supervisor','Supervisor'],['manager','Business Manager'],['other','Lead']].map(([id,position])=>({id,name:id+' employee',eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 const employees={...require('../has/server/employees').createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>{const person=employees.get().employees.find(row=>row.id===(user.uid==='override'?'agent':user.uid));return user.uid==='override'?{...person,permissionOverrides:{'briefing.edit':true}}:person;}},app=express();app.use(express.json());
 require('../has/server/briefing').registerBriefing(app,{employees,profiles,authenticate:async req=>{if(!req.headers.authorization)throw Error('No auth');return {uid:req.headers.authorization};},etab:{read:async()=>({status:'unavailable'})},now:()=>new Date('2026-11-02T20:00:00Z')});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path,body)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api/checklists'+path,{headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json().catch(()=>({}))};};
 return {db,request};
}

test('template reads and edits require Lead+ in LAX/MU, including Agent override and employee view boundaries',async t=>{
 const {request}=await fixture(t);for(const [user,code] of [[null,401],['agent',403],['override',403],['other',403]]){assert.equal((await request(user,'/templates')).status,code);assert.equal((await request(user,'/templates',model.definitions.avih)).status,code);}
 for(const user of ['lead','supervisor','manager'])assert.equal((await request(user,'/templates')).status,200);
 assert.equal((await request('lead','/templates?view=employee')).status,403);
});
test('both shared templates can be edited, reordered and persisted with concurrent-edit protection and audit',async t=>{
 const {db,request}=await fixture(t);
 for(const type of ['avih','service-dog']){
  const before=(await request('lead','/templates')).data.templates.find(d=>d.type===type);const next={...before,title:'Updated '+type,items:[{id:crypto.randomUUID(),zh:'新检查项',en:'New item'},...before.items.slice(1).reverse()]};
  const saved=await request('lead','/templates',next);assert.equal(saved.status,200);assert.equal(saved.data.revision,1);assert.equal(saved.data.items[0].en,'New item');assert.equal((await request('supervisor','/templates',next)).status,409);
  const row=db.prepare('SELECT * FROM briefing_checklist_templates WHERE type=?').get(type);assert.equal(JSON.parse(row.data).title,'Updated '+type);
  for(const items of [[],[before.items[0],before.items[0]],[{id:'bad!',zh:'x',en:'y'}]])assert.equal((await request('lead','/templates',{...saved.data,items})).status,400);
 }
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM briefing_audit WHERE field='checklist-template'").get().n,2);
});
test('templates do not create passenger/checklist records and retired form endpoints are unavailable',async t=>{
 const {db,request}=await fixture(t);assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='briefing_departure_checklists'").get(),undefined);
 assert.equal((await request('lead','?date=2026-11-02&flight=MU586')).status,404);assert.equal((await request('lead','',{date:'2026-11-02',flight:'MU586'})).status,404);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_checklist_templates').get().n,3);
});
test('printing produces blank paper templates with all source items and no filled checks or values',()=>{
 for(const [type,count,sheets] of [['avih',15,1],['service-dog',12,2]]){const def=model.definitions[type],html=model.printHtml(def);assert.equal((html.match(/class="cl-print-tick">☐/g)||[]).length,count);assert(!html.includes('☑'));assert(!/<input|<textarea|<select/.test(html));assert(!html.includes('MU586'));assert.equal((html.match(/class="cl-paper /g)||[]).length,sheets);assert(html.includes('Passenger / 旅客'));assert(html.includes('值机员 / Agent:'));if(type==='avih')assert(html.includes('起飞____分钟后'));else assert(html.includes('second check at the boarding gate'));}
 const def=structuredClone(model.definitions.avih);def.items[0].en='<script>alert(1)</script>';const html=model.printHtml(def);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));
});
test('VIP includes seven items and custom templates can be created and renamed',async t=>{
 const {request}=await fixture(t);
 const list=(await request('lead','/templates')).data.templates;
 assert.equal(list.find(template=>template.type==='vip').items.length,7);
 const created=await request('lead','/templates',{type:null,name:'Custom',title:'检查单',subtitle:'Checklist',items:[{id:'first',zh:'检查',en:'Check'}]});
 assert.equal(created.status,200);
 assert.match(created.data.type,/^custom-/);
 const updated=await request('lead','/templates',{...created.data,name:'Renamed',title:'新标题'});
 assert.equal(updated.status,200);
 assert.equal((await request('lead','/templates')).data.templates.find(template=>template.type===created.data.type).name,'Renamed');
});
