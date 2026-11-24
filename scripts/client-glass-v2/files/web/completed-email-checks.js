// Keep authoritative Gmail results visible during background rechecks of the
// same expectations. A new ready result always replaces the previous result.
(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  function createRetainer({getUserId=()=>'',storage,now=Date.now}={}){
    const storageKey='mufc-email-check-results-v1',cache=new Map();
    try{for(const [key,value] of JSON.parse(storage?.getItem(storageKey)||'[]'))if(now()-value.at<86400000)cache.set(key,value);}catch{}
    const remember=(key,value)=>{
      if(!key)return;cache.delete(key);cache.set(key,{at:now(),value:clone(value)});
      while(cache.size>16)cache.delete(cache.keys().next().value);
      try{storage?.setItem(storageKey,JSON.stringify([...cache]));}catch{}
    };
    const read=key=>{const entry=key&&cache.get(key);return entry&&now()-entry.at<86400000?clone(entry.value):null;};
    return function retain(sy){
      const uid=getUserId();if(!uid||!sy?.flightNo||!sy.flightDate)return sy;
      const scope=[uid,sy.flightNo,sy.flightDate],crew=sy.crewApis?.gdCheckQuery?.crew;
      const gdKey=Array.isArray(crew)?JSON.stringify(['gd',...scope,String(sy.aircraftRegistration||'').toUpperCase().replace(/[\s-]/g,''),crew.map(row=>String(row.passport||'').trim().toUpperCase()).sort()]):null;
      const mealKey=JSON.stringify(canonical(['meal',...scope,sy.reservation,sy.reservationTicketed,sy.spml?.preorderByCabin]));
      const gd=sy.crewApis?.steps?.find(step=>step.key==='gdCheck'),state=sy.desktopCloud?.state;
      if(state==='ready'){
        if(gd?.searched)remember(gdKey,gd);
        if(typeof sy.spml?.email?.found==='boolean')remember(mealKey,sy.spml.email);
        return sy;
      }
      if(!['pending','error'].includes(state))return sy;
      const previousGd=read(gdKey),previousMeal=read(mealKey);
      if(!previousGd&&!previousMeal)return sy;
      const result={...sy,emailCheckRefresh:{state,message:sy.desktopCloud?.message||'',gdRetained:Boolean(previousGd),mealRetained:Boolean(previousMeal)}};
      if(previousGd&&gd)result.crewApis={...sy.crewApis,steps:sy.crewApis.steps.map(step=>step.key==='gdCheck'?{...previousGd,refreshing:true}:step)};
      if(previousMeal)result.spml={...sy.spml,email:{...previousMeal,refreshing:true}};
      return result;
    };
  }
  if(typeof module==='object'&&module.exports)module.exports={createRetainer};
  if(root?.document){
    let storage;try{storage=root.sessionStorage;}catch{}
    root.mufcRetainEmailChecks=createRetainer({storage,getUserId:()=>{try{return root.firebase?.auth?.().currentUser?.uid||'';}catch{return '';}}});
  }
})(typeof window==='undefined'?null:window);
