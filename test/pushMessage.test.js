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
for(const type of ['schedule_notification','schedule_announcement'])test(type+' displays once on existing and updated Home Screen installations',async()=>{
 const payload={type,source:'schedule',requestId:'example',approvalStage:'notified',title:'Report Time',body:'An employee submitted a notification. No approval required.',url:'/schedule'};
 assert.equal((await deliver(legacyReceive,{data:payload})).length,0,'reproduce previously dropped notification');
 const message=messageForDevice('device-token',payload);
 assert.equal(message.data.eventType,type);assert.equal(payload.type,type);
 for(const worker of [legacyReceive,fs.readFileSync(require.resolve('../public/public/firebase-messaging-sw.js'),'utf8')]){
  const shown=await deliver(worker,message);assert.equal(shown.length,1);assert.equal(shown[0].title,payload.title);assert.equal(shown[0].options.body,payload.body);assert.equal(shown[0].options.data.url,'/schedule');
 }
 assert.equal(message.notification,undefined,'worker is the sole notification display path');
});
test('approval and Read & Sign payloads keep their original envelope and click target',()=>{
 for(const type of ['approval_required','read_sign_required']){
  const data={type,title:'Existing notification',url:'/read-sign'};
  const message=messageForDevice('device-token',data);assert.deepEqual(message.data,data);assert.equal(message.token,'device-token');assert.equal(message.webpush.headers.Urgency,'high');
 }
});
