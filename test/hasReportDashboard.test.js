const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
test('DA arrival/departure delay bands handle 30/60-minute boundaries, early flights, missing times and midnight',()=>{
 const cells={},pairs=[['1000','1000'],['1000','0955'],['1000','1001'],['1000','1029'],['1000','1030'],['1000','1059'],['1000','1100'],['2350','0020'],['1000',''],['1000','NIL']];
 pairs.forEach(([scheduled,actual],i)=>{cells['E'+(i+6)]={value:scheduled};cells['F'+(i+6)]={value:actual};});cells.G6={value:0.5};cells.H6={value:0.5+60/1440};
 const result=require('../hasReportDelays').flightDelays({cells,days:[{start:6,end:15}]});assert.deepEqual(result.arrival,{under30:2,from30to59:3,atLeast60:1,total:6,evaluated:8});assert.deepEqual(result.departure,{under30:0,from30to59:0,atLeast60:1,total:1,evaluated:1});
});
async function fixture(t){
 const db=new Database(':memory:'),app=express();app.use(express.json());const users={};for(const position of ['Agent','CSA','Lead','Supervisor','Senior Supervisor','Duty Manager','Business Manager','Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'])users[position]={station:'LAX',account:'MU',position,additionalAccounts:[{station:'SFO',account:'XX'}]};users.other={station:'SFO',account:'XX',position:'Supervisor'};users.hq={station:'HQ',account:'HQ',position:'Regional Manager'};
 const service=require('../hasReports').registerHasReports(app,{employees:{db},reportDb:db,profiles:{linked:user=>users[user.uid]},authenticate:async req=>{const uid=req.headers.authorization;if(!users[uid])throw Error('auth');return {uid};}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
 return {users,request:async(uid,path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/has-report-api'+path,{headers:{Authorization:uid,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,headers:response.headers,data:await response.json()};}};
}
test('Dashboard permits only Main Account Supervisor+ including senior roles, independently of WWH editing',async t=>{
 const {request,users}=await fixture(t);assert.equal((await request('anonymous','/dashboard/2026')).status,401);
 for(const role of ['Agent','CSA','Lead','hq']){assert.equal((await request(role,'/context')).data.canDashboard,false);assert.equal((await request(role,'/dashboard/2026')).status,403);}
 for(const role of Object.keys(users).filter(role=>!['Agent','CSA','Lead','hq'].includes(role))){assert.equal((await request(role,'/context')).data.canDashboard,true);const result=await request(role,'/dashboard/2026');assert.equal(result.status,200,role);assert.equal(result.data.months.length,12);assert.match(result.headers.get('cache-control'),/no-store/);}
 assert.equal((await request('Senior Supervisor','/wwh/2026-01')).status,403);assert.equal((await request('Senior Supervisor','/dashboard/2026')).status,200);
 for(const year of ['2025','10000','2026.5'])assert.equal((await request('Supervisor','/dashboard/'+year)).status,400);
 users.Supervisor.position='Lead';assert.equal((await request('Supervisor','/dashboard/2026')).status,403);
});
test('Dashboard uses calculated DA/WWH totals and weighted recharge, isolates year/account and excludes missing reports',async t=>{
 const {request}=await fixture(t);
 for(const month of ['2027-01','2027-02'])assert.equal((await request('Lead','/da/'+month,{revision:0,values:{K7:300,L6:1,E6:1000,F6:1030,G7:1200,H7:1300}})).status,200);
 assert.equal((await request('Supervisor','/wwh/2027-01',{revision:0,values:{C5:100,F5:110,G5:4,K5:10,L5:2,T5:2,U5:0.75,V5:1,B13:'Private operational comment'}})).status,200);
 await request('Supervisor','/wwh/2027-02',{revision:0,values:{C5:100,F5:80,K5:10,T5:5,U5:2}});
 await request('Supervisor','/wwh/2027-03',{revision:0,values:{C5:100,F5:20}});
 const result=await request('Supervisor','/dashboard/2027?station=SFO&account=XX');assert.equal(result.status,200);assert.deepEqual(result.data.scope,{station:'LAX',account:'MU'});
 const [jan,feb,mar,apr]=result.data.months;
 assert.equal(jan.budgetHours,100);assert.equal(jan.actualHours,116);assert.equal(jan.rechargeHours,13);assert.equal(jan.netActualHours,103);assert.equal(jan.balanceHours,-3);assert.equal(jan.state,'overrun');assert.equal(jan.hallmarkDelays,undefined);assert.equal(jan.wwhDelayHours,undefined);assert.equal(jan.rebillableDelays,undefined);assert.equal(jan.flights,1);assert.equal(jan.pax,300);assert.deepEqual(jan.rechargeBreakdown,{regular:10,overtime:2,doubleTime:0,training:0});
 assert.equal(feb.balanceHours,30);assert.equal(feb.state,'surplus');assert.equal(feb.hallmarkDelays,undefined);assert.equal(mar.state,'incomplete');assert.equal(mar.balanceHours,null);assert.equal(apr.state,'not-started');assert.equal(apr.actualHours,null);assert.equal(apr.rechargeHours,null);
 assert.equal(jan.flightDelays.arrival.from30to59,1);assert.equal(jan.flightDelays.departure.atLeast60,1);assert.equal(jan.flightDelays.arrival.total,1);assert.equal(apr.flightDelays,null);
 assert(!JSON.stringify(result.data).includes('Private operational comment'));assert((await request('other','/dashboard/2027?station=LAX&account=MU')).data.months.every(row=>row.state==='not-started'));assert((await request('Supervisor','/dashboard/2026')).data.months.every(row=>row.state==='not-started'));
 const added=await request('Lead','/da/2027-01/rows',{revision:1,day:1});assert.equal(added.status,200);await request('Lead','/da/2027-01',{revision:2,layoutRevision:1,values:{K11:50}});assert.equal((await request('Supervisor','/dashboard/2027')).data.months[0].pax,350);
 await request('Supervisor','/wwh/2027-01',{revision:1,values:{F5:'=1/0'}});const broken=(await request('Supervisor','/dashboard/2027')).data.months[0];assert.equal(broken.state,'calculation-error');assert.equal(broken.actualHours,null);assert.equal(broken.balanceHours,null);assert(broken.errors.includes('E11'));
});
test('November trailing template cells never enter WWH flight, budget or dashboard totals',async t=>{
 const {request}=await fixture(t),model=await require('../hasReports').template('da','2026-11',{station:'LAX',account:'MU'});assert.equal(model.rows,158);assert.equal(model.days.at(-1).end,155);
 await request('Lead','/da/2026-11',{revision:0,values:{L151:2,K152:600}});await request('Supervisor','/wwh/2026-11',{revision:0,values:{C9:61}});
 const wwh=(await request('Supervisor','/wwh/2026-11')).data;assert.equal(wwh.cells.Z9.value,2);assert.equal(wwh.calculated.Z11,2);assert.equal(wwh.calculated.D9,122);assert.equal(wwh.calculated.D11,122);assert.equal(wwh.cells.Z9.sourceFormula,"SUM('DA Source'!L136:L155)");assert.equal(wwh.cells.U5.unit,'hours');assert.equal(wwh.cells.U5.numFmt,'0.00');for(const address of ['T5','V5','W5','X5']){assert.equal(wwh.cells[address].unit,'count');assert.equal(wwh.cells[address].numFmt,'0');}
 const summary=(await request('Supervisor','/dashboard/2026')).data.months[10];assert.equal(summary.flights,2);assert.equal(summary.budgetHours,122);assert.equal(summary.state,'surplus');assert.equal(summary.pax,600);
 assert.deepEqual(require('../public/public/has-report-math').calculate({A1:{value:'# Flights'},A2:{value:2},B1:{formula:'SUM(A1:A2)'}}),{B1:2});
});
