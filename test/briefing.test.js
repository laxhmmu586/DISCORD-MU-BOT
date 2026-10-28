const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerBriefing,CONTACTS}=require('../briefing'),{createEmployeeStore}=require('../employees'),{createBriefingEtab}=require('../briefingEtab');
const DATE='2026-10-28';
async function fixture(t){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT);CREATE TABLE staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER,data TEXT)');db.prepare('INSERT INTO employee_avatars VALUES(?,?)').run('agent','data:image/png;base64,photo');
 const rows=[['agent','Agent'],['peer','Agent'],['rest','Agent'],['sup','Supervisor'],['lead','Lead'],['regional','Regional Manager'],['other','Supervisor']].map(([id,position])=>({id,name:id+' employee',nickname:id,eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>employees.get().employees.find(e=>e.id===user.uid)},app=express();app.use(express.json());
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run(DATE,JSON.stringify({assignments:{agent:{code:'A'},peer:{code:'C'},rest:{code:'X'},other:{code:'D'}}}));
 const etab=createBriefingEtab({db});etab.accept({date:DATE,arrival:{flight:'MU583',reg:'B-7369',eta:'1217L',gate:'154',pax:'306/01',crew:'4/17'}},{discordMessageId:'fixture-delivery',receivedAt:DATE+'T16:00:00Z'});
 registerBriefing(app,{employees,profiles,etab,now:()=>new Date(DATE+'T18:00:00Z'),authenticate:async req=>{if(!req.headers.authorization)throw Error();return {uid:req.headers.authorization};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api'+path,{method:body?'POST':'GET',headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};};
 return {db,request,etab};
}
test('linked eligible employees can read ETAB and shared briefing, contacts are role gated',async t=>{
 const {request}=await fixture(t);for(const user of ['agent','lead','sup','regional']){const {status,data}=await request(user,'?date='+DATE);assert.equal(status,200);assert.equal(data.flight,'MU583');assert.equal(data.fields.aircraftType,'777-300');assert.equal(data.etab.pax,'306/01');assert.equal(data.canEditContacts,['sup','regional','lead'].includes(user));assert.deepEqual(data.contacts.rows,CONTACTS);}
 assert.equal((await request(null,'?date='+DATE)).status,401);assert.equal((await request('other','?date='+DATE)).status,403);
 for(const date of ['2026-02-30','bad','2026-00-01'])assert.equal((await request('agent','?date='+date)).status,400);
 assert.equal((await request('agent','?date='+DATE+'&flight=<script>')).status,400);
});
test('time records and manual fields persist per flight/date with audit and stale-field protection',async t=>{
 const {request,db}=await fixture(t),body={date:DATE,flight:'MU583',field:'blockTime',value:'12:42',previous:''};
 assert.equal((await request('agent','',body)).status,200);assert.equal((await request('peer','?date='+DATE)).data.fields.blockTime,'12:42');assert.equal((await request('peer','',body)).status,409);
 assert.equal((await request('agent','',{...body,field:'firstPax',value:'25:70 / pending'})).status,200);assert.equal((await request('agent','',{...body,field:'notAllowed'})).status,400);
 assert.equal((await request('agent','?date='+DATE+'&flight=MU577')).data.fields.blockTime,'');assert.equal((await request('agent','?date=2026-10-29')).data.fields.blockTime,'');
 assert.equal(db.prepare('SELECT employee_id FROM briefing_audit').get().employee_id,'agent');
});
test('only Lead and above can change contacts; stale revisions cannot overwrite',async t=>{
 const {request}=await fixture(t),rows=CONTACTS.map(row=>({...row}));rows[0].phone='310 000 1234';const body={revision:0,rows};
 for(const user of ['agent'])assert.equal((await request(user,'/contacts',body)).status,403);
 assert.equal((await request('sup','/contacts',body)).status,200);assert.equal((await request('regional','/contacts',body)).status,409);assert.equal((await request('agent','?date='+DATE)).data.contacts.rows[0].phone,'310 000 1234');
});
test('roster exposes working labels, shifts and photos without other schedule days or private employee data',async t=>{
 const {request}=await fixture(t),{data}=await request('sup','/roster?date='+DATE);assert.deepEqual(data.employees.map(e=>e.id),['agent','peer']);assert.equal(data.employees[0].avatar,'data:image/png;base64,photo');assert.equal(data.employees[0].shift,'A');for(const employee of data.employees)assert.deepEqual(Object.keys(employee).sort(),['avatar','id','name','nickname','shift','shiftColor']);assert.equal((await request('sup','/roster?date=2026-10-29')).data.employees.length,0);
});
test('assignment tags can move between duties and back to pool atomically, rejecting stale moves',async t=>{
 const {request}=await fixture(t),base={date:DATE,flight:'MU583'},assign={...base,employeeId:'agent',fromField:null,toField:'arrivalLead',fromValue:null,toValue:''};
 assert.equal((await request('sup','/assign',assign)).data.fields.arrivalLead,'agent employee');
 const move={...base,fromField:'arrivalLead',toField:'jetBridge',fromValue:'agent employee',toValue:''};assert.equal((await request('sup','/assign',move)).status,200);const current=(await request('agent','?date='+DATE)).data.fields;assert.equal(current.arrivalLead,'');assert.equal(current.jetBridge,'agent employee');
 assert.equal((await request('sup','/assign',move)).status,409);
 assert.equal((await request('sup','/assign',{...base,fromField:'jetBridge',toField:null,fromValue:'agent employee'})).status,200);assert.equal((await request('agent','?date='+DATE)).data.fields.jetBridge,'');
 assert.equal((await request('sup','/assign',{...assign,employeeId:'rest'})).status,200);assert.equal((await request('sup','/assign',{...assign,toField:'instructions'})).status,400);
});
test('ETAB snapshots require a delivered message and retain latest matching flight/date',()=>{
 const db=new Database(':memory:'),service=createBriefingEtab({db}),advisory={date:DATE,arrival:{flight:'MU583',reg:'B-7369',eta:'1217L',gate:'154',pax:'306/01',crew:'4/17'}};
 try{assert.equal(service.read(DATE,'MU583').status,'unavailable');assert.throws(()=>service.accept(advisory),/delivered/);service.accept(advisory,{discordMessageId:'sent1',received:2000});assert.equal(service.read(DATE,'MU583').gate,'154');assert.equal(service.read(DATE,'MU583').eta,'12:17');service.accept({...advisory,arrival:{...advisory.arrival,gate:'150'}},{discordMessageId:'old',received:1000});assert.equal(service.read(DATE,'MU583').gate,'154');assert.equal(service.read(DATE,'MU577').status,'unavailable');assert.equal(service.read('2026-10-29','MU583').status,'unavailable');assert.equal(createBriefingEtab({db}).read(DATE,'MU583').registration,'B-7369');}finally{db.close();}
});

test('ETAB overrides persist and reset to automatic; STA accepts plain text',async t=>{
 const {request,etab}=await fixture(t),key={date:DATE,flight:'MU583'};
 assert.equal((await request('sup','',{...key,field:'registration',previous:null,value:'B-1234'})).status,200);
 const result=(await request('agent','?date='+DATE)).data;assert.equal(result.fields.registration,'B-1234');assert.equal(result.etab.registration,'B-7369');etab.accept({date:DATE,arrival:{flight:'MU583',reg:'B-7777',eta:'1310L',gate:'155',pax:'300/01',crew:'4/17'}},{discordMessageId:'new-delivery',receivedAt:DATE+'T17:00:00Z'});const updated=(await request('agent','?date='+DATE)).data;assert.equal(updated.fields.registration,'B-1234');assert.equal(updated.etab.registration,'B-7777');
 assert.equal((await request('sup','',{...key,field:'registration',previous:'B-1234',value:null})).status,200);assert.equal((await request('agent','?date='+DATE)).data.fields.registration,null);
 assert.equal((await request('sup','',{...key,field:'sta',previous:'',value:'09:05L / revised'})).status,200);
});

test('Clear is Lead-only, scoped to this flight/date, audited and protected against stale data',async t=>{
 const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'},initial=(await request('agent','?date='+DATE)).data;
 for(const user of ['agent'])assert.equal((await request(user,'/clear',{...key,expected:initial.fields})).status,403);
 await request('agent','',{...key,field:'firstBag',previous:'',value:'12:50'});
 assert.equal((await request('sup','/clear',{...key,expected:initial.fields})).status,409);
 const current=(await request('sup','?date='+DATE)).data,cleared=await request('sup','/clear',{...key,expected:current.fields});assert.equal(cleared.status,200);assert(Object.values(cleared.data.fields).every(value=>value===''));
 assert.equal((await request('agent','?date='+DATE+'&flight=MU577')).data.fields.aircraftType,'777-300');assert.deepEqual((await request('agent','?date='+DATE)).data.contacts.rows,CONTACTS);assert.equal(db.prepare("SELECT employee_id FROM briefing_audit WHERE field='clear'").get().employee_id,'sup');
});

test('employee view edits free-text Time Record only, including when previewed by a manager',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU583'};
 for(const user of ['agent']){
  assert.equal((await request(user,'?date='+DATE)).data.canEditBriefing,false);assert.equal((await request(user,'/roster?date='+DATE)).status,403);
  for(const field of ['details','registration','arrivalLead'])assert.equal((await request(user,'',{...key,field,value:'Denied',previous:field==='registration'?null:''})).status,403);
 }
 const preview=(await request('sup','?date='+DATE+'&view=employee')).data;assert.equal(preview.canEditBriefing,false);assert.equal(preview.canPreviewEmployee,true);assert.equal((await request('sup','?view=employee',{...key,field:'details',value:'Denied',previous:''})).status,403);
 for(const field of ['blockTime','firstPax','lastPax','firstBag','lastBag'])assert.equal((await request('agent','',{...key,field,value:'12:30L / pending',previous:''})).status,200);
});

test('reports archive a frozen snapshot and remain downloadable after edits and Clear',async t=>{
 const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'};let state=(await request('sup','?date='+DATE)).data;
 for(const [user,path] of [['agent','/reports'],['sup','/reports?view=employee']])assert.equal((await request(user,path,{...key,expected:state.fields})).status,403);
 await request('agent','',{...key,field:'blockTime',value:'12:40L',previous:''});assert.equal((await request('sup','/reports',{...key,expected:state.fields})).status,409);state=(await request('sup','?date='+DATE)).data;
 const report=await request('sup','/reports',{...key,expected:state.fields});assert.equal(report.status,200);assert.match(report.data.filename,/MU583 ARRIVAL BRIEFING SHEET/);const path='/reports/'+report.data.id+'/pdf',pdf=await request('agent',path);assert.equal(pdf.status,200);assert.equal(pdf.data.subarray(0,5).toString(),'%PDF-');
 const snapshot=JSON.parse(db.prepare('SELECT snapshot FROM briefing_reports WHERE id=?').get(report.data.id).snapshot);assert.equal(snapshot.fields.registration,'B-7369');assert.equal(snapshot.fields.blockTime,'12:40L');assert.equal(snapshot.generatedBy,'sup');
 await request('sup','/clear',{...key,expected:state.fields});assert.deepEqual((await request('agent',path)).data,pdf.data);assert.equal((await request('agent','/reports?date='+DATE)).data.reports.length,1);assert.equal((await request('other',path)).status,403);
});

test('directory includes off-duty staff and assignment rejects unselected or ineligible names',async t=>{const {request}=await fixture(t);const roster=(await request('sup','/roster?date='+DATE)).data;assert(roster.directory.some(p=>p.id==='rest'));assert(!roster.directory.some(p=>p.id==='other'));assert(!roster.employees.some(p=>p.id==='rest'));const key={date:DATE,flight:'MU583'};assert.equal((await request('sup','',{...key,field:'arrivalLead',value:'random person',previous:''})).status,400);assert.equal((await request('sup','',{...key,field:'arrivalLead',employeeId:'rest',previous:''})).data.fields.arrivalLead,'rest employee');assert.equal((await request('sup','/assign',{...key,employeeId:'other',fromField:null,toField:'announcement',toValue:''})).status,409);});

test('Lead edits the sheet and deletes archives while employees cannot delete',async t=>{const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'};assert((await request('lead','?date='+DATE)).data.canEditBriefing);assert.equal((await request('lead','',{...key,field:'details',value:'Lead edit',previous:''})).status,200);const expected=(await request('lead','?date='+DATE)).data.fields;const created=await request('lead','/reports',{...key,expected});assert.equal(created.status,200);const path='/reports/'+created.data.id;assert.equal((await request('agent',path+'/delete',{})).status,403);assert.equal((await request('lead',path+'/delete',{})).status,200);assert.equal((await request('agent',path+'/pdf')).status,404);assert.equal((await request('agent',path+'/preview')).status,404);assert.equal((await request('lead','/reports?date='+DATE)).data.reports.length,0);assert(db.prepare('SELECT deleted_at FROM briefing_reports WHERE id=?').get(created.data.id).deleted_at);});

test('occupied duty drops swap both names and stale swaps change neither position',async t=>{const {request}=await fixture(t),key={date:DATE,flight:'MU583'};for(const [employeeId,toField] of [['agent','arrivalLead'],['peer','announcement']])assert.equal((await request('lead','/assign',{...key,employeeId,fromField:null,toField,toValue:''})).status,200);const swap={...key,fromField:'announcement',toField:'arrivalLead',fromValue:'peer employee',toValue:'agent employee'};const moved=await request('lead','/assign',swap);assert.equal(moved.data.fields.arrivalLead,'peer employee');assert.equal(moved.data.fields.announcement,'agent employee');assert.equal((await request('lead','/assign',swap)).status,409);assert.equal((await request('agent','?date='+DATE)).data.fields.announcement,'agent employee');});

test('saving changed Time Record or clearing invalidates persisted stability clock',async t=>{const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'};db.exec('CREATE TABLE briefing_auto_clock(date TEXT,flight TEXT,signature TEXT,since INTEGER,PRIMARY KEY(date,flight))');const seed=()=>db.prepare('INSERT INTO briefing_auto_clock VALUES(?,?,?,?)').run(DATE,'MU583','previous',1);seed();assert.equal((await request('agent','',{...key,field:'blockTime',value:'12:30',previous:''})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_auto_clock').get().n,0);seed();await request('agent','',{...key,field:'blockTime',value:'12:30',previous:'12:30'});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_auto_clock').get().n,1);const expected=(await request('lead','?date='+DATE)).data.fields;await request('lead','/clear',{...key,expected});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_auto_clock').get().n,0);});
