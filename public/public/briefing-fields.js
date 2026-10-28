(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BriefingFields=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const counter=[['counterSupervisor','On Duty / Supervisor / Lead'],['flightControl','Flight Control'],['bagroom','Bagroom'],['lostFound','Lost & Found'],...Array.from({length:10},(_,i)=>['counterA'+(59+i),'A'+(59+i)])];
 const gate=[['gateLead','Gate Lead'],['gateAssist','Gate Assist'],['preBoard','Pre-board / Manual Line'],['boarding1','Boarding 1'],['boarding2','Boarding 2'],['passport1','Passport Check 1'],['passport2','Passport Check 2'],['gateBag','Gate Bag / Boxcount'],['spotter','Spotter / Boxcount'],['gateAnnouncement','Announcement'],['lounge','Lounge / Wheelchair'],['departureJetBridge','Jet-Bridge']];
 const specials=[['wchr','WCHR'],['wchc','WCHC'],['um','UM'],['blnd','BLND'],['interline','Interline'],['deaf','DEAF'],['edi','EDI'],['stcr','STCR'],['avih','AVIH'],['petc','PETC'],['vip','VIP/CIP'],['inad','INAD'],['maas','MAAS'],['dep','DEP']];
 const defaults={gateLeadTime:'',gateAssistTime:'',std:null,etd:null,boardingTime:'1145L',configF:'6',configJ:'52',configY:'258',bookingF:'',bookingJ:'',bookingY:'',infantF:'',infantJ:'',infantY:''};
 for(const [field] of [...counter,...gate,...specials])if(!['um','avih','vip'].includes(field))defaults[field]='';
 for(const [field,label] of gate)defaults[field+'Label']=label;
 for(let i=59;i<=68;i++){defaults['counterA'+i+'Number']='A'+i;defaults['counterA'+i+'Service']=i<=63?'SKY PRIORITY':i<=66?'ECONOMY':i===67?'Arrival Card Assistant':'MU';}
 function booking(f){const sum=prefix=>['F','J','Y'].reduce((n,c)=>n+(Number(f[prefix+c])||0),0),pax=sum('booking'),infants=sum('infant'),capacity=sum('config');return {pax,infants,capacity,plf:Math.round(pax/313*100)+'%'};}
 function timeChecks(date){const [year,month,day]=date.split('-').map(Number),add=days=>new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10),pastYear=year-21,lastDay=new Date(Date.UTC(pastYear,month,0)).getUTCDate();return {transit:add(2),visa240:add(11),age21:[pastYear,String(month).padStart(2,'0'),String(Math.min(day,lastDay)).padStart(2,'0')].join('-')};}
 return {counter,gate,specials,defaults,booking,timeChecks};
});
