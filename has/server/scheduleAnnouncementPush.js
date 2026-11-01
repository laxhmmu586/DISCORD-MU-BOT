function createAnnouncementPush({db,profiles,canAccess,findNotice}) {
 const service=require('./approvalPush').getPushService(db);
 if(!service)return ()=>{};
 const source='schedule_announcement',stage='published';
 const resolve=(uid,id)=>{
  const account=db.prepare('SELECT provider FROM employee_accounts WHERE uid=?').get(uid);
  if(!account)return null;
  const employee=profiles.linked({uid,email:'',provider:account.provider});
  if(!canAccess(employee))return null;
  const announcement=findNotice?.(id)||db.prepare('SELECT id,title,body,expires_at FROM staff_schedule_announcements WHERE id=?').get(id);
  if(!announcement||(announcement.expires_at&&Date.parse(announcement.expires_at)<=Date.now()))return null;
  return {stage,announcement};
 };
 service.resolvers.set(source,resolve);
 return id=>{
  for(const {uid} of db.prepare('SELECT uid FROM employee_accounts').all()){
   const current=resolve(uid,id);if(!current)continue;
   const notice=current.announcement;
   service.enqueue(source,id,stage,uid,{notificationKey:'schedule_announcement',station:'LAX',account:'MU',type:'schedule_announcement',source,requestId:id,approvalStage:stage,title:id.startsWith('short-')?'You have a new announcement':notice.title,body:notice.body.slice(0,1000),url:'/schedule'});
  }
  setImmediate(()=>{if(db.open)service.flush().catch(()=>console.error('Schedule announcement push processing failed'));});
 };
}
module.exports={createAnnouncementPush};
