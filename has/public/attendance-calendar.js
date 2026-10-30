(()=>{
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const validMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value||'')&&Number(value.slice(0,4))>=1900;
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&validMonth(value.slice(0,7))&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 function create(host,{records=[],month=today().slice(0,7),onSelect=()=>{},onMonthChange=()=>{}}={}){
  let rows=records,view=validMonth(month)?month:today().slice(0,7),selected='';host.classList.add('attendance-calendar');
  function move(offset){const [y,m]=view.split('-').map(Number),d=new Date(Date.UTC(y,m-1+offset,1)),key=d.toISOString().slice(0,7);if(!validMonth(key))return;view=key;selected='';render();onMonthChange(view);}
  function render(){
   const active=host.contains(document.activeElement)?document.activeElement:null,focusDate=active?.dataset?.date,focusName=active&&!focusDate?(active.getAttribute('aria-label')||active.textContent):null;
   const [year,month]=view.split('-').map(Number),first=new Date(Date.UTC(year,month-1,1)),days=new Date(Date.UTC(year,month,0)).getUTCDate(),current=today();
   const title=first.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'}),header=node('div',null,'attendance-calendar-header'),back=node('button','‹'),forward=node('button','›'),label=node('strong',title),now=node('button','Today','calendar-today-button');
   back.type=forward.type=now.type='button';back.setAttribute('aria-label','Previous month');forward.setAttribute('aria-label','Next month');back.disabled=view==='1900-01';forward.disabled=view==='9999-12';back.onclick=()=>move(-1);forward.onclick=()=>move(1);now.onclick=()=>{view=today().slice(0,7);selected='';render();onMonthChange(view);};header.append(back,label,forward,now);
   const weekdays=node('div',null,'attendance-calendar-weekdays');weekdays.setAttribute('aria-hidden','true');for(const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])weekdays.append(node('span',name));
   const grid=node('div',null,'attendance-calendar-days');grid.setAttribute('role','group');grid.setAttribute('aria-label',title+' attendance');
   for(let i=0;i<first.getUTCDay();i++)grid.append(node('span',null,'calendar-empty-day'));
   let sick=0,late=0;
   for(let day=1;day<=days;day++){
    const date=view+'-'+String(day).padStart(2,'0'),items=rows.filter(r=>r.date===date),off=items.filter(r=>r.type==='sick').length,delay=items.filter(r=>r.type==='late').length,b=node('button',null,'attendance-calendar-day');sick+=off;late+=delay;b.type='button';b.dataset.date=date;b.append(node('span',String(day),'calendar-day-number'));
    if(off)b.classList.add('has-sick');if(delay)b.classList.add('has-late');if(date===current){b.classList.add('is-today');b.setAttribute('aria-current','date');}b.setAttribute('aria-pressed',String(selected===date));
    const fullDate=new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',dateStyle:'full'}),description=`${fullDate}: ${off} Call Off / Sick, ${delay} Coming Late`;b.setAttribute('aria-label',description);b.title=description;
    const marks=node('span',null,'calendar-day-marks');marks.setAttribute('aria-hidden','true');for(const [type,count] of [['sick',off],['late',delay]])if(count){const mark=node('span',count>1?String(count):'','calendar-day-mark '+type);marks.append(mark);}b.append(marks);b.onclick=()=>{selected=date;render();onSelect(date);};grid.append(b);
   }
   const footer=node('div',null,'attendance-calendar-totals');footer.append(node('span',`${sick} Call Off / Sick`,'calendar-sick-total'),node('span',`${late} Coming Late`,'calendar-late-total'));
   host.replaceChildren(header,weekdays,grid,footer);
   const focusTarget=[...host.querySelectorAll('button')].find(b=>focusDate?b.dataset.date===focusDate:focusName&&(b.getAttribute('aria-label')||b.textContent)===focusName);focusTarget?.focus({preventScroll:true});
  }
  render();return {setRecords(next){rows=next;render();},setMonth(next){if(validMonth(next)){view=next;if(!selected.startsWith(view))selected='';render();}},setSelectedDate(date){selected=validDate(date)?date:'';if(selected)view=selected.slice(0,7);render();},getMonth:()=>view};
 }
 window.attendanceCalendar={create,today,validDate,validMonth};
})();
