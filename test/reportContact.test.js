'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('index.js','utf8');
const block=source.slice(source.indexOf("app.post('/contact-form-submissions'"),source.indexOf("app.get('/miss-connection-report'"));
function route(send){let handler;const context={app:{post:(_path,fn)=>handler=fn},sanitizeCbsText:(value,max)=>String(value||'').slice(0,max),isValidEmail:()=>true,sanitizeContactAttachments:()=>[],sendContactFormToDiscord:send,console:{error:()=>{}}};vm.createContext(context);vm.runInContext(block,context);return handler;}
const body={date:'2026-11-01',name:'TEST',flightNo:'MU586',seatNumber:'1A',ticketNumber:'TEST',email:'test@example.com',phone:'123',attachments:[]};
test('contact form sends only Discord and succeeds only after delivery',async()=>{let calls=0,status,result;const handler=route(async()=>{calls++;return {sent:true};});await handler({body},{status(code){status=code;return this;},json(value){result=value;}});assert.equal(status,201);assert.equal(calls,1);assert.equal(result.discord.sent,true);assert.equal(result.email,undefined);});
test('contact Discord failure is returned as submission failure',async()=>{let status;await route(async()=>{throw Error('delivery failed');})({body},{status(code){status=code;return this;},json(){}});assert.equal(status,500);});
