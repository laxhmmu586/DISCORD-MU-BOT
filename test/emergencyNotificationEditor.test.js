const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const model=require('../has/public/emergency-notification-model');
test('emergency editor renders seven calls, manager choices, defaults and saves structured contacts',async()=>{
 const {window,document}=parseHTML('<html><body><p id="checklist-status"></p><p id="checklist-scope"></p><section id="checklist-content"></section></body></html>');
 const create=document.createElement.bind(document);document.createElement=tag=>{const element=create(tag);element.scrollIntoView=()=>{};if(tag==='select')Object.defineProperty(element,'value',{writable:true,value:''});if(tag==='form')element.reportValidity=()=>true;return element;};
 let saved;window.emergencyNotification=model;window.hasReportRequest=async(path,body)=>{if(path==='/checklist')return {scope:{station:'LAX',account:'MU'},categories:[{name:'Safety',items:[{id:'emergency-notification',title:'Emergency Procedure Notification',format:'pdf',canEdit:true}]}]};if(body){saved=body;return {revision:2};}return {revision:1,values:{},contacts:model.normalize(),calls:model.calls,directory:[{name:'Shared General Manager',position:'General Manager'}],canEdit:true};};
 vm.runInNewContext(fs.readFileSync('has/public/has-checklist.js','utf8'),{window,document,URL,CustomEvent:window.CustomEvent,confirm:()=>true,setTimeout});
 window.dispatchEvent(new window.CustomEvent('has-report-context',{detail:{canChecklist:true}}));await new Promise(resolve=>setImmediate(resolve));
 const buttons=[...document.querySelectorAll('.word-report-actions button')];assert.equal(buttons[1].textContent,'Download PDF');await buttons[0].onclick();
 assert.equal(document.querySelectorAll('.emergency-call').length,7);assert.equal(document.querySelectorAll('[data-emergency-field]').length,13);assert(document.querySelector('select').textContent.includes('Shared General Manager'));
 assert.equal(document.querySelector('[data-emergency-field="call5Name"]').value,'Matthew Overmyer');assert.equal(document.querySelector('[data-emergency-field="call7Phone"]').value,'310-339-4207');
 for(const input of document.querySelectorAll('[data-emergency-field]'))if(!input.value)input.value=input.tagName==='SELECT'?'Shared General Manager':input.type==='tel'?'310-555-0100':'Contact name';
 await [...document.querySelectorAll('#emergency-editor>button')].at(-1).onclick();assert.equal(saved.revision,1);assert.equal(saved.values.call4Name,'Shared General Manager');assert.equal(Object.keys(saved.values).length,13);assert.equal(document.querySelector('#checklist-status').textContent,'Emergency procedure saved.');
});
