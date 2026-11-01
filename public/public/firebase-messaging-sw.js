// Data-only FCM messages: one notification in both foreground and background.
// No cache/fetch interception; existing page loading behavior is preserved.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let payload;try{payload=event.data.json().data;}catch{return;}
 if(!payload||!['approval_required','read_sign_required','schedule_notification','schedule_announcement'].includes(payload.type))return;
 event.waitUntil(self.registration.showNotification(payload.title||'MUFC',{
  body:payload.body||'',icon:'/has/assets/push-icon-192.png',badge:'/has/assets/push-badge.png',
  tag:[payload.eventType||payload.type,payload.source,payload.requestId,payload.approvalStage].join(':'),
  data:{url:['/schedule','/has-form','/read-sign'].includes(payload.url)?payload.url:'/home'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||'/home',self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.navigate(target);return existing.focus();}return self.clients.openWindow(target);
 }));
});
