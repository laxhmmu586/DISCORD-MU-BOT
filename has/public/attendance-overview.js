(()=>{
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const validMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value||'')&&Number(value.slice(0,4))>=1900;
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&validMonth(value.slice(0,7))&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 function create(host,{records=[],month=today().slice(0,7),onSelect=()=>{},onYearChange=()=>{}}={}){
  let rows=records,year=Number((validMonth(month)?month:today()).slice(0,4)),selected=validMonth(month)?month:'';
  host.classList.add('attendance-overview');
  function render(){
   const focus=host.contains(document.activeElement)?document.activeElement:null,key=focus?.dataset.month||focus?.getAttribute('aria-label');
   const totals=months.map((_,i)=>{const month=year+'-'+String(i+1).padStart(2,'0'),items=rows.filter(r=>validDate(r.date)&&r.date.startsWith(month));return {month,sick:items.filter(r=>r.type==='sick').length,late:items.filter(r=>r.type==='late').length};});
   const step=Math.max(1,Math.ceil(Math.max(...totals.map(r=>r.sick+r.late))/4)),max=step*4;
   const header=node('div',null,'overview-heading'),title=node('strong','Monthly Overview'),controls=node('div',null,'overview-year-controls');
   const back=node('button','‹'),label=node('span',String(year)),next=node('button','›');back.type=next.type='button';back.setAttribute('aria-label','Previous year');next.setAttribute('aria-label','Next year');back.disabled=year===1900;next.disabled=year===9999;
   const move=offset=>{year+=offset;selected='';render();onYearChange(year);};back.onclick=()=>move(-1);next.onclick=()=>move(1);controls.append(back,label,next);header.append(title,controls);
   const legend=node('div',null,'overview-legend');for(const [cls,text] of [['sick','Call Off / Sick'],['late','Coming Late']]){const item=node('span',text);item.prepend(node('i',null,cls));legend.append(item);}
   const plot=node('div',null,'overview-plot'),axis=node('div',null,'overview-axis'),grid=node('div',null,'overview-grid'),columns=node('div',null,'overview-columns');
   for(let i=4;i>=0;i--){axis.append(node('span',String(step*i)));grid.append(node('i'));}plot.append(axis,grid,columns);
   for(const [i,r] of totals.entries()){
    const button=node('button',null,'overview-month'),track=node('span',null,'overview-track'),stack=node('span',null,'overview-stack');button.type='button';button.dataset.month=r.month;button.setAttribute('aria-pressed',String(selected===r.month));
    const description=`${months[i]} ${year}: ${r.sick} Call Off / Sick, ${r.late} Coming Late`;button.setAttribute('aria-label',description);button.title=description;
    stack.style.height=((r.sick+r.late)/max*100)+'%';
    for(const [type,count] of [['sick',r.sick],['late',r.late]]){const bar=node('span',null,'overview-bar '+type);bar.dataset.count=String(count);bar.style.flex=String(count);if(!count)bar.hidden=true;stack.append(bar);}
    if(r.sick+r.late){const count=node('span',String(r.sick+r.late),'overview-bar-total');stack.append(count);}track.append(stack);button.append(track,node('span',months[i],'overview-month-label'));
    button.onclick=()=>{selected=r.month;render();onSelect(r.month);};columns.append(button);
   }
   const empty=node('p','No attendance records in '+year+'.','overview-empty');empty.hidden=totals.some(r=>r.sick+r.late);
   host.replaceChildren(header,legend,plot,empty);
   if(key)[...host.querySelectorAll('button')].find(b=>b.dataset.month===key||b.getAttribute('aria-label')===key)?.focus({preventScroll:true});
  }
  render();return {setRecords(next){rows=next;render();},setMonth(next){selected=validMonth(next)?next:'';if(selected)year=Number(selected.slice(0,4));render();},getYear:()=>year};
 }
 window.attendanceOverview={create,today,validDate,validMonth};
})();
