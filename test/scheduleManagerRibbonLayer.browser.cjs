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
  fs.mkdirSync('.verification/manager-ribbon-layer',{recursive:true});
  const page=await pageFor('sup',390);
  const scroll=page.locator('.team-week-scroll');
  const assertUncovered=async()=>{
   const badge=page.locator('.schedule-native-ribbon-host [data-ribbon-art="today-holiday"]');await badge.waitFor();
   const result=await badge.evaluate(badge=>{
    const label=badge.querySelector('.date-status-face span:last-child'),rect=label.getBoundingClientRect(),cell=badge.closest('th').getBoundingClientRect();
    const host=badge.closest('.schedule-native-ribbon-host');host.style.pointerEvents='auto';for(const el of host.querySelectorAll('*'))el.style.pointerEvents='auto';
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    const result={crossesDate:rect.x+rect.width/2>cell.right,uncovered:badge.contains(hit),hit:hit?.outerHTML.slice(0,160),offset:rect.y-cell.y};
    host.style.pointerEvents='';for(const el of host.querySelectorAll('*'))el.style.pointerEvents='';return result;
   });
   assert(result.crossesDate,'Regression must check the label extending into the next date');
   assert(result.uncovered,'Adjacent header must not cover ribbon text: '+JSON.stringify(result));return result.offset;
  };
  for(const width of [390,375,430]){
   await page.setViewportSize({width,height:950});await scroll.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});await page.waitForTimeout(100);
   await page.locator('.schedule-native-ribbon-host').first().scrollIntoViewIfNeeded();
   const offset=await assertUncovered();
   for(const top of [60,140,0]){await scroll.evaluate((el,top)=>el.scrollTop=top,top);await page.waitForTimeout(60);assert(Math.abs(await assertUncovered()-offset)<1,'Header and ribbon scroll together');}
   await page.screenshot({path:'.verification/manager-ribbon-layer/manager-'+width+'.png',fullPage:true});
   await scroll.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(60);
   const last=page.locator('.schedule-native-ribbon-host [data-ribbon-date="2026-11-12"]');await last.waitFor();assert(await last.isVisible());
   await scroll.evaluate(el=>el.scrollLeft=0);
  }
  const employee=await pageFor('one',390);await employee.locator('.schedule-mobile-ribbon-frame .date-badges .date-status').first().waitFor();assert.equal(await employee.locator('.schedule-native-ribbons').count(),0);await employee.screenshot({path:'.verification/manager-ribbon-layer/employee.png',fullPage:true});
  await page.setViewportSize({width:1440,height:950});await page.locator('#schedule-table').waitFor({state:'visible'});await page.locator('.schedule-ribbon-frame[data-primary=true]>.schedule-ribbon-overlay .date-status').first().waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: Manager ribbon text remains above adjacent headers at 375/390/430px through vertical and horizontal scroll; employee and desktop renderers remain available.');
 }finally{await browser.close();schedule.close();server.closeAllConnections();server.close();db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
