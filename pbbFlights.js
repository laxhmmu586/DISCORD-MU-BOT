const {discoverFlights}=require('./flightContext');
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function createFlightService({arrivalService=require('./pbbEtab').createGateService(),getLog=()=>require('./googleDrive').getLatestFlightLog(),now=Date.now}={}){
 return {
  read:(flightNo,date)=>arrivalService.read(flightNo,date),
  async today(date,type){
   if(type==='arrival')return {...await arrivalService.today(date,type),source:'ETAB'};
   if(type!=='departure')throw Error('Select arrival or departure');
   const base={date,source:'SY',checkedAt:new Date(now()).toISOString()};
   try{
    const token=date.slice(8,10)+MONTHS[Number(date.slice(5,7))-1]+date.slice(2,4);
    const flights=discoverFlights(await getLog(),{date:token}).filter(f=>/^(?:\d{1,3}[A-Z]?|[A-Z]\d{1,3})$/.test(f.gate)).map(({flightNo,gate})=>({flightNo,date,gate}));
    return {...base,status:flights.length?'available':'unavailable',flights};
   }catch{return {...base,status:'error',flights:[],message:'Unable to read today’s SY flight and gate.'};}
  }
 };
}
module.exports={createFlightService};
