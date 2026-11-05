(() => {
 const states=new WeakMap();
 window.chargeDashboard=(root,{replay=false}={})=>{
  if(!root)return;
  const previous=states.get(root);
  previous?.dispose();
  previous?.restore();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state={values:previous?.values||new Map(),frame:null},records=[];
  states.set(root,state);
  function add(element,key,value,paint,view=element){
   const changed=replay||state.values.get(key)!==value;
   paint(changed&&!reduced?0:1);
   if(changed&&!reduced)records.push({element,view,key,value,paint,elapsed:0,last:null,visible:false,done:false});
   else state.values.set(key,value);
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
   add(element,'number:'+(element.dataset.chargeKey||index),target+':'+digits,progress=>{
    element.textContent=formatter.format(progress===0?0:target*progress)+(element.dataset.chargeSuffix||'');
   });
  });
  root.querySelectorAll('[data-charge-width]').forEach((element,index)=>{
   const target=Number(element.dataset.chargeWidth);if(!Number.isFinite(target))return;
   add(element,'width:'+(element.dataset.chargeKey||index),String(target),progress=>{
    element.style.width=Math.min(100,Math.max(0,target))*progress+'%';
   },element.parentElement);
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
  state.restore=()=>{for(const record of records)record.paint(1);};
  let observer,appearance;
  function schedule(){if(!state.frame)state.frame=requestAnimationFrame(frame);}
  function visibility(){for(const record of records)record.last=null;schedule();}
  state.dispose=()=>{
   if(state.frame)cancelAnimationFrame(state.frame);
   state.frame=null;observer?.disconnect();appearance?.disconnect();
   document.removeEventListener('visibilitychange',visibility);
  };
  function frame(at){
   state.frame=null;
   let active=false;
   for(const record of records){
    if(record.done)continue;
    if(!record.element.isConnected){record.done=true;continue;}
    if(document.hidden||!record.visible||getComputedStyle(record.element).visibility!=='visible'){record.last=null;continue;}
    if(record.last!==null)record.elapsed+=at-record.last;
    record.last=at;
    const progress=Math.min(1,record.elapsed/1600);
    record.paint(1-(1-progress)**3);
    if(progress===1){record.done=true;state.values.set(record.key,record.value);}
    else active=true;
   }
   if(records.every(record=>record.done))state.dispose();
   else if(active)schedule();
  }
  if(!records.length)return;
  document.addEventListener('visibilitychange',visibility);
  if(typeof IntersectionObserver==='function'){
   const byElement=new Map();
   for(const record of records){const group=byElement.get(record.view)||[];group.push(record);byElement.set(record.view,group);}
   observer=new IntersectionObserver(entries=>{
    for(const entry of entries)for(const record of byElement.get(entry.target)){record.visible=entry.isIntersecting;if(!record.visible)record.last=null;}
    schedule();
   },{threshold:0.05});
   for(const element of byElement.keys())observer.observe(element);
  }else{for(const record of records)record.visible=true;schedule();}
  appearance=new MutationObserver(schedule);
  for(const element of [document.documentElement,document.body])appearance.observe(element,{attributes:true,attributeFilter:['class','style','data-permission-pending']});
 };
})();
