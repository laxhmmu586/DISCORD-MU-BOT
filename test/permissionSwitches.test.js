const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const employeePermissions=require('../has/public/employee-permissions');
test('permission switches display effective permissions and save changed exceptions while retaining untouched settings',async()=>{
 const {window,document}=parseHTML('<html><body><p id="permission-status"></p><div id="permission-list"></div><button id="save-permissions"></button></body></html>');
 const row={id:'agent',position:'Agent',permissionOverrides:{'briefing.edit':true,'report.da':false}},actor={id:'admin',position:'Business Manager'},data={revision:1,employees:[row,actor]};let payload;
 const source=fs.readFileSync('has/public/hr.js','utf8'),start=source.indexOf('  function renderPermissions('),end=source.indexOf("  $('#person-form').addEventListener",start);
 const context=vm.createContext({document,employeePermissions,data,selected:'agent',saving:false,preview:false,role:()=>({mode:'admin',employeeId:'admin'}),$:selector=>document.querySelector(selector),escape:value=>String(value),api:async options=>{payload=JSON.parse(options.body);return {...data,revision:2,employees:[{...row,permissionOverrides:payload.permissions},actor]};}});
 vm.runInContext(source.slice(start,end),context);context.renderPermissions(row,true);
 const switches=[...document.querySelectorAll('[role="switch"]')];assert.equal(switches.length,employeePermissions.catalog.length+1);assert.equal(document.querySelectorAll('select').length,0);assert.equal(switches.at(-1).getAttribute('aria-label'),'Disable account');
 for(const input of switches)input.checked=input.hasAttribute('checked');
 const briefing=document.querySelector('[data-permission-key="briefing.edit"]'),schedule=document.querySelector('[data-permission-key="schedule.edit"]');assert(briefing.checked);assert(!schedule.checked);
 briefing.checked=false;briefing.dispatchEvent(new window.Event('change',{bubbles:true}));schedule.checked=true;schedule.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(schedule.closest('.hr-permission-control').querySelector('b').textContent,'Allowed');
 await document.querySelector('#save-permissions').onclick();assert.equal(payload.permissions['schedule.edit'],true);assert.equal(payload.permissions['report.da'],false);assert(!Object.hasOwn(payload.permissions,'briefing.edit'));assert.equal(payload.revision,1);
 context.renderPermissions({...row,isServerOwner:true},true);assert([...document.querySelectorAll('[role="switch"]')].every(input=>input.disabled),'owner permissions cannot be disabled');
 context.renderPermissions(row,false);assert([...document.querySelectorAll('[role="switch"]')].every(input=>input.disabled));
});
