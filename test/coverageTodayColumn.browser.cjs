const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express'),Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{registerStaffSchedule}=require('../has/server/staffSchedule'),{createEmployeeStore}=require('../has/server/employees');
(async()=>{
 const date='2026-10-31',db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT)');
 const rows=[['one','Lake','Agent'],['two','Vicky','Agent'],['three','Tamsun','Agent'],['sup','Grace','Supervisor'],['test','Michael','Agent'],['six','Watsika','Agent'],['seven','Nicholas','Agent'],['eight','Vanessa','Agent']].map(([id,nickname,position],i)=>({id,name:['Lake Xia','Vicky Chen','Tamsun Choong','Grace Smith','Michael Lee','Watsika Tupwat','Nicholas Hartowidjojo','Vanessa Gonzalez'][i],nickname,position,eid:String(1000+i),station:'LAX',account:'MU',loginId:id==='test'?'test@hm.com':''}));
 rows.push(...Array.from({length:18},(_,i)=>({id:'extra'+i,name:'Extra Staff '+i,nickname:'Extra '+i,position:'Agent',eid:String(2000+i),station:'LAX',account:'MU'})));
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles={linked:u=>employees.get().employees.find(e=>e.id===u.uid)},app=express();app.use(express.json());const authenticate=async req=>({uid:String(req.headers.authorization||'').replace('Bearer ','')}),schedule=registerStaffSchedule(app,{now:()=>new Date('2026-10-31T18:00:00Z'),employees,profiles,authenticate});
 const assignments=Object.fromEntries(rows.map((p,i)=>[p.id,{code:i%3===0?'D':i%3===1?'C':'X',color:i%3===0?'#ffd966':i%3===1?'#99ff00':'#ffffff'}]));assignments.one={code:'G',color:'#9371c7',remark:'Own note\nBring <b>documents</b>'};assignments.two={code:'F',color:'#9999ff',remark:'Colleague remark'};
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run(date,JSON.stringify({assignments,labels:['Holiday'],dateColor:'#00ff00'}));
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run('2026-11-07',JSON.stringify({assignments:{},labels:['Today','Short'],dateColor:null}));
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run('2026-11-12',JSON.stringify({assignments:{},labels:['Short'],dateColor:null}));
 app.get('/__/firebase/init.js',(_req,res)=>res.type('text/javascript').send("const uid=new URLSearchParams(location.search).get('user')||'one',user={uid,getIdToken:async()=>uid,providerData:[]};const auth={currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return ()=>{};}};window.firebase={apps:[{}],auth:()=>auth};"));
 app.get('/profile-api',async(req,res)=>{const p=profiles.linked(await authenticate(req));res.json({state:'ready',profile:{...p,canViewForm:false}});});app.get('/has-report-api/context',(_req,res)=>res.json({permissions:{},canAdmin:false}));app.use(require('../has/static').withShared(path.resolve('public/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),errors=[];context.setDefaultTimeout(15000);
 await context.route('**/www.gstatic.com/**',route=>route.fulfill({contentType:'text/javascript',body:''}));await context.addInitScript(()=>{window.MU_API_BASE=location.origin;});
 const pageFor=async(user,width=1440)=>{const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.setFixedTime(new Date(date+'T18:00:00Z'));await page.setViewportSize({width,height:950});await page.goto(origin+'/schedule.html?user='+user);await page.locator('#schedule-content').waitFor({state:'visible'});await page.locator('#schedule-requests-button').waitFor({state:'visible'});if(['sup','two'].includes(user)){try{await page.locator('#request-pending-reminder').waitFor({state:'visible',timeout:1500});await page.getByRole('button',{name:'Later',exact:true}).click();}catch{}}return page;};



 try{
  const page=await pageFor('sup'),table=page.locator('#coverage-table');await table.locator('tbody td.current-day').first().waitFor();
  const before=await table.locator('tbody td.current-day').evaluateAll(cells=>cells.map(cell=>({text:cell.textContent,value:cell.querySelector('input')?.value})));
  const fill=await page.locator('#schedule-table tbody td.current-day').first().evaluate(el=>getComputedStyle(el).backgroundImage);
  const styles=await table.locator('thead th.current-day,tbody td.current-day').evaluateAll(cells=>cells.map(cell=>({fill:getComputedStyle(cell).backgroundImage,color:getComputedStyle(cell).color,shadow:getComputedStyle(cell).boxShadow})));
  assert(styles.length>10);for(const style of styles){assert.equal(style.fill,fill);assert.equal(style.color,'rgb(255, 255, 255)');assert(style.shadow.includes('inset'));}
  const budget=table.locator('.daily-budget td.current-day input');assert.equal(await budget.evaluate(el=>getComputedStyle(el).color),'rgb(48, 32, 82)');assert.equal(await budget.isEditable(),true);
  assert.equal(await table.locator('tfoot .current-day').count(),0,'Period totals are not individual dates');
  fs.mkdirSync('.verification/coverage-today',{recursive:true});await page.locator('#coverage-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'.verification/coverage-today/desktop.png'});
  await page.locator('.coverage-grid').evaluate(el=>el.scrollLeft=25);assert.deepEqual(await table.locator('tbody td.current-day').evaluateAll(cells=>cells.map(cell=>({text:cell.textContent,value:cell.querySelector('input')?.value}))),before);
  assert.deepEqual(errors,[]);console.log('PASS: Coverage Today matches the purple 3D assignment strip across header, counts, Daily Hour and budget; values and editable budget preserved.');
 }finally{await browser.close();schedule.close();server.closeAllConnections();server.close();db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
