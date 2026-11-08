const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {messageForDevice}=require('../has/server/pushMessage');

// Exact receive handler shipped before Report Time and Announcement were added.
const legacyReceive=`self.addEventListener('push',event=>{
 let payload;try{payload=event.data.json().data;}catch{return;}
 if(!payload||!['approval_required','read_sign_required'].includes(payload.type))return;
 event.waitUntil(self.registration.showNotification(payload.title||'MUFC',{
  body:payload.body||'',icon:'/has/assets/push-icon-192.png',badge:'/has/assets/push-badge.png',
  tag:[payload.type,payload.source,payload.requestId,payload.approvalStage].join(':'),
  data:{url:['/schedule','/has-form','/read-sign'].includes(payload.url)?payload.url:'/home'}
 }));
});`;
async function deliver(worker,message){
 const handlers={},shown=[];let done;
 vm.runInNewContext(worker,{self:{addEventListener:(event,handler)=>handlers[event]=handler,registration:{showNotification:async(title,options)=>shown.push({title,options})}}});
 handlers.push({data:{json:()=>message},waitUntil:promise=>done=promise});await done;return shown;
}
for(const type of ['schedule_notification','schedule_announcement','hr_reminder'])test(type+' displays once on existing and updated Home Screen installations',async()=>{
 const payload={type,source:'schedule',requestId:'example',approvalStage:'notified',title:'Report Time',body:'An employee submitted a notification. No approval required.',url:'/schedule'};
 assert.equal((await deliver(legacyReceive,{data:payload})).length,0,'reproduce previously dropped notification');
 const message=messageForDevice('device-token',payload);
 assert.equal(message.data.eventType,type);assert.equal(payload.type,type);
 for(const worker of [legacyReceive,fs.readFileSync(require.resolve('../public/public/firebase-messaging-sw.js'),'utf8')]){
  const shown=await deliver(worker,message);assert.equal(shown.length,1);assert.equal(shown[0].title,payload.title);assert.equal(shown[0].options.body,payload.body);assert.equal(shown[0].options.data.url,type==='schedule_notification'&&worker!==legacyReceive?'/schedule?request=example':'/schedule');
 }
 assert.equal(message.notification,undefined,'worker is the sole notification display path');
});
test('approval and Read & Sign payloads keep their original envelope and click target',()=>{
 for(const type of ['approval_required','read_sign_required']){
  const data={type,title:'Existing notification',url:'/read-sign'};
  const message=messageForDevice('device-token',data);assert.deepEqual(message.data,data);assert.equal(message.token,'device-token');assert.equal(message.webpush.headers.Urgency,'high');
 }
});
test('visible web clients never suppress the phone service-worker notification',async()=>{const worker=fs.readFileSync(require.resolve('../public/public/firebase-messaging-sw.js'),'utf8'),handlers={},shown=[];let done;vm.runInNewContext(worker,{self:{addEventListener:(name,handler)=>handlers[name]=handler,clients:{matchAll:async()=>[{visibilityState:'visible'}]},registration:{showNotification:async(title)=>shown.push(title)}}});handlers.push({data:{json:()=>({data:{type:'approval_required',title:'Phone notification'}})},waitUntil:promise=>done=promise});await done;assert.deepEqual(shown,['Phone notification']);});

for(const existing of [false,true])test('schedule notification click opens its exact request in '+(existing?'an existing phone window':'a new phone window'),async()=>{
 const handlers={},shown=[],opened=[];let done;const client={url:'https://www.mufcapp.net/schedule',navigate:async url=>opened.push(url),focus:async()=>{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/public/firebase-messaging-sw.js'),'utf8'),{URL,self:{location:{origin:'https://www.mufcapp.net'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>shown.push(options)},clients:{matchAll:async()=>existing?[client]:[],openWindow:async url=>opened.push(url)}}});
 handlers.push({data:{json:()=>({data:{type:'approval_required',source:'schedule',requestId:'request-123',url:'/schedule'}})},waitUntil:promise=>done=promise});await done;
 handlers.notificationclick({notification:{data:shown[0].data,close(){}},waitUntil:promise=>done=promise});await done;assert.deepEqual(opened,['https://www.mufcapp.net/schedule?request=request-123']);
});
test('announcement and invalid request targets never become request links',async()=>{const worker=fs.readFileSync(require.resolve('../public/public/firebase-messaging-sw.js'),'utf8');for(const payload of [{type:'approval_required',eventType:'schedule_announcement',source:'schedule',url:'/schedule',requestId:'notice-123'},{type:'approval_required',source:'schedule',url:'/schedule',requestId:'<bad>&ref=anything'},{type:'approval_required',source:'schedule',url:'https://untrusted.invalid',requestId:'request-123'}]){const [notice]=await deliver(worker,{data:payload});assert.equal(notice.options.data.url,payload.url==='/schedule'?'/schedule':'/home');}});
