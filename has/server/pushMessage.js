function messageForDevice(token,payload){
 // Existing Home Screen installations may still run the original worker, which
 // accepts only these two envelope types. Keep the real event type separately.
 const data=['schedule_notification','schedule_announcement','hr_reminder'].includes(payload.type)
  ? {...payload,eventType:payload.type,type:'approval_required'}
  : {...payload};
 return {token,data,webpush:{headers:{TTL:'86400',Urgency:'high'}}};
}
module.exports={messageForDevice};
