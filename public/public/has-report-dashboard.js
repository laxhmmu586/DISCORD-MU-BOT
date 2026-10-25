(() => {
 const $=id=>document.getElementById(id),names=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const hours=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),counts=new Intl.NumberFormat('en-US',{maximumFractionDigits:0}),axis=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}).formatToParts(new Date()),currentMonth=today.find(p=>p.type==='year').value+'-'+today.find(p=>p.type==='month').value;
 const supplied=new URLSearchParams(location.search).get('year');$('dashboard-year').value=/^\d{4}$/.test(supplied||'')&&+supplied>=2026?supplied:currentMonth.slice(0,4);
 let allowed=false,generation=0,data=null;
 const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
 const formatted=(value,integer=false)=>Number.isFinite(value)?(integer?counts:hours).format(value):'—';
 const valid=row=>['surplus','overrun','balanced'].includes(row.state);
 const settled=row=>valid(row)&&row.month<=currentMonth;
 function monthStatus(row){
  if(row.state==='not-started')return 'Not started';if(row.state==='calculation-error')return 'Check formulas';if(!row.hasWWH)return 'WWH missing';if(!row.hasDA)return 'DA missing';
  if(row.month>currentMonth)return 'Future report';
  const status={surplus:'Under',overrun:'Over',balanced:'Balanced'}[row.state]||'Incomplete';return status+(row.month===currentMonth?' · month to date':'');
 }
 function summary(){
  const comparable=data.months.filter(settled),savedWWH=data.months.filter(row=>row.hasWWH&&row.month<=currentMonth),sum=(rows,key)=>rows.reduce((n,row)=>n+(Number.isFinite(row[key])?row[key]:0),0),surplus=comparable.filter(row=>row.state==='surplus').length,overrun=comparable.filter(row=>row.state==='overrun').length;
  const arrivals=data.months.filter(row=>row.month<=currentMonth&&row.flightDelays?.arrival.evaluated>0),departures=data.months.filter(row=>row.month<=currentMonth&&row.flightDelays?.departure.evaluated>0);const metrics=[['Budget hours',sum(comparable,'budgetHours'),'Months with DA and WWH'],['Actual hours',sum(comparable,'actualHours'),'Weighted regular-hour equivalents'],['Recharge hours',sum(savedWWH,'rechargeHours'),'Saved WWH · through current month'],['Hours balance',sum(comparable,'balanceHours'),surplus+' under · '+overrun+' over months'],['Arrival delays',arrivals.reduce((n,row)=>n+row.flightDelays.arrival.total,0),'DA · complete STA / ATA pairs',true],['Departure delays',departures.reduce((n,row)=>n+row.flightDelays.departure.total,0),'DA · complete STD / ATD pairs',true]];
  $('dashboard-summary').replaceChildren(...metrics.map(([label,value,note,integer],i)=>{const source=i<2||i===3?comparable:savedWWH,hasValue=i===4?arrivals.length>0:i===5?departures.length>0:source.some(row=>Number.isFinite(row[['budgetHours','actualHours','rechargeHours','balanceHours'][i]])),card=text('article','','dashboard-stat');card.append(text('h2',label),text('strong',formatted(hasValue?value:null,integer)),text('p',note));if(i===3&&comparable.length)card.classList.add(value>=0?'is-surplus':'is-overrun');return card;}));
  $('dashboard-coverage').textContent=comparable.length+' comparable months through '+names[Number(currentMonth.slice(5))-1]+' '+currentMonth.slice(0,4)+'. Missing DA/WWH and formula errors are excluded from comparisons; future reports are excluded from annual totals. Recharge totals use saved WWH. Flight delay totals use complete DA time pairs. Current-month figures are provisional.';
 }
 const svgNS='http://www.w3.org/2000/svg';
 function svgNode(tag,attributes={},value){const el=document.createElementNS(svgNS,tag);for(const [key,v] of Object.entries(attributes))el.setAttribute(key,v);if(value!==undefined)el.textContent=value;return el;}
 function chart(target,title,series,{bars=false,stacked=false,unit='hrs'}={}){
  const host=$(target),width=620,height=270,left=65,right=18,top=20,bottom=43,plotW=width-left-right,plotH=height-top-bottom,all=series.flatMap(s=>s.values.filter(Number.isFinite)),svg=svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title});
  svg.append(svgNode('title',{},title),svgNode('desc',{},'Monthly '+unit+'. Exact values and missing-data status are available in the monthly details table.'));
  if(!all.length){host.replaceChildren(text('p','No comparable data for this year.','dashboard-empty'));return;}
  const stack=Array(12).fill(0);let min=Math.min(0,...all),max=Math.max(0,...all,...(stacked?names.map((_,i)=>series.reduce((n,s)=>n+(s.values[i]||0),0)):[]));if(max===min)max=min+1;const span=max-min;max+=span*0.12;if(min<0)min-=span*0.12;
  const countStep=unit==='delays'?Math.max(1,Math.ceil(max/4)):null;if(countStep){min=0;max=countStep*Math.ceil(max/countStep);}const x=i=>left+plotW*(i+.5)/12,y=value=>top+(max-value)/(max-min)*plotH;
  for(let i=0;i<=(countStep?max/countStep:4);i++){const value=countStep?i*countStep:min+(max-min)*i/4,at=y(value);svg.append(svgNode('line',{x1:left,y1:at,x2:width-right,y2:at,stroke:'#e0e7ef'}),svgNode('text',{x:left-9,y:at+4,'text-anchor':'end',fill:'#63758b','font-size':11},axis.format(value)));}
  svg.append(svgNode('line',{x1:left,y1:y(0),x2:width-right,y2:y(0),stroke:'#9aabba'}));
  names.forEach((name,i)=>svg.append(svgNode('text',{x:x(i),y:height-17,'text-anchor':'middle',fill:'#53667f','font-size':11},name)));
  series.forEach(s=>{
   if(bars||s.bars){s.values.forEach((value,i)=>{if(!Number.isFinite(value))return;const color=s.signed&&value<0?s.negativeColor||'#dc2626':s.compare&&value>s.compare[i]+0.005?'#dc2626':s.color,bar=svgNode('rect',{x:x(i)-plotW/12*.28,y:Math.min(y(stacked?stack[i]:0),y((stacked?stack[i]:0)+value)),width:plotW/12*.56,height:Math.max(value===0?0:1,Math.abs(y(stacked?stack[i]:0)-y((stacked?stack[i]:0)+value))),fill:color,rx:2});bar.append(svgNode('title',{},names[i]+': '+formatted(value,unit!=='hrs')+' '+unit));svg.append(bar);if(stacked)stack[i]+=value;if(s.labelValues)svg.append(svgNode('text',{x:x(i),y:value>=0?y(value)-7:y(value)+14,'text-anchor':'middle',fill:'#43566f','font-size':10},formatted(value)));});}
   else {let path='';s.values.forEach((value,i)=>{if(!Number.isFinite(value)){path='';return;}const point=x(i)+','+y(value);if(path)svg.append(svgNode('line',{x1:path.split(',')[0],y1:path.split(',')[1],x2:x(i),y2:y(value),stroke:s.color,'stroke-width':2.5,...(s.dashed?{'stroke-dasharray':'6 4'}:{})}));path=point;const dot=svgNode('circle',{cx:x(i),cy:y(value),r:3.5,fill:s.color});dot.append(svgNode('title',{},names[i]+' · '+s.label+': '+formatted(value)+' hrs'));svg.append(dot);});}
  });
  const legend=text('ul','','dashboard-legend');series.flatMap(s=>s.signed?[{label:'Under budget',color:s.color},{label:'Over budget',color:s.negativeColor||'#dc2626'}]:[s]).forEach(s=>{const item=text('li',s.label),dot=text('span','','dashboard-legend-dot');dot.style.backgroundColor=s.color;item.prepend(dot);legend.append(item);});host.replaceChildren(svg,legend);
 }
 function charts(){
  const values=key=>data.months.map(row=>valid(row)?row[key]:null);
  chart('dashboard-budget-chart','Monthly net actual hours against the budget line',[{label:'Net actual (green under / red over)',color:'#15803d',bars:true,labelValues:true,compare:values('budgetHours'),values:values('netActualHours')},{label:'Budget line',color:'#2762c4',dashed:true,values:values('budgetHours')}]);
  chart('dashboard-balance-chart','Monthly hours under or over budget',[{label:'Budget + recharge − actual',color:'#15803d',negativeColor:'#dc2626',signed:true,values:values('balanceHours')}],{bars:true});
  chart('dashboard-recharge-chart','Monthly recharge hours',[{label:'Rebillable hours (weighted)',color:'#3478c9',values:data.months.map(row=>row.rechargeHours)}],{bars:true});
  const kind=$('dashboard-delay-metric').value;
  chart('dashboard-delay-chart','Monthly '+kind+' delay counts by duration',[
   {label:'1–29 min',color:'#2563eb',key:'under30'},
   {label:'30–59 min',color:'#f59e0b',key:'from30to59'},
   {label:'60+ min',color:'#dc2626',key:'atLeast60'}
  ].map(s=>({...s,values:data.months.map(row=>row.flightDelays?.[kind].evaluated>0?row.flightDelays[kind][s.key]:null)})),{bars:true,stacked:true,unit:'delays'});
 }
 function table(){
  $('dashboard-months').replaceChildren(...data.months.map(row=>{
   const tr=document.createElement('tr');tr.dataset.month=row.month;const month=text('th',names[Number(row.month.slice(5))-1]+'-'+row.month.slice(2,4));month.scope='row';tr.append(month);
   const status=text('td',''),badge=text('span',monthStatus(row),'dashboard-badge');if(settled(row))badge.classList.add('is-'+row.state);status.append(badge);tr.append(status);
   for(const [key,integer] of [['budgetHours'],['actualHours'],['rechargeHours'],['balanceHours'],['flights',true],['pax',true],['arrivalDelays',true],['departureDelays',true]]){
    const timing=key==='arrivalDelays'?row.flightDelays?.arrival:key==='departureDelays'?row.flightDelays?.departure:null;const td=text('td',formatted(timing?timing.evaluated?timing.total:null:row[key],integer));if(timing)td.title='1–29 min: '+timing.under30+' · 30–59 min: '+timing.from30to59+' · 60+ min: '+timing.atLeast60;td.dataset.metric=key;if(key==='balanceHours'&&settled(row))td.className=row.balanceHours>=0?'dashboard-positive':'dashboard-negative';
    if(key==='rechargeHours'&&row.rechargeBreakdown)td.title='Raw hours: REG '+formatted(row.rechargeBreakdown.regular)+' · OT '+formatted(row.rechargeBreakdown.overtime)+' · DT '+formatted(row.rechargeBreakdown.doubleTime)+' · Training '+formatted(row.rechargeBreakdown.training);tr.append(td);
   }return tr;
  }));
 }
 function clear(){data=null;$('dashboard-summary').replaceChildren();$('dashboard-months').replaceChildren();for(const id of ['budget','balance','recharge','delay'])$('dashboard-'+id+'-chart').replaceChildren();$('dashboard-coverage').textContent='';$('dashboard-updated').textContent='';}
 async function load(){
  const year=$('dashboard-year').value,request=++generation;if(!allowed)return;if(!/^\d{4}$/.test(year)||+year<2026){$('dashboard-status').textContent='Select a year from 2026 onward.';clear();return;}
  $('dashboard-refresh').disabled=true;clear();$('dashboard-status').textContent='Loading '+year+' dashboard…';
  try{const next=await window.hasReportRequest('/dashboard/'+year);if(request!==generation||!allowed)return;data=next;summary();charts();table();$('dashboard-scope').textContent=data.scope.station+'/'+data.scope.account+' · Main Account';$('dashboard-status').textContent='';$('dashboard-updated').textContent='Updated '+new Date(data.generatedAt).toLocaleTimeString();history.replaceState(null,'','?year='+year);}
  catch(error){if(request!==generation)return;$('dashboard-status').textContent=error.message;if([401,403].includes(error.status)){allowed=false;$('dashboard-controls').hidden=true;clear();}}
  finally{if(request===generation){$('dashboard-refresh').disabled=false;}}
 }
 $('dashboard-year').addEventListener('change',load);$('dashboard-refresh').onclick=load;$('dashboard-delay-metric').onchange=()=>{if(data)charts();};
 window.addEventListener('has-report-context',event=>{const ctx=event.detail;generation++;allowed=Boolean(ctx.canDashboard&&!ctx.error);$('dashboard-controls').hidden=!allowed;clear();if(!allowed){$('dashboard-status').textContent=ctx.error||'Dashboard access requires Supervisor or above in your Main Account.';return;}$('dashboard-scope').textContent=ctx.scope.station+'/'+ctx.scope.account+' · Main Account';void load();});
 if(window.hasReportContext)window.dispatchEvent(new CustomEvent('has-report-context',{detail:window.hasReportContext}));
})();
