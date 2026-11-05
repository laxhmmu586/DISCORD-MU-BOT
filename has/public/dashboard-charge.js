(() => {
 const states=new WeakMap();
 window.chargeDashboard=(root,{replay=false}={})=>{
  if(!root)return;
  const previous=states.get(root);
  if(previous?.frame){cancelAnimationFrame(previous.frame);previous.finish?.();}
  const state={values:previous?.values||new Map(),frame:null},records=[];
  states.set(root,state);
  function add(element,key,value,paint){
   const changed=replay||state.values.get(key)!==value;
   state.values.set(key,value);
   paint(changed&&!matchMedia('(prefers-reduced-motion: reduce)').matches?0:1);
   if(changed)records.push({element,paint});
  }
  root.querySelectorAll('svg[data-charge-percent]').forEach((svg,index)=>{
   if(svg.dataset.chargePercent==='')return;
   const target=Number(svg.dataset.chargePercent);if(!Number.isFinite(target))return;
   const arc=svg.querySelector('circle[pathLength="100"]'),text=svg.querySelector('text');
   add(svg,'percent:'+(svg.dataset.chargeKey||index),String(target),progress=>{
    const value=Math.min(100,Math.max(0,target))*progress;
    if(arc){arc.setAttribute('stroke-dasharray',value+' 100');arc.style.opacity=value>0?'':'0';}
    if(text)text.textContent=Math.round(value)+'%';
   });
  });
  root.querySelectorAll('[data-charge-number]').forEach((element,index)=>{
   const target=Number(element.dataset.chargeNumber);if(!Number.isFinite(target))return;
   const digits=Number(element.dataset.chargeDigits||0);
   const formatter=new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
   add(element,'number:'+(element.dataset.chargeKey||index),target+':'+digits,progress=>{element.textContent=formatter.format(progress===0?0:target*progress)+(element.dataset.chargeSuffix||'');});
  });
  root.querySelectorAll('svg[data-charge-baseline]').forEach((svg,index)=>{
   const baseline=Number(svg.dataset.chargeBaseline);
   const plots=[...svg.querySelectorAll('[data-charge-plot]')].map(element=>{
    const attributes=element.tagName==='rect'?['y','height']:element.tagName==='line'?['y1','y2']:element.tagName==='circle'?['cy']:['y'];
    return {element,attributes:attributes.map(name=>({name,target:Number(element.getAttribute(name))}))};
   });
   add(svg,'plot:'+(svg.dataset.chargeKey||index),svg.dataset.chargeSeries,progress=>{
    for(const plot of plots)for(const {name,target} of plot.attributes){
     const start=name==='height'?0:baseline;
     plot.element.setAttribute(name,start+(target-start)*progress);
    }
   });
  });
  state.finish=()=>{for(const record of records)record.paint(1);};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!records.length)return;
  let started;
  function frame(at){
   if(started===undefined)started=at;
   const progress=Math.min(1,(at-started)/1100),charge=1-(1-progress)**3;
   for(const record of records)if(record.element.isConnected)record.paint(charge);
   if(progress<1&&root.isConnected)state.frame=requestAnimationFrame(frame);
   else state.frame=null;
  }
  state.frame=requestAnimationFrame(frame);
 };
})();
