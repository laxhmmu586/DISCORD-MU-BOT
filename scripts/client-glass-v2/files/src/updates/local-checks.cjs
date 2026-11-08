'use strict';
function applyLocalChecks(log,sy,{splitLogicalSections,findSYInfo,parseMealOrderEmail,compareGdPdfText}) {
 const sections=splitLogicalSections(log),steps=sy.crewApis?.steps||[];
 const gd=steps.find(s=>s.key==='gdCheck'),next=steps.find(s=>s.key==='nextDayInfo');
 if(next){
  const token=sy.flightDate,months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],m=String(token).match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const day=m?new Date(Date.UTC(2000+Number(m[3]),months.indexOf(m[2]),Number(m[1])+1)):null;
  const date=day?String(day.getUTCDate()).padStart(2,'0')+months[day.getUTCMonth()]+String(day.getUTCFullYear()).slice(-2):'';
  const future=date?findSYInfo(log,date,{preferredFlightNo:sy.flightNo,strictPreferredFlight:true,preparationLog:log}):null;
  const complete=Boolean(future?.reservationTicketed&&future?.jcsy?.complete&&future?.jcsy?.paginationComplete);
  Object.assign(next,{complete,searched:true,source:'local',time:complete?future.jcsy.time||'':'',details:complete?{flightNo:future.flightNo,flightDate:date}: {},reason:complete?'Next-day SY / JCSY complete in local logs; email delivery is not checked.':'Complete next-day SY / JCSY not found in local logs.',tooltip:complete?'Next-day local flight data verified.':'Complete next-day SY / JCSY not found in local logs.'});
 }
 sy.localChecks=true;
 return sy;
}
module.exports={applyLocalChecks};
