const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerBriefing,CONTACTS}=require('../briefing'),{createEmployeeStore}=require('../employees'),{createBriefingEtab}=require('../briefingEtab');
const DATE='2026-10-28';
async function fixture(t){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT);CREATE TABLE staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER,data TEXT)');db.prepare('INSERT INTO employee_avatars VALUES(?,?)').run('agent','data:image/png;base64,photo');
 const rows=[['agent','Agent'],['peer','Agent'],['rest','Agent'],['sup','Supervisor'],['lead','Lead'],['regional','Regional Manager'],['other','Supervisor']].map(([id,position])=>({id,name:id+' employee',nickname:id,eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 rows.push(...[['demo','DEMO HAS','MU'],['ramp','HAS OPS RAMP','MU'],['hq','HQ employee','Headquarter']].map(([id,name,account])=>({id,name,eid:id,position:'Agent',station:'LAX',account})));
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>employees.get().employees.find(e=>e.id===user.uid)},app=express();app.use(express.json());
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run(DATE,JSON.stringify({assignments:{agent:{code:'A'},peer:{code:'C'},rest:{code:'X'},other:{code:'D'}}}));
 const etab=createBriefingEtab({db});etab.accept({date:DATE,arrival:{flight:'MU583',reg:'B-7369',eta:'1217L',gate:'154',pax:'306/01',crew:'4/17'}},{discordMessageId:'fixture-delivery',receivedAt:DATE+'T16:00:00Z'});
 registerBriefing(app,{employees,profiles,etab,now:()=>new Date(DATE+'T18:00:00Z'),authenticate:async req=>{if(!req.headers.authorization)throw Error();return {uid:req.headers.authorization};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api'+path,{method:body?'POST':'GET',headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};};
 return {db,request,etab,employees,profiles};
}
test('linked eligible employees can read ETAB and shared briefing, contacts are role gated',async t=>{
 const {request}=await fixture(t);for(const user of ['agent','lead','sup','regional']){const {status,data}=await request(user,'?date='+DATE);assert.equal(status,200);assert.equal(data.flight,'MU583');assert.equal(data.fields.aircraftType,'777-300');assert.equal(data.fields.sta,'0905');assert.equal(data.etab.pax,'306/01');assert.equal(data.canEditContacts,['sup','regional','lead'].includes(user));assert.deepEqual(data.contacts.rows,CONTACTS);}
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
 try{assert.equal(service.read(DATE,'MU583').status,'unavailable');assert.throws(()=>service.accept(advisory),/delivered/);service.accept(advisory,{discordMessageId:'sent1',received:2000});assert.equal(service.read(DATE,'MU583').gate,'154');assert.equal(service.read(DATE,'MU583').eta,'1217L');service.accept({...advisory,arrival:{...advisory.arrival,gate:'150'}},{discordMessageId:'old',received:1000});assert.equal(service.read(DATE,'MU583').gate,'154');assert.equal(service.read(DATE,'MU577').status,'unavailable');assert.equal(service.read('2026-10-29','MU583').status,'unavailable');assert.equal(createBriefingEtab({db}).read(DATE,'MU583').registration,'B-7369');}finally{db.close();}
});

test('ETAB overrides persist and reset to automatic; STA accepts plain text',async t=>{
 const {request,etab}=await fixture(t),key={date:DATE,flight:'MU583'};
 assert.equal((await request('sup','',{...key,field:'registration',previous:null,value:'B-1234'})).status,200);
 const result=(await request('agent','?date='+DATE)).data;assert.equal(result.fields.registration,'B-1234');assert.equal(result.etab.registration,'B-7369');etab.accept({date:DATE,arrival:{flight:'MU583',reg:'B-7777',eta:'1310L',gate:'155',pax:'300/01',crew:'4/17'}},{discordMessageId:'new-delivery',receivedAt:DATE+'T17:00:00Z'});const updated=(await request('agent','?date='+DATE)).data;assert.equal(updated.fields.registration,'B-1234');assert.equal(updated.etab.registration,'B-7777');
 assert.equal((await request('sup','',{...key,field:'registration',previous:'B-1234',value:null})).status,200);assert.equal((await request('agent','?date='+DATE)).data.fields.registration,null);
 assert.equal((await request('sup','',{...key,field:'sta',previous:'0905',value:'09:05L / revised'})).status,200);
});

test('Clear is Lead-only, scoped to this flight/date, audited and protected against stale data',async t=>{
 const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'},initial=(await request('agent','?date='+DATE)).data;
 for(const user of ['agent'])assert.equal((await request(user,'/clear',{...key,expected:initial.fields})).status,403);
 await request('agent','',{...key,field:'firstBag',previous:'',value:'12:50'});
 assert.equal((await request('sup','/clear',{...key,expected:initial.fields})).status,409);
 const current=(await request('sup','?date='+DATE)).data,cleared=await request('sup','/clear',{...key,expected:current.fields});assert.equal(cleared.status,200);assert(Object.entries(cleared.data.fields).every(([field,value])=>(/^config[FJY]$/.test(field)||/^counterA\d+(Number|Service)$/.test(field))?value===current.fields[field]:value===''));
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

test('occupied Arrival duties replace the assignee and stale moves cannot overwrite',async t=>{const {request}=await fixture(t),key={date:DATE,flight:'MU583'};for(const [employeeId,toField] of [['agent','arrivalLead'],['peer','announcement']])assert.equal((await request('lead','/assign',{...key,employeeId,fromField:null,toField,toValue:''})).status,200);const swap={...key,fromField:'announcement',toField:'arrivalLead',fromValue:'peer employee',toValue:'agent employee'};const moved=await request('lead','/assign',swap);assert.equal(moved.data.fields.arrivalLead,'peer employee');assert.equal(moved.data.fields.announcement,'');assert.equal((await request('lead','/assign',swap)).status,409);assert.equal((await request('agent','?date='+DATE)).data.fields.announcement,'');});

test('saving changed Time Record or clearing invalidates persisted stability clock',async t=>{const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'};db.exec('CREATE TABLE briefing_auto_clock(date TEXT,flight TEXT,signature TEXT,since INTEGER,PRIMARY KEY(date,flight))');const seed=()=>db.prepare('INSERT INTO briefing_auto_clock VALUES(?,?,?,?)').run(DATE,'MU583','previous',1);seed();assert.equal((await request('agent','',{...key,field:'blockTime',value:'12:30',previous:''})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_auto_clock').get().n,0);seed();await request('agent','',{...key,field:'blockTime',value:'12:30',previous:'12:30'});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_auto_clock').get().n,1);const expected=(await request('lead','?date='+DATE)).data.fields;await request('lead','/clear',{...key,expected});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_auto_clock').get().n,0);});


test('Departure Counter/Gate edits persist separately from Arrival with role and stale checks',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU586',direction:'departure'};
 const get=()=>request('sup','?date='+DATE+'&flight=MU586&direction=departure');
 const initial=(await get()).data;assert.equal(initial.direction,'departure');assert.equal(initial.fields.counterA59Number,'A59');assert.equal(initial.fields.counterA59Service,'SKY PRIORITY');
 for(const [field,value] of [['counterA59Number','A58'],['counterA59Service','Business'],['gateLeadTime','10:30'],['bookingJ','50']]){
  const previous=(await get()).data.fields[field],body={...key,field,value,previous};assert.equal((await request('agent','',body)).status,403);assert.equal((await request('sup','',body)).status,200);assert.equal((await get()).data.fields[field],value);
 }
 for(const toField of ['counterA59','gateLead'])assert.equal((await request('sup','/assign',{...key,employeeId:'agent',fromField:null,toField,toValue:''})).status,200);
 assert.equal((await get()).data.fields.gateLead,'agent employee');assert.equal((await request('sup','?date='+DATE)).data.fields.counterA59,'');
 const expected=(await get()).data.fields,report=await request('sup','/reports',{...key,expected});assert.equal(report.status,200);assert.match(report.data.filename,/DEPARTURE/);
 const preview=await request('sup','/reports/'+report.data.id+'/preview');assert.match(preview.data.toString(),/DEPARTURE BRIEFING/);assert.match(preview.data.toString(),/A58 \/ Business/);assert.match(preview.data.toString(),/10:30/);
});
test('Time Check follows day offsets, year rollover and EDATE leap-day clamping',()=>{
 const {timeChecks,booking}=require('../public/public/briefing-fields');
 assert.deepEqual(timeChecks('2026-10-28'),{transit:'2026-10-30',visa240:'2026-11-08',age21:'2005-10-28'});
 assert.deepEqual(timeChecks('2024-02-29'),{transit:'2024-03-02',visa240:'2024-03-11',age21:'2003-02-28'});
 assert.equal(timeChecks('2026-12-31').visa240,'2027-01-11');assert.equal(booking({bookingF:'1',bookingJ:'50',bookingY:'242',infantJ:'1',infantY:'2',configF:'6',configJ:'52',configY:'258'}).pax,293);
});
test('delivered ETAB also fills the matching Departure flight and respects its date',()=>{
 const db=new Database(':memory:');try{const etab=createBriefingEtab({db});etab.accept({date:DATE,arrival:{flight:'MU583',reg:'B-2002',eta:'0859L',gate:'TBA'},departure:{flight:'MU586',time:'1230L',timeType:'STD'}},{discordMessageId:'sent',receivedAt:DATE+'T15:00Z'});assert.equal(etab.read(DATE,'MU586').std,'1130');assert.equal(etab.read(DATE,'MU586').registration,'B-2002');assert.equal(etab.read(DATE,'MU586').gate,'TBA');assert.equal(etab.read(DATE,'MU586').pax,undefined);assert.equal(etab.read('2026-10-29','MU586').status,'unavailable');}finally{db.close();}
});


test('membership reference edits require Lead and retain shared revision protection',async t=>{
 const {request}=await fixture(t),initial=(await request('agent','/reference')).data;assert.equal(initial.canEdit,false);
 const body={revision:initial.revision,values:{'membership.gold.economy.3':'2 × 23 kg'}};
 assert.equal((await request('agent','/reference',body)).status,403);assert.equal((await request('lead','/reference',body)).status,200);
 assert.equal((await request('sup','/reference',body)).status,409);assert.equal((await request('agent','/reference')).data.values['membership.gold.economy.3'],'2 × 23 kg');
 assert.equal((await request('other','/reference')).status,403);assert.equal((await request('lead','/reference',{revision:1,values:{'bad.key':'x'}})).status,400);
});


test('Config is manager-only and cannot be changed by Supervisor or Lead through Clear',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU586'},path='?date='+DATE+'&flight=MU586';
 for(const user of ['agent','lead','sup']){assert.equal((await request(user,path)).data.canEditConfig,false);assert.equal((await request(user,'',{...key,field:'configF',value:'8',previous:'6'})).status,403);}
 assert.equal((await request('regional',path)).data.canEditConfig,true);assert.equal((await request('regional','',{...key,field:'configF',value:'8',previous:'6'})).status,200);
 const before=(await request('lead',path)).data.fields;assert.equal((await request('lead','/clear',{...key,expected:before})).status,200);assert.equal((await request('lead',path)).data.fields.configF,'8');
});


test('PLF uses adult PAX divided by 313 and excludes infants and Config',()=>{
 const {booking}=require('../public/public/briefing-fields');const result=booking({bookingF:'1',bookingJ:'50',bookingY:'242',infantF:'10',infantJ:'10',configF:'100',configJ:'100',configY:'100'});assert.equal(result.plf,'94%');assert.equal(booking({}).plf,'0%');
});


test('Lead can rename Gate roles and reports retain the saved names; employees cannot',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU586'},path='?date='+DATE+'&flight=MU586';
 assert.equal((await request('lead',path)).data.fields.gateLeadLabel,'Gate Lead');
 const body={...key,field:'gateLeadLabel',previous:'Gate Lead',value:'Boarding Lead'};
 assert.equal((await request('agent','',body)).status,403);assert.equal((await request('lead','',body)).status,200);
 const expected=(await request('lead',path)).data.fields;assert.equal(expected.gateLeadLabel,'Boarding Lead');const report=await request('lead','/reports',{...key,expected});assert.equal(report.status,200);const preview=await request('agent','/reports/'+report.data.id+'/preview');assert.match(preview.data.toString(),/Boarding Lead/);
});


test('Lead edits and adds Important Info and Price cards with revision and employee protection',async t=>{
 const {request}=await fixture(t),initial=(await request('lead','/reference')).data,body={revision:initial.revision,values:{'important.0':'Name checks updated','price.1':'New fee item'},boxes:{important:[{id:'card-test-info',title:'New info',text:'Operational note'}],price:[{id:'card-test-price',title:'New fee',text:'USD 25'}]}};
 assert.equal((await request('agent','/reference',body)).status,403);assert.equal((await request('lead','/reference',body)).status,200);const result=(await request('agent','/reference')).data;assert.equal(result.boxes.price[0].text,'USD 25');assert.equal(result.values['important.0'],'Name checks updated');assert.equal((await request('lead','/reference',body)).status,409);
 const saved=await request('lead','/reference',{revision:result.revision,values:result.values});assert.equal(saved.data.boxes.important.length,1);
 assert.equal((await request('lead','/reference',{revision:saved.data.revision,values:{},boxes:{price:[{id:'bad',title:'bad',text:'x'}]}})).status,400);
});
test('Departure copies manual Arrival registration and maps ETAB time to ETD with STD 1130',async t=>{
 const {request,etab}=await fixture(t);etab.accept({date:DATE,arrival:{flight:'MU583',reg:'B-2002',eta:'0859L',gate:'133',pax:'303/0',crew:'04/17'},departure:{flight:'MU586',time:'1230L',timeType:'STD'}},{discordMessageId:'today-delivery',receivedAt:DATE+'T20:00Z'});
 await request('lead','',{date:DATE,flight:'MU583',field:'registration',previous:null,value:'B-2999'});
 const departure=(await request('agent','?date='+DATE+'&flight=MU586')).data;assert.equal(departure.fields.std,'1130');assert.equal(departure.etab.etd,'1230L');assert.equal(departure.etab.registration,'B-2999');assert.equal(departure.etab.gate,'133');
});


test('Briefing reinitializes with migrated reference cards without losing saved data',()=>{
 const db=new Database(':memory:'),employees={db,get:()=>({employees:[]})},profiles={linked:()=>null};
 try{
  registerBriefing(express(),{employees,profiles});
  const values={'membership.gold.economy.3':'2 x 23 kg','important.0':'Saved check'},boxes={price:[{id:'card-persisted',title:'Custom fee',text:'USD 25'}]};
  db.prepare('UPDATE briefing_reference SET revision=7,data=?,boxes=? WHERE id=1').run(JSON.stringify(values),JSON.stringify(boxes));
  for(let i=0;i<3;i++)registerBriefing(express(),{employees,profiles});
  const row=db.prepare('SELECT * FROM briefing_reference WHERE id=1').get();assert.equal(row.revision,7);assert.deepEqual(JSON.parse(row.data),values);assert.deepEqual(JSON.parse(row.boxes),boxes);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_reference').get().n,1);
 }finally{db.close();}
});


test('assignment snapshot includes nickname while retaining canonical name and employee ID',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU583'};
 await request('lead','/assign',{...key,employeeId:'agent',fromField:null,toField:'arrivalLead',toValue:''});
 const result=(await request('agent','?date='+DATE)).data;assert.equal(result.fields.arrivalLead,'agent employee');const person=result.assignedPeople.find(p=>p.id==='agent');assert.equal(person.nickname,'agent');assert.equal(person.name,'agent employee');
});


test('Gate Lead control entries autosave per flight with existing Lead edit permissions',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU586'};
 for(const [field,value] of [['gateCrewOnboard','11:02'],['gatePushback','12:25'],['gateFinalF','5'],['gateFinalJ','52'],['gateFinalY','244'],['gateFinalInf','1'],['gateDelayTime1','12:30'],['gateDelayText1','Boarding update']]){
  const body={...key,field,previous:'',value};assert.equal((await request('agent','',body)).status,403);assert.equal((await request('lead','',body)).status,200);
 }
 const record=(await request('agent','?date='+DATE+'&flight=MU586')).data;assert.equal(record.fields.gateCrewOnboard,'11:02');assert.equal(record.fields.gateFinalInf,'1');assert.equal(record.fields.gateDelayText1,'Boarding update');assert.equal((await request('agent','?date='+DATE)).data.fields.gatePushback,'');
});


test('Lost and Found reference edits are Lead-only and revision checked',async t=>{const {request}=await fixture(t),initial=(await request('lead','/reference')).data,body={revision:initial.revision,values:{'lostfound.ahl.1':'Receipt copy'}};assert.equal((await request('agent','/reference',body)).status,403);assert.equal((await request('lead','/reference',body)).status,200);assert.equal((await request('lead','/reference',body)).status,409);assert.equal((await request('agent','/reference')).data.values['lostfound.ahl.1'],'Receipt copy');});
test('new report previews freeze assignment nicknames without changing stored identity',async t=>{const {request}=await fixture(t),key={date:DATE,flight:'MU583'};await request('lead','/assign',{...key,employeeId:'agent',fromField:null,toField:'arrivalLead',toValue:''});const current=(await request('lead','?date='+DATE)).data;const report=await request('lead','/reports',{...key,expected:current.fields});const html=(await request('agent','/reports/'+report.data.id+'/preview')).data.toString();assert.match(html,/<strong>agent<\/strong>/);assert.equal((await request('agent','?date='+DATE)).data.fields.arrivalLead,'agent employee');});

test('Finish validates five Arrival times, persists deadline and supports cancellation; Gate Lead requires Lead',async t=>{
 const {request,db}=await fixture(t),key={date:DATE,flight:'MU583'};let sheet=(await request('agent','?date='+DATE)).data;
 assert.equal((await request('agent','/finish',{...key,expected:sheet.fields})).status,400);
 for(const field of ['blockTime','firstPax','lastPax','firstBag','lastBag'])await request('agent','',{...key,field,value:'0905',previous:''});
 sheet=(await request('agent','?date='+DATE)).data;const first=await request('agent','/finish',{...key,expected:sheet.fields});assert.equal(first.status,200);assert.equal(first.data.finish.dueAt-first.data.finish.serverTime,60000);assert.equal((await request('peer','/finish',{...key,expected:sheet.fields})).data.finish.id,first.data.finish.id);assert.equal((await request('peer','/finish/cancel',key)).data.finish.state,'cancelled');
 const departure={date:DATE,flight:'MU586',direction:'departure'},fields=(await request('lead','?date='+DATE+'&flight=MU586')).data.fields;assert.equal((await request('agent','/finish',{...departure,expected:fields})).status,403);assert.equal((await request('lead','/finish',{...departure,expected:fields})).status,200);assert.equal((await request('agent','/finish/cancel',departure)).status,403);assert.equal((await request('agent','/finish/cancel',{...departure,direction:'arrival'})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_finish').get().n,2);
});
test('two assigned people retain nicknames in reports and each can be removed separately',async t=>{const {request}=await fixture(t),key={date:DATE,flight:'MU586'};for(const employeeId of ['agent','peer']){const fields=(await request('lead','?date='+DATE+'&flight=MU586')).data.fields;assert.equal((await request('lead','/assign',{...key,employeeId,fromField:null,toField:'gateLead',toValue:fields.gateLead})).status,200);}const fields=(await request('lead','?date='+DATE+'&flight=MU586')).data.fields,report=await request('lead','/reports',{...key,expected:fields});assert.equal(report.status,200);const preview=await request('agent','/reports/'+report.data.id+'/preview');assert.match(preview.data.toString(),/agent \/ peer/);const removed=await request('lead','/assign',{...key,employeeId:'agent',fromField:'gateLead',fromValue:fields.gateLead,toField:null});assert.equal(removed.data.fields.gateLead,'peer employee');});

test('only current assigned Gate Lead/Assist and Lead+ edit control entries, with immediate revocation',async t=>{const {request,db}=await fixture(t),key={date:DATE,flight:'MU586',direction:'departure'},body={...key,field:'gateCrewOnboard',value:'11:02',previous:''};assert.equal((await request('agent','',body)).status,403);for(const [employeeId,toField] of [['agent','gateLead'],['peer','gateAssist']])assert.equal((await request('lead','/assign',{...key,employeeId,fromField:null,toField,toValue:''})).status,200);for(const employeeId of ['agent','peer']){const state=(await request(employeeId,'?date='+DATE+'&flight=MU586')).data;assert.equal(state.canEditGateControl,true);assert.equal(state.canEditBriefing,false);}assert.equal((await request('agent','',body)).status,200);assert.equal((await request('peer','',{...body,field:'gateFinalY',value:'244'})).status,200);assert.equal((await request('rest','',{...body,field:'gateFinalJ'})).status,403);assert.equal((await request('agent','',{...body,field:'details'})).status,403);assert.equal((await request('agent','',{...body,date:'2026-10-27'})).status,403);const fields=(await request('agent','?date='+DATE+'&flight=MU586')).data.fields;assert.equal((await request('agent','/finish',{...key,expected:fields})).status,200);assert.equal((await request('peer','/finish/cancel',key)).status,200);await request('lead','/assign',{...key,employeeId:'agent',fromField:'gateLead',fromValue:'agent employee',toField:null});assert.equal((await request('agent','',{...body,previous:'11:02',value:'11:03'})).status,403);assert.equal((await request('lead','',{...body,previous:'11:02',value:'11:03'})).status,200);});


test('all seven Arrival duties replace with one person through either assignment API',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU583'};
 for(const field of require('../public/public/briefing-fields').arrival){
  await request('lead','/assign',{...key,employeeId:'agent',fromField:null,toField:field,toValue:''});
  const replacement=await request('lead','/assign',{...key,employeeId:'peer',fromField:null,toField:field,toValue:'agent employee'});
  assert.equal(replacement.status,200);assert.equal(replacement.data.fields[field],'peer employee');
  assert.equal((await request('lead','',{...key,field,employeeId:'agent',previous:'peer employee'})).data.fields[field],'agent employee');
 }
});

test('Clear preserves default and edited counter settings, clears people, and persists across reads',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU586'},path='?date='+DATE+'&flight=MU586';
 const initial=(await request('lead',path)).data.fields;
 for(let i=59;i<=68;i++)assert.equal(initial['counterA'+i+'Service'],i<=63?'SKY PRIORITY':i<=66?'ECONOMY':i===67?'Arrival Card Assistant':'MU');
 for(const [field,value] of [['counterA59Number','A58'],['counterA59Service','Business']])assert.equal((await request('lead','',{...key,field,value,previous:initial[field]})).status,200);
 await request('lead','/assign',{...key,employeeId:'agent',fromField:null,toField:'counterA59',toValue:''});
 const before=(await request('lead',path)).data.fields;
 assert.equal((await request('lead','/clear',{...key,expected:initial})).status,409);
 assert.equal((await request('lead','/clear',{...key,expected:before})).status,200);
 const after=(await request('agent',path)).data.fields;
 for(const field of Object.keys(initial).filter(f=>/^counterA\d+(Number|Service)$/.test(f)))assert.equal(after[field],before[field]);
 assert.equal(after.counterA59,'');assert.equal(after.bookingJ,'');
});

test('older Clear blanks regain counter defaults without overwriting custom or deliberately empty labels',async t=>{
 const {db,employees,profiles}=await fixture(t);
 const fields={__direction:'departure',counterA59Number:'',counterA59Service:'',counterA60Number:'A58',counterA60Service:''};
 db.prepare('INSERT INTO briefing_records VALUES(?,?,?,?,?)').run(DATE,'MU586',JSON.stringify(fields),null,null);
 const audit=(field)=>db.prepare('INSERT INTO briefing_audit(date,flight,field,employee_id,at) VALUES(?,?,?,?,?)').run(DATE,'MU586',field,'lead',DATE);
 audit('counterA59Service');audit('clear');audit('counterA60Service');
 for(let i=0;i<2;i++)registerBriefing(express(),{employees,profiles});
 const saved=JSON.parse(db.prepare('SELECT data FROM briefing_records WHERE flight=?').get('MU586').data);
 assert.equal(saved.counterA59Number,'A59');assert.equal(saved.counterA59Service,'SKY PRIORITY');assert.equal(saved.counterA60Number,'A58');assert.equal(saved.counterA60Service,'');
});

test('demo, ramp and Headquarter accounts remain excluded with an explanatory message',async t=>{
 const {employees,request}=await fixture(t);
 for(const [id,name,account] of [['demo','DEMO HAS','MU'],['ramp','HAS OPS RAMP','MU'],['hq','HQ employee','Headquarter']]){
  const result=await request(id,'?date='+DATE);assert.equal(result.status,403);assert.match(result.data.error,/DEMO HAS, HAS OPS RAMP, and Headquarter/);
 }
});


test('Arrival Notes are employee-editable, scoped, revision-protected, exported and cleared',async t=>{
 const {request}=await fixture(t),key={date:DATE,flight:'MU583'},body={...key,field:'notes',value:'Arrival note <check>\nSecond line',previous:''};
 assert.equal((await request('agent','',body)).status,200);assert.equal((await request('peer','?date='+DATE)).data.fields.notes,body.value);assert.equal((await request('peer','',body)).status,409);
 assert.equal((await request('agent','',{...body,value:'x'.repeat(5001),previous:body.value})).status,400);assert.equal((await request('agent','',{...body,flight:'MU586'})).status,400);assert.equal((await request('agent','?date='+DATE+'&flight=MU577')).data.fields.notes,'');
 const fields=(await request('lead','?date='+DATE)).data.fields,report=await request('lead','/reports',{...key,expected:fields});assert.equal(report.status,200);const preview=await request('agent','/reports/'+report.data.id+'/preview');assert.match(preview.data.toString(),/<h2>Notes<\/h2>/);assert.match(preview.data.toString(),/Arrival note &lt;check&gt;/);
 assert.equal((await request('lead','/clear',{...key,expected:fields})).data.fields.notes,'');
});

test('initial direction follows the linked employee today duty, independent of requested briefing date or color',async t=>{
 const f=await fixture(t),query='?date='+DATE+'&flight=MU583';
 for(const [code,expected] of [['A','arrival'],['C','departure'],['F','departure'],['B','departure'],['BL','departure'],['CL','departure'],['FL','departure'],['GS','departure'],['Q','departure'],['D','departure'],['K','departure'],['X','arrival'],['VAC','arrival'],['N','arrival'],['CS','arrival'],['CO','arrival'],[null,'arrival']]){f.db.prepare('UPDATE staff_schedule_days SET data=? WHERE date=?').run(JSON.stringify({assignments:code?{agent:{code,color:'#ff0000'}}:{}}),DATE);const response=await f.request('agent',query);assert.equal(response.status,200);assert.equal(response.data.defaultDirection,expected,code);assert.equal(response.data.direction,'arrival');}
 f.db.prepare('UPDATE staff_schedule_days SET data=? WHERE date=?').run(JSON.stringify({assignments:{agent:{code:'A'},peer:{code:'C'}}}),DATE);assert.equal((await f.request('peer','?date=2026-10-27&flight=MU583')).data.defaultDirection,'departure');assert.equal((await f.request('agent','?date='+DATE+'&flight=MU586')).data.defaultDirection,'arrival');assert.equal((await f.request('sup',query)).data.defaultDirection,'arrival');
});
