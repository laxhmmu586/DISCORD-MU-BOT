const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');
const root = path.join(__dirname, '../has/public');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const pages = ['profile','has-form','has-report','read-sign','briefing','schedule','admin'];

function fixture(page, {mobile=false, storage=new Map()}={}) {
  const {window, document} = parseHTML(source(page + '.html'));
  const media = {matches:mobile,addEventListener(){}};
  const user = {uid:'employee',email:'employee@example.test',providerData:[],getIdToken:async()=>'fixture'};
  const auth = {currentUser:user,onAuthStateChanged(){}};
  const firebase = {apps:[{}],auth:()=>auth}; window.firebase = firebase;
  const store = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  const context = vm.createContext({window,document,firebase,location:{pathname:'/'+page},matchMedia:()=>media,localStorage:store,sessionStorage:store,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,Intl,Date,setInterval(){},setTimeout,clearTimeout,console});
  return {window,document,context,media,storage};
}

for (const page of pages) test(page + ': glass shell preserves controls and dialogs, hides top tabs and gates navigation', async () => {
  const f = fixture(page), main = f.document.querySelector('main.profile-shell');
  const controls = [...main.querySelectorAll('input,select,textarea,button,form')];
  const dialogs = [...f.document.querySelectorAll('dialog')];
  const account = f.document.getElementById('flight-account');
  vm.runInContext(source('workspace-shell.js'), f.context);
  assert.equal(f.document.querySelector('.app-frame main'), main);
  assert.equal(f.document.getElementById('flight-account'), account);
  assert.equal(f.document.querySelector('.home-brand').getAttribute('href'),'/profile');
  for (const control of controls) assert(main.contains(control), 'existing control was moved out of its page');
  for (const dialog of dialogs) assert(f.document.body.contains(dialog));
  assert.equal(f.document.querySelectorAll('.profile-topbar .top-nav').length, 0, 'Home/HR/Finance belong only to Home');
  assert.equal(f.document.querySelectorAll('.profile-sidebar a[href="/profile"]').length, 0);
  for (const href of ['/has-form','/has-report','/briefing','/schedule']) assert.equal(f.document.querySelector('.profile-sidebar a[href="'+href+'"]').hidden, true);
  assert.equal(f.document.querySelector('.profile-sidebar a[href="/read-sign"]').hidden, false);
  vm.runInContext(source('flight-account.js'), f.context);
  f.window.dispatchEvent(new f.window.CustomEvent('employee-profile-updated',{detail:{name:'Staff',station:'SFO',account:'XX',canViewForm:false,canViewOperations:false}}));
  assert.equal(f.document.querySelector('.profile-sidebar a[href="/has-form"]').hidden, true);
  assert.equal(f.document.querySelector('.profile-sidebar [data-schedule-nav]').hidden, true);
  f.window.dispatchEvent(new f.window.CustomEvent('employee-profile-updated',{detail:{name:'Staff',station:'LAX',account:'MU',canViewForm:true,canViewOperations:true}}));
  assert.equal(f.document.querySelector('.profile-sidebar a[href="/has-form"]').hidden, false);
  assert.equal(f.document.querySelector('.profile-sidebar [data-briefing-nav]').hidden, false);
  assert.equal(f.document.querySelector('.profile-sidebar [data-schedule-nav]').hidden, false);
  assert.equal(f.document.querySelector('.profile-sidebar a[data-report-access]').hidden, true, 'operation access does not grant report access');
  await new Promise(resolve=>setTimeout(resolve,0));
  for (const icon of f.document.querySelectorAll('.profile-sidebar .art-icon')) {
    const name = [...icon.classList].find(cls=>cls.startsWith('icon-')).slice(5);
    assert(fs.existsSync(path.join(root,'assets','home-icon-'+name+(name==='request'?'-v3':['briefing','schedule'].includes(name)?'-v1':'-v2')+'.webp')));
  }
});

test('sidebar compaction persists across page changes and mobile drawer uses the same menu button', () => {
  const first = fixture('profile'); vm.runInContext(source('workspace-shell.js'), first.context);
  first.document.querySelector('.sidebar-collapse').click();
  assert(first.document.body.classList.contains('sidebar-collapsed'));
  const next = fixture('has-form',{storage:first.storage,mobile:true}); vm.runInContext(source('workspace-shell.js'), next.context);
  assert(next.document.body.classList.contains('sidebar-collapsed'));
  assert.equal(next.document.querySelector('.profile-sidebar').inert, true);
  next.document.querySelector('.menu-toggle').click();
  assert(next.document.body.classList.contains('sidebar-open'));
  assert.equal(next.document.querySelector('.profile-sidebar').inert, false);
  next.document.querySelector('.sidebar-scrim').click();
  assert.equal(next.document.querySelector('.menu-toggle').getAttribute('aria-expanded'), 'false');
});

test('employee art changes only on page entry, is random, and never repeats the last portrait', () => {
  const storage = new Map(); let previous;
  for (let i=0;i<10;i++) {
    const f = fixture(i%2?'has-report':'profile',{storage}); vm.runInContext(source('workspace-shell.js'), f.context);
    f.context.setInterval = () => assert.fail('employee art must not use a rotation timer');
    vm.runInContext(source('employee-sidebar-art.js'), f.context);
    const image = f.document.getElementById('has-sidebar-employee'); assert(image);
    assert.notEqual(image.src, previous); previous = image.src;
    vm.runInContext(source('employee-sidebar-art.js'), f.context);
    assert.equal(f.document.getElementById('has-sidebar-employee').src, previous, 'reinitializing the same page keeps its portrait');
  }
});

test('development Home is not linked from navigation; Report/Request/Read & Sign retain their services', () => {
  const f = fixture('home');
  assert.equal(f.document.querySelector('.home-brand').getAttribute('href'),'/profile');
  assert.equal(f.document.querySelectorAll('.top-nav>a,.top-nav>details').length, 2);
  assert.equal(f.document.querySelector('a[href="/home"]'),null);
  assert.deepEqual([...f.document.querySelectorAll('.shortcuts>a')].map(a=>a.getAttribute('href')), ['/has-report','/has-form','/read-sign']);
  assert.equal(f.document.querySelector('.profile-sidebar [data-briefing-nav]').hidden, true);
  assert.equal(f.document.querySelector('.profile-sidebar [data-schedule-nav]').hidden, true);
  assert.equal(f.document.querySelector('.profile-sidebar a[href="/profile"]'), null);
});

test('Home To-do tabs filter approval actions and unsigned memos, and hide empty count badges', () => {
  const f = fixture('home'); f.context.ResizeObserver = class {observe(){}};
  vm.runInContext(source('home.js'), f.context);
  const update = detail => f.window.dispatchEvent(new f.window.CustomEvent('request-inbox-updated',{detail}));
  update({groups:[],rows:[{kind:'uniform',r:{id:'review',title:'Review me',canReview:true}},{kind:'uniform',r:{id:'done',title:'Already approved'}}],scheduleItems:[{label:'Shift approval',href:'/schedule?request=shift',canReview:true},{label:'Approval notification',href:'/schedule?request=old'}],signCount:2,readSignMemos:[{id:'pending',subject:'Pending memo',myStatus:'pending'},{id:'late',subject:'Late memo',myStatus:'overdue'},{id:'signed',subject:'Signed memo',myStatus:'signed'}]});
  assert.equal(f.document.getElementById('home-approve-count').textContent,'2');
  assert.equal(f.document.querySelectorAll('#home-approve-panel .home-task-row').length,2);
  assert.equal(f.document.querySelectorAll('#home-sign-panel .home-task-row').length,2);
  assert.equal(f.document.querySelector('#home-sign-panel .is-overdue').textContent,'Overdue · Awaiting your signature');
  f.document.getElementById('home-tab-sign').click();
  assert.equal(f.document.getElementById('home-sign-panel').hidden,false);
  assert.equal(f.document.getElementById('home-approve-panel').hidden,true);
  update({groups:[],rows:[],scheduleItems:[],signCount:0,readSignMemos:[]});
  for(const id of ['home-approve-count','home-sign-count']){assert.equal(f.document.getElementById(id).hidden,true);assert.equal(f.document.getElementById(id).textContent,'');}
});

test('roster and coverage retain aligned 240px desktop identity columns and unchanged mobile/day widths', () => {
  const {document}=parseHTML('<div><table id="roster"><colgroup><col class="employee-column"><col><col></colgroup><thead><tr class="date-heading"><th class="employee-cell"></th><th></th><th></th></tr></thead><tbody><tr><th class="employee-cell"></th><td></td><td></td></tr></tbody></table></div><div><table id="coverage"><colgroup><col class="employee-column"><col><col></colgroup><thead><tr class="date-heading"><th class="employee-cell"></th><th></th><th></th></tr></thead><tbody><tr><th class="employee-cell"></th><td></td><td></td></tr></tbody></table></div>');
  const js=source('schedule.js'), sizing=js.slice(js.indexOf(' function sizeColumns('),js.indexOf(' function assignmentChip('));
  const context=vm.createContext({data:{canViewAll:true,days:[{},{}]},renderedMobile:false,mobileColumns:()=>({nameWidth:92,dayWidth:28})});vm.runInContext(sizing,context);
  for(const table of document.querySelectorAll('table')){
    context.sizeColumns(table);
    assert.equal(table.querySelector('.employee-cell').style.width,'240px');
    assert.equal(table.querySelector('col:not(.employee-column)').style.width,'54px');
    assert.equal(table.style.width,'348px');
  }
  context.renderedMobile=true;context.sizeColumns(document.getElementById('roster'));
  assert.equal(document.querySelector('#roster .employee-cell').style.width,'92px');
  assert.equal(document.querySelector('#roster col:not(.employee-column)').style.width,'28px');
});

test('LAX/MU Briefing and Schedule stay in the left sidebar after account-header initialization, including mobile', async () => {
  for(const mobile of [false,true]){
    const f=fixture('profile',{mobile});f.context.fetch=()=>new Promise(()=>{});
    vm.runInContext(source('workspace-shell.js'),f.context);
    vm.runInContext(source('flight-account.js'),f.context);
    f.window.dispatchEvent(new f.window.CustomEvent('employee-profile-updated',{detail:{name:'Staff',station:'LAX',account:'MU',canViewOperations:true,canViewForm:true}}));
    f.window.RequestInbox={data:{rows:[],groups:[],scheduleItems:[],signCount:0},load:async()=>{}};
    vm.runInContext(source('workspace-header.js'),f.context);
    await new Promise(resolve=>setTimeout(resolve,0));
    for(const selector of ['[data-briefing-nav]','[data-schedule-nav]']){
      const link=f.document.querySelector(selector);assert(link);assert.equal(link.hidden,false);assert(f.document.querySelector('.profile-sidebar').contains(link));assert.equal(f.document.querySelector('.profile-topbar').contains(link),false);
    }
    const navigation=[...f.document.querySelectorAll('.profile-sidebar nav a')].filter(link=>!link.hidden).map(link=>link.getAttribute('href'));
    assert.deepEqual(navigation.slice(0,2),['/briefing','/schedule']);
    assert.equal(navigation.at(-1),'/has-pbb.html');
    assert.equal(navigation.includes('/home'),false);
    assert.equal(f.document.body.classList.contains('workspace-has-features'),false,'sidebar features must not trigger the legacy mobile top-row layout');
  }
});
