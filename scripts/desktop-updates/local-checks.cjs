'use strict';
function applyLocalChecks(log,sy,{splitLogicalSections,findSYInfo,parseMealOrderEmail,compareGdPdfText}) {
 const sections=splitLogicalSections(log),steps=sy.crewApis?.steps||[];
 const gd=steps.find(s=>s.key==='gdCheck'),next=steps.find(s=>s.key==='nextDayInfo');
 if(gd){
  const records=sections.filter(s=>/GENERAL\s+DECLARATION/i.test(s.content||''));
  const matches=records.map(s=>({section:s,result:compareGdPdfText(s.content,sy.crewApis?.gdCheckQuery?.crew||[],{flightNo:sy.flightNo,flightDate:sy.flightDate,aircraftRegistration:sy.aircraftRegistration})}));
  const found=matches.filter(m=>m.result.complete).at(-1);
  Object.assign(gd,{complete:Boolean(found),searched:true,source:'local',time:'',details:found?.result||{},reason:found?'Local GD record matches flight, date, registration and crew.':'No matching complete GD record found in local logs.',tooltip:found?'Local GD record verified; email delivery is not checked.':'No matching complete GD record found in local logs.'});
 }
 if(next){
  const token=sy.flightDate,months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],m=String(token).match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const day=m?new Date(Date.UTC(2000+Number(m[3]),months.indexOf(m[2]),Number(m[1])+1)):null;
  const date=day?String(day.getUTCDate()).padStart(2,'0')+months[day.getUTCMonth()]+String(day.getUTCFullYear()).slice(-2):'';
  const future=date?findSYInfo(log,date,{preferredFlightNo:sy.flightNo,strictPreferredFlight:true,preparationLog:log}):null;
  const complete=Boolean(future?.reservationTicketed&&future?.jcsy?.complete&&future?.jcsy?.paginationComplete);
  Object.assign(next,{complete,searched:true,source:'local',time:complete?future.jcsy.time||'':'',details:complete?{flightNo:future.flightNo,flightDate:date}: {},reason:complete?'Next-day SY / JCSY complete in local logs; email delivery is not checked.':'Complete next-day SY / JCSY not found in local logs.',tooltip:complete?'Next-day local flight data verified.':'Complete next-day SY / JCSY not found in local logs.'});
 }
 const meals=sections.filter(s=>/MEAL\s*ORDER|^>\s*MEAL\b/im.test(s.content||'')).map(s=>parseMealOrderEmail(s.content)).filter(m=>m.flightNo===sy.flightNo&&m.flightDate===sy.flightDate&&m.hasCabinCounts);
 sy.spml ||= {};sy.spml.email={...(meals.at(-1)||{}),found:meals.length>0,source:'local',reason:meals.length?'Meal order record found in local logs.':'No matching meal order record found in local logs.'};
 sy.localChecks=true;sy.desktopCloud={state:'ready',message:'GD, NEXTDAY and Meal Order checked in local logs.'};
 return sy;
}
module.exports={applyLocalChecks};
