(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.staffScheduleSummary=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
 const rows=[
  {label:'Management',codes:['D'],hours:8,color:'#ffff00'},
  {label:'Check-in',codes:['C','EC'],hours:4,color:'#99ff00'},
  {label:'Check-in + Lost and Found',codes:['CL'],hours:8,color:'#77933c'},
  {label:'Arrival',codes:['A'],hours:4,color:'#c96a68'},
  {label:'Gate Specialist',codes:['GS'],hours:4,color:'#9371c7'},
  {label:'Bag room + Lost and Found',codes:['BL'],hours:8,color:'#66b3c2'},
  {label:'Bag room',codes:['B'],hours:4,color:'#66b3c2'},
  {label:'Flight Control + Lost and Found',codes:['FL'],hours:8,color:'#3333ff'},
  {label:'Flight Control',codes:['F'],hours:6,color:'#7777ee'},
  {label:'Arrival Card Assistant',codes:['Q'],hours:0,color:'#4b183c'}
 ];
 // Coverage thresholds mirror the roster's conditional formatting.
 function coverageColor(code,count){
  const red='#ff0000',green='#93c47d',teal='#46bdc6',yellow='#ffd966';
  switch(code){
   case 'C':return count<=4?red:count===5?'#45818e':null;
   case 'A':return count<=1?red:count===2?green:count>=4?'#9900ff':null;
   case 'GS':return count===0?'#ffffff':count===1?green:count===2?red:null;
   case 'BL':return count===1?teal:count>=2?yellow:null;
   case 'B':return count<1?red:count===1?teal:count>=2?yellow:null;
   case 'FL':return count<1?'#ffffff':count===1?teal:red;
   case 'F':case 'Q':return count===1?teal:null;
   default:return null;
  }
 }
 const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
 const round=value=>Number(value.toFixed(2));
 function weekly(days,dailyBudget=61){const complete=days.length===7&&days.every(day=>valid(day.planned)),budget=round(days.reduce((sum,day)=>sum+(valid(day.budget)?day.budget:dailyBudget),0)),total=complete?round(days.reduce((sum,day)=>sum+day.planned,0)+40):null;return {complete,total,budget,variance:complete?round(total-budget):null};}
 function counts(days,employees){const ids=new Set(employees.map(e=>e.id));return rows.map(row=>({...row,counts:days.map(day=>Object.entries(day.assignments||{}).filter(([id,assignment])=>ids.has(id)&&row.codes.includes(assignment.code)).length)}));}
 const baseHours=0;
 const addDays=(value,n)=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const periodStart=value=>addDays(value,-((new Date(value+'T12:00:00Z').getUTCDay()+2)%7));
 function dailyTotal(day,employees){return counts([day],employees).reduce((sum,row)=>sum+row.counts[0]*row.hours,baseHours);}
 const formula=rows.filter(row=>row.hours).map(row=>(row.codes.length>1?'('+row.codes.join(' + ')+')':row.codes[0])+' × '+row.hours).join(' + ');
 function periods(days){const groups=[];for(const day of days){const start=periodStart(day.date);let group=groups.at(-1);if(group?.start!==start){group={start,end:addDays(start,6),visible:[]};groups.push(group);}group.visible.push(day);}return groups;}
 return {coverageColor,rows,weekly,counts,dailyTotal,baseHours,periodHours:40,formula,periodStart,periods,addDays};
});
