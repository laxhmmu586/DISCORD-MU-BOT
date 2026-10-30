(()=>{
 const $=id=>document.getElementById(id),status=$('attendance-status');let records=[],selectedDay='',overview;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 function renderOverview(){
  if(!overview)overview=attendanceOverview.create($('attendance-month-chart'),{records,month:$('attendance-month').value||attendanceOverview.today().slice(0,7),onSelect:month=>{selectedDay='';$('attendance-month').value=month;render();},onYearChange:year=>{selectedDay='';$('attendance-month').value=year+'-01';render();}});
  overview.setRecords(records);overview.setMonth($('attendance-month').value);
  const year=overview.getYear(),rows=records.filter(r=>String(r.date).startsWith(year+'-'));$('attendance-year-total').textContent=`${year} · ${rows.filter(r=>r.type==='sick').length} Call Off / Sick · ${rows.filter(r=>r.type==='late').length} Coming Late`;
 }
 function render(){
  const shown=records.filter(r=>(!selectedDay||r.date===selectedDay)&&($('attendance-filter').value==='all'||r.type===$('attendance-filter').value)&&(!$('attendance-month').value||String(r.date).startsWith($('attendance-month').value)));
  $('attendance-summary').replaceChildren(...[`${shown.length} records`,`${shown.filter(r=>r.type==='sick').length} Call Off / Sick`,`${shown.filter(r=>r.type==='late').length} Coming Late`].map(v=>node('strong',v)));
  if(selectedDay){const clear=node('button',selectedDay+' ×','attendance-clear-day');clear.type='button';clear.setAttribute('aria-label','Clear selected day');clear.onclick=()=>{selectedDay='';render();};$('attendance-summary').prepend(clear);}
  renderOverview();
  $('attendance-records').replaceChildren();
  if(!shown.length){$('attendance-records').append(node('p','No attendance records for this selection.','rs-empty'));return;}
  for(const r of shown){
   const article=node('article','','attendance-history-record'),detail=node('details'),summary=node('summary','','attendance-record-summary');
   const reason=node('span',r.reason||'—','attendance-row-reason');reason.title=r.reason||'';
   summary.append(node('time',r.date,'attendance-row-date'),node('strong',r.type==='late'?'Coming Late':'Call Off / Sick','attendance-row-type'),reason,node('span',r.arrivalTime?'Arrival '+r.arrivalTime:'—','attendance-row-arrival'),node('span','⌄','attendance-row-chevron'));
   const dl=node('dl');let submitted=r.submittedAt;if(submitted&&Number.isFinite(Date.parse(submitted)))submitted=new Date(submitted).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'})+' PT';
   for(const [label,value] of [['Reason',r.reason],['Expected arrival',r.arrivalTime],['Note',r.note],['Submitted',submitted]]){if(!value)continue;dl.append(node('dt',label),node('dd',value));}
   detail.append(summary,dl);article.append(detail);$('attendance-records').append(article);
  }
 }
 async function load(){status.textContent='Loading your records…';try{records=(await peopleApi('/attendance-api/history')).records;render();status.textContent='';}catch(e){status.textContent=e.message;}}
 $('attendance-filter').onchange=render;$('attendance-month').onchange=()=>{selectedDay='';render();};$('attendance-clear').onclick=()=>{$('attendance-month').value='';selectedDay='';render();};$('attendance-refresh').onclick=load;
 const initial=new URLSearchParams(location.search),date=initial.get('date'),month=initial.get('month');
 if(attendanceOverview.validDate(date)){selectedDay=date;$('attendance-month').value=date.slice(0,7);}else $('attendance-month').value=attendanceOverview.validMonth(month)?month:attendanceOverview.today().slice(0,7);
 firebase.auth().onAuthStateChanged(user=>user?load():peopleSignIn());
})();
