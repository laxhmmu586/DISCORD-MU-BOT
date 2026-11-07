// Data-only FCM messages: one notification in both foreground and background.
// No cache/fetch interception; existing page loading behavior is preserved.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Persist only the count and opaque item keys, independently of page/login storage.
// Serialize events so simultaneous pushes and foreground refreshes cannot lose writes.
let badgeQueue = Promise.resolve();
function updateBadge(change) {
 if (!self.navigator?.setAppBadge || !self.caches) return Promise.resolve();
 badgeQueue = badgeQueue.catch(()=>{}).then(async()=>{
  const cache = await self.caches.open('mufc-app-badge-v1');
  const key = new URL('/__mufc_app_badge__',self.location.origin).href;
  const response = await cache.match(key);
  const state = change(response ? await response.json() : {uid:null,count:0,keys:[],history:[]});
  if (!state) return;
  await cache.put(key,new Response(JSON.stringify(state)));
  if (state.count) await self.navigator.setAppBadge(state.count);
  else await self.navigator.clearAppBadge();
 }).catch(()=>{}); // A badge failure must never prevent delivery of a notification.
 return badgeQueue;
}
self.addEventListener('message',event=>{
 const data=event.data;
 if(data?.type!=='MUFC_BADGE_SYNC' || !event.source?.url
   || new URL(event.source.url).origin!==self.location.origin
   || !(data.uid===null || typeof data.uid==='string')
   || !Number.isSafeInteger(data.count) || data.count<0
   || !Array.isArray(data.keys) || data.keys.length>2000 || data.keys.some(key=>typeof key!=='string'))return;
 event.waitUntil(updateBadge(previous=>({uid:data.uid,count:data.uid?data.count:0,
  signedOut:!data.uid,keys:data.uid?data.keys:[],
  history:data.uid&&previous.uid===data.uid?(previous.history||[]):[]})));
});
function pushBadge(payload) {
 if(!payload.badgeUid || !payload.badgeKey)return Promise.resolve();
 return updateBadge(previous=>{
  if(previous.signedOut || previous.uid && previous.uid!==payload.badgeUid)return null;
  const eventId=payload.badgeEventId||payload.badgeKey;
  if((previous.history||[]).includes(eventId))return null;
  const alreadyPending=previous.keys.includes(payload.badgeKey);
  return {...previous,uid:payload.badgeUid,count:previous.count+(alreadyPending?0:1),
   keys:alreadyPending?previous.keys:[...previous.keys,payload.badgeKey],
   history:[...(previous.history||[]),eventId].slice(-500)};
 });
}
self.addEventListener('push',event=>{
 let payload;try{payload=event.data.json().data;}catch{return;}
 if(!payload||!['approval_required','read_sign_required','schedule_notification','schedule_announcement','hr_reminder'].includes(payload.type))return;
 event.waitUntil(Promise.all([pushBadge(payload),self.registration.showNotification(payload.title||'MUFC',{
  body:payload.body||'',icon:'/has/assets/push-icon-192.png',badge:'/has/assets/push-badge.png',
  tag:[payload.eventType||payload.type,payload.source,payload.requestId,payload.approvalStage].join(':'),
  data:{url:['/schedule','/has-form','/read-sign'].includes(payload.url)?payload.url:'/home'}
 }),self.clients?.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  for(const client of windows)client.postMessage({type:'MUFC_BADGE_PUSH'});
 }).catch(()=>{})]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||'/home',self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.navigate(target);return existing.focus();}return self.clients.openWindow(target);
 }));
});
