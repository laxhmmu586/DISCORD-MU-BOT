const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {DEFAULT_NOTICE}=require('../has/server/scheduleStandingNotice');
const source=fs.readFileSync('has/public/schedule-notices.js','utf8').split('// Persistent schedule policy, separate from expiring announcements.')[1];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const {window,document}=parseHTML('<html><body><main><div class="schedule-heading"></div></main></body></html>');
 let notice={body:DEFAULT_NOTICE,revision:0},writes=0,fail=false;
 const api=async(path,body)=>{assert.equal(path,'/staff-schedule-api/notice');if(body){writes++;if(fail)throw Error('Notice changed. Cancel and reopen the editor to load the latest version.');assert.equal(body.revision,notice.revision);notice={body:body.body,revision:notice.revision+1};}return {notice};};
 vm.runInNewContext(source,{window,document,peopleApi:api});
 const dialog=document.querySelector('dialog');dialog.close=()=>dialog.open=false;dialog.showModal=()=>dialog.open=true;
 const state=canEdit=>window.dispatchEvent(new window.CustomEvent('schedule-state',{detail:canEdit===null?null:{employeeId:'agent',canEdit}}));
 return {document,dialog,state,get writes(){return writes;},set fail(v){fail=v;}};
}
test('Notice renders safe bold reminders; only managers can open/save and role loss closes editor',async()=>{
 const f=fixture(),card=f.document.getElementById('schedule-standing-notice'),edit=card.querySelector('button');
 assert.equal(card.hidden,true);f.state(false);await settle();assert.equal(card.hidden,false);assert.equal(edit.hidden,true);assert.equal(card.querySelectorAll('li').length,3);assert.equal(card.querySelector('strong').textContent,'one month');
 f.state(true);await settle();assert.equal(edit.hidden,false);edit.onclick();assert.equal(f.dialog.open,true);
 const input=f.dialog.querySelector('textarea');input.value='<img src=x onerror=alert(1)> **Bold**';await f.dialog.querySelector('form').onsubmit({preventDefault(){}});
 assert.equal(f.writes,1);assert.equal(card.querySelector('img'),null);assert.match(card.textContent,/<img/);assert.equal(card.querySelector('strong').textContent,'Bold');
 edit.onclick();f.state(false);await settle();assert.equal(f.dialog.open,false);assert.equal(edit.hidden,true);
 await f.dialog.querySelector('form').onsubmit({preventDefault(){}});assert.equal(f.writes,1);
 f.state(null);assert.equal(card.hidden,true);assert.equal(card.querySelectorAll('li').length,0);
});
test('save conflicts retain the draft and provide a useful error',async()=>{
 const f=fixture();f.state(true);await settle();f.document.querySelector('#schedule-standing-notice button').onclick();
 const input=f.dialog.querySelector('textarea');input.value='My unsaved reminder';f.fail=true;
 await f.dialog.querySelector('form').onsubmit({preventDefault(){}});
 assert.equal(f.dialog.open,true);assert.equal(input.value,'My unsaved reminder');assert.match(f.dialog.querySelector('[role=status]').textContent,/Notice changed/);assert.equal(f.dialog.querySelector('[type=submit]').disabled,false);
});
