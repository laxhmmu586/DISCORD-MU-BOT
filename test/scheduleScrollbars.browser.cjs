const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{roles,colors}=require('../has/server/staffSchedule'),summary=require('../has/public/schedule-summary');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);await page.clock.setFixedTime(new Date('2026-10-27T18:00:00Z'));await page.addInitScript(()=>{const interval=window.setInterval;window.setInterval=(callback,ms,...args)=>{if(ms===60000&&String(callback).includes('liveDay'))window.testScheduleRefresh=callback;return interval(callback,ms,...args);};});
 let requestPending=0,mode='supervisor',horizon='2027-02-28',sync={enabled:true,state:'synced',queued:0,conflicts:0};
 const avatar='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#d7e9f6"/><circle cx="30" cy="22" r="12" fill="#9c705c"/><path d="M8 60a22 25 0 0 1 44 0" fill="#354e6e"/></svg>');
 const employees=Array.from({length:15},(_,i)=>({id:'e'+i,name:'Example Employee '+(i+1),eid:String(24000+i),code:i===1?'':'S-'+(i+1),position:i===0?'Business Manager':i===1?'Supervisor':'Agent',scheduleGroup:i===0?'Business Manager':i===1?'Supervisor':i<6?'Flight Control':i===6?'Bagroom':i<10?'Arrival':'Check-in',avatar:i===4?'':avatar}));
 employees[3].name='HARTOWIDJOJO, NICHOLAS';
 const records=new Map();function record(date){if(!records.has(date))records.set(date,{date,revision:1,budget:61,dateColor:'#fff2cc',labels:[],assignments:Object.fromEntries(employees.map((e,j)=>{const code=j<4?['D','F','C','A'][j]:'X';return [e.id,{code,color:colors[code]}];}))});return records.get(date);}
 const calculate=day=>({...day,planned:summary.dailyTotal(day,employees)}),period=start=>({start,end:summary.addDays(start,6),...summary.weekly(Array.from({length:7},(_,i)=>calculate(record(summary.addDays(start,i)))))}),decorate=day=>({...calculate(day),period:period(summary.periodStart(day.date)),sync});
 function context(url){const month=url.searchParams.get('month'),start=month?month+'-01':url.searchParams.get('start')||'2026-10-27',end=month?new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10):[horizon,summary.addDays(start,13)].sort().at(-1),days=[];for(let date=start;date<=end;date=summary.addDays(date,1))days.push(record(date));const all=mode==='supervisor'&&url.searchParams.get('view')!=='self';return {schemaVersion:2,requestPending,employeeId:'e0',canEdit:all,canViewAll:all||mode==='agent',roles,colors,start,end,horizon,...(all?{dailyBudget:61,periods:summary.periods(days).map(p=>period(p.start)),sync}:{}),employees:all||mode==='agent'?employees:employees.slice(0,1),days:all?days.map(calculate):days.map(d=>({date:d.date,dateColor:d.dateColor,labels:d.labels,assignments:mode==='agent'?d.assignments:{e0:d.assignments.e0}}))};}
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(url.hostname==='www.gstatic.com')return route.fulfill({body:'',contentType:'text/javascript'});
  if(p==='/__/firebase/init.js')return route.fulfill({contentType:'text/javascript',body:`const user={uid:'e0',email:'example@example.test',providerData:[],getIdToken:async()=>'fixture'};const auth={currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return ()=>{};}};window.firebase={apps:[{}],auth:()=>auth};`});
  if(p==='/profile-api')return route.fulfill({json:{state:'ready',profile:{canViewForm:mode==='supervisor',name:mode==='blocked'?'DEMO HAS':'Example',station:'LAX',account:mode==='other'?'CZ':'MU'}}});
  if(p.startsWith('/has-page-api/'))return route.fulfill({json:{canAccess:true,canEdit:false}});
  if(p==='/has-report-api/context')return route.fulfill({json:{permissions:{},canAdmin:false}});
  if(p.startsWith('/staff-schedule-api')){
   if(p.endsWith('/stream'))return route.fulfill({status:503,json:{error:'Live transport is covered by the real-API suite'}});
   if(p.endsWith('/requests'))return route.fulfill({json:{employeeId:'e0',canManage:mode==='supervisor',requests:[],notifications:[],pending:0,unread:0}});
   if(p.endsWith('/announcements'))return route.fulfill({json:{announcements:[]}});
   if(p.endsWith('/revision'))return route.fulfill({json:{revision:'fixture-stable'}});
   if(url.pathname!=='/staff-schedule-api')return route.fulfill({json:{}});return route.fulfill({json:context(url)});
  }
  if(url.hostname==='api.mufcapp.net')return route.fulfill({json:{}});
const sourceFile=path.join(process.cwd(),'has/public',(p==='/schedule'?'/schedule.html':p).replace(/^\/has\//,'/'));const file=fs.existsSync(sourceFile)?sourceFile:path.join(process.cwd(),'public/public',p);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
 });

 try{
  record('2026-11-12').labels=['Short'];
  fs.mkdirSync('.verification/schedule-scrollbars',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost/schedule.html',{waitUntil:'domcontentloaded'});await page.locator('#schedule-content').waitFor({state:'visible'});
  const top=page.locator('#schedule-top-scroll');
  const aligned=async()=>page.waitForFunction(()=>{const top=document.querySelector('#schedule-top-scroll'),grid=document.querySelector('#schedule-table').parentElement,coverage=document.querySelector('#coverage-table').parentElement;return Math.abs(top.scrollLeft-grid.scrollLeft)<=1&&Math.abs(coverage.scrollLeft-grid.scrollLeft)<=1;});
  for(const width of [1440,900,1920]){console.log('Desktop width:',width);
   await page.setViewportSize({width,height:1000});await top.waitFor({state:'visible'});
   await page.waitForFunction(()=>{const top=document.querySelector('#schedule-top-scroll'),grid=document.querySelector('#schedule-table').parentElement;return Math.abs((top.scrollWidth-top.clientWidth)-(grid.scrollWidth-grid.clientWidth))<=1;});
   assert.equal(await top.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor),'rgb(100, 116, 239)');
   assert.equal(await page.locator('#schedule-table').evaluate(el=>getComputedStyle(el.parentElement,'::-webkit-scrollbar-thumb').backgroundColor),'rgb(100, 116, 239)');
   for(const [selector,left] of [['#schedule-top-scroll',350],['#schedule-table',700],['#coverage-table',1050],['#schedule-top-scroll','end']]){
    await page.locator(selector).evaluate((el,left)=>{const surface=el.tagName==='TABLE'?el.parentElement:el;surface.scrollLeft=left==='end'?surface.scrollWidth:left;},left);await aligned();
   }
   await top.evaluate(el=>el.scrollLeft=0);await aligned();await top.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('#schedule-top-scroll').scrollLeft>0);await aligned();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:1440,height:1000});await top.evaluate(el=>el.scrollLeft=0);await aligned();await top.scrollIntoViewIfNeeded();const track=await top.boundingBox(),thumbWidth=await top.evaluate(el=>el.clientWidth*el.clientWidth/el.scrollWidth);await page.mouse.move(track.x+thumbWidth/2,track.y+track.height-7);await page.mouse.down();await page.mouse.move(track.x+thumbWidth/2+80,track.y+track.height-7,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#schedule-top-scroll').scrollLeft>0);await aligned();await top.evaluate(el=>el.scrollLeft=300);await aligned();await top.scrollIntoViewIfNeeded();
  assert(await top.evaluate(el=>{const layer=el.parentElement.querySelector(':scope > .schedule-ribbon-overlay');return Number(getComputedStyle(layer).zIndex)>Number(getComputedStyle(el).zIndex)&&el.parentElement.classList.contains('schedule-ribbon-frame');}),'Ribbons must layer above scrollbar');

  await top.evaluate(el=>el.blur());await page.screenshot({path:'.verification/schedule-scrollbars/desktop.png'});
  for(const mobileMode of ['supervisor','agent'])for(const width of [390,600,760]){
   console.log('Mobile:',mobileMode,width);mode=mobileMode;await page.setViewportSize({width,height:900});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#schedule-content').waitFor({state:'visible'});assert.equal(await top.isVisible(),false);
   assert(await page.evaluate(()=>[document.documentElement,document.body,...document.querySelectorAll('body *')].every(el=>getComputedStyle(el).scrollbarWidth==='none')));
   assert(await page.evaluate(()=>[document.documentElement,document.body,...document.querySelectorAll('body *')].every(el=>getComputedStyle(el,'::-webkit-scrollbar').display==='none')));
   const scroll=width<=600?page.locator('.team-week-scroll'):page.locator('#schedule-table').locator('..');await scroll.evaluate(el=>el.scrollLeft=0);const box=await scroll.boundingBox();await page.mouse.move(box.x+box.width/2,Math.max(100,Math.min(box.y+30,850)));await page.mouse.wheel(300,0);await page.waitForFunction(selector=>{const el=selector==='table'?document.querySelector('#schedule-table').parentElement:document.querySelector('.team-week-scroll');return el.scrollLeft>0;},width<=600?'mobile':'table');
   if(width===390)await page.screenshot({path:'.verification/schedule-scrollbars/mobile-'+mobileMode+'.png'});
  }
  mode='supervisor';await page.setViewportSize({width:1440,height:1000});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#schedule-content').waitFor({state:'visible'});await top.waitFor({state:'visible'});await aligned();assert.deepEqual(errors,[]);
  console.log('PASS: blue desktop scrollbars, top/grid/coverage sync at 3 widths and end of range, keyboard scroll, thumb dragging, ribbons above scrollbar, hidden mobile scrollbars with horizontal gestures, desktop restoration.');
 }catch(error){console.error('Failure:',error);console.error('Page errors:',errors);console.error('Schedule status:',await page.locator('#schedule-status').textContent());await page.screenshot({path:'.verification/schedule-scrollbars/failure.png'});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
