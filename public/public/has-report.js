(() => {
 const $=id=>document.getElementById(id),status=$('report-status'),editor=$('report-editor');let model=null,busy=false,dirty=false,loaded=false,baseline={},saveTimer,paused=false,saveConflict=false,stopLive,liveKey='',pendingRevision;
 const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
 const coord=a=>{const [,c,r]=a.match(/^([A-Z]+)(\d+)$/);return {r:+r,c:[...c].reduce((n,x)=>n*26+x.charCodeAt(0)-64,0)};};
 const setBusy=value=>{busy=value;for(const id of ['report-kind','report-month','report-load','report-export','report-import'])$(id).disabled=value;if(!value)flushRevision();};
 function stopUpdates(){stopLive?.();stopLive=null;liveKey='';pendingRevision=null;}
 function flushRevision(){
  if(!pendingRevision||!model||busy||dirty||document.hidden)return;
  const latest=pendingRevision;pendingRevision=null;
  if(latest.revision!==model.revision||model.kind==='wwh'&&latest.daRevision!==model.daRevision)void load();
 }
 function startUpdates(){
  const key=JSON.stringify([model.scope.station,model.scope.account,model.kind,model.month]);if(key===liveKey)return;
  stopUpdates();liveKey=key;
  stopLive=window.watchHasReport({path:'/'+model.kind+'/'+model.month,onRevision:state=>{
   if(key!==liveKey||!model)return;
   if(state.scope.station!==model.scope.station||state.scope.account!==model.scope.account){window.dispatchEvent(new CustomEvent('has-report-context',{detail:{error:'Your Main Account changed. Reload the page.'}}));return;}
   pendingRevision=state;flushRevision();
  },onError:error=>{if(key===liveKey&&[401,403].includes(error.status))window.dispatchEvent(new CustomEvent('has-report-context',{detail:{error:error.message}}));}});
 }
 const editableValues=()=>Object.fromEntries(Object.entries(model.cells).filter(([,c])=>c.editable).map(([a,c])=>[a,c.value]));
 function scheduleSave(delay=1000){clearTimeout(saveTimer);if(paused)return;saveTimer=setTimeout(async()=>{if(busy){scheduleSave();return;}setBusy(true);try{await save();}catch(e){saveConflict=e.status===409;paused=saveConflict||e.status===400;status.textContent=e.message;if([401,403].includes(e.status))window.dispatchEvent(new CustomEvent('has-report-context',{detail:{error:e.message}}));else if(!paused&&dirty)scheduleSave(5000);}finally{setBusy(false);}},delay);}
 function history(rows){$('report-history').replaceChildren(...(rows||[]).slice(-10).reverse().map(row=>{const li=document.createElement('li');li.textContent=new Date(row.at).toLocaleString()+' · '+row.name+' · '+row.action+' · '+row.cells.length+' cells';return li;}));}
 function display(value,format){if(typeof value!=='number')return String(value??'');if(format.includes('%'))return (value*100).toFixed(1)+'%';if(format.includes('$'))return '$'+value.toFixed(2);if(format.includes('.00'))return value.toFixed(2);return String(Math.round(value*10000)/10000);}
 function recalculate(){const values=window.hasReportMath.calculate(model.cells);editor.querySelectorAll('[data-formula]').forEach(el=>{el.textContent=display(values[el.dataset.formula],model.cells[el.dataset.formula].numFmt);});}
 function render(){
  editor.replaceChildren();const table=document.createElement('table');table.className='report-sheet';const caption=document.createElement('caption');caption.textContent=(model.kind==='da'?'Daily Flight Activity':'Weekly Worked Hours')+' · '+model.month;table.append(caption);
  const cols=document.createElement('colgroup');model.widths.forEach((w,i)=>{const c=document.createElement('col');c.style.width=Math.max(64,w*8)+'px';if(model.hiddenColumns.includes(i+1))c.style.display='none';cols.append(c);});table.append(cols);
  const hidden=new Set(),spans={};for(const merge of model.merges){const [start,end]=merge.split(':'),a=coord(start),b=coord(end);spans[start]={rows:b.r-a.r+1,cols:b.c-a.c+1};for(let r=a.r;r<=b.r;r++)for(let c=a.c;c<=b.c;c++)if(col(c)+r!==start)hidden.add(col(c)+r);}
  // Excel lets the unmerged title overflow across empty cells. Reproduce that
  // readable title in HTML while leaving the exported workbook unchanged.
  if(model.kind==='wwh'){
   for(const r of [2,12,19]){spans['A'+r]={rows:1,cols:model.columns};for(let c=2;c<=model.columns;c++)hidden.add(col(c)+r);}
   for(const r of [...Array.from({length:6},(_,i)=>13+i),...Array.from({length:6},(_,i)=>20+i)]){spans['B'+r]={rows:1,cols:model.columns-1};for(let c=3;c<=model.columns;c++)hidden.add(col(c)+r);}
  }
  const body=document.createElement('tbody');for(let r=1;r<=model.rows;r++){const tr=document.createElement('tr');tr.style.height=Math.max(28,model.heights[r-1]*1.25)+'px';for(let c=1;c<=model.columns;c++){const address=col(c)+r;if(hidden.has(address))continue;const cell=model.cells[address];if(!cell)continue;const td=document.createElement('td');if(spans[address]){td.rowSpan=spans[address].rows;td.colSpan=spans[address].cols;}td.title=cell.formula?'='+cell.formula:address;
   if(model.hiddenColumns.includes(c))td.style.display='none';if(cell.linked)td.title='Automatically summed from the saved DA for this week';if(cell.style.background?.length===8&&cell.style.background!=='00000000')td.style.backgroundColor='#'+cell.style.background.slice(2);if(cell.style.bold)td.style.fontWeight='700';if(cell.style.align)td.style.textAlign=cell.style.align;
   if(cell.editable){const input=document.createElement('textarea');input.rows=1;input.value=cell.value;input.setAttribute('aria-label',address);input.spellcheck=false;input.addEventListener('input',()=>{const text=input.value;cell.value=/^-?\d+(\.\d+)?$/.test(text)?Number(text):text;if(cell.literalFormula){if(text.startsWith('='))cell.formula=text.slice(1);else delete cell.formula;}dirty=true;if(!saveConflict)paused=false;status.textContent=saveConflict?'Your edits are not saved because another editor changed the same cells. Reload the report to review them.':'Saving changes…';try{recalculate();scheduleSave();}catch{clearTimeout(saveTimer);status.textContent='Complete the arithmetic formula before saving.';}});td.append(input);}else if(cell.formula){td.dataset.formula=address;td.classList.add('report-calculated');}else td.textContent=display(cell.value,cell.numFmt);tr.append(td);}body.append(tr);}table.append(body);editor.append(table);recalculate();
 }
 async function load(){if(busy)return;if(dirty&&!confirm('Discard unsaved changes and load this report?'))return;clearTimeout(saveTimer);setBusy(true);status.textContent='Loading report…';try{model=await window.hasReportRequest('/'+$('report-kind').value+'/'+$('report-month').value);render();baseline=editableValues();history(model.history);dirty=false;paused=false;saveConflict=false;loaded=true;pendingRevision=null;startUpdates();status.textContent=model.updatedAt?'Saved by '+model.updatedBy+' · '+new Date(model.updatedAt).toLocaleString():'Shared report · Changes save automatically.';}catch(e){status.textContent=e.message;}finally{setBusy(false);$('report-export').disabled=!loaded;}}
 async function save(){
  clearTimeout(saveTimer);const values=Object.fromEntries(Object.entries(editableValues()).filter(([a,v])=>baseline[a]!==v));
  if(!Object.keys(values).length){dirty=false;status.textContent='All changes saved.';return;}
  const baseValues=Object.fromEntries(Object.keys(values).map(a=>[a,baseline[a]]));
  const result=await window.hasReportRequest('/'+model.kind+'/'+model.month,{revision:model.revision,values,baseValues});model.revision=result.revision;
  // Incorporate remote changes returned by a merged save without replacing
  // any input the local editor has changed while the request was in flight.
  for(const [address,value] of Object.entries(result.values)){
   const cell=model.cells[address];if(!cell?.editable||Object.hasOwn(values,address)||cell.value!==baseline[address])continue;
   cell.value=value;baseline[address]=value;if(cell.literalFormula){if(typeof value==='string'&&value.startsWith('='))cell.formula=value.slice(1);else delete cell.formula;}
   const input=editor.querySelector('textarea[aria-label="'+address+'"]');if(input)input.value=value;
  }
  Object.assign(baseline,values);dirty=Object.entries(editableValues()).some(([a,v])=>baseline[a]!==v);recalculate();history(result.history);paused=false;status.textContent='Saved by '+result.updatedBy+' · '+new Date(result.updatedAt).toLocaleTimeString();if(dirty)scheduleSave();
 }
 $('report-load').onclick=load;
 $('report-export').onclick=async()=>{if(busy||!model)return;setBusy(true);try{if(dirty)await save();const blob=await window.hasReportRequest('/'+model.kind+'/'+model.month+'/export'),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=model.kind.toUpperCase()+'_'+model.scope.station+'_'+model.scope.account+'_'+model.month.slice(0,4)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='';}catch(e){status.textContent=e.message;}finally{setBusy(false);if(dirty&&!paused)scheduleSave(5000);}};
 $('report-import').onclick=()=>$('report-file').click();
 $('report-file').onchange=async()=>{const file=$('report-file').files[0];if(!file||busy||!model)return;if(file.size>10*1024*1024){status.textContent='Choose an Excel file up to 10 MB.';return;}if(!confirm('Import this month from Excel into the shared report? Existing values will be replaced.'))return;clearTimeout(saveTimer);setBusy(true);try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);await window.hasReportRequest('/'+model.kind+'/'+model.month+'/import',{revision:model.revision,file:btoa(binary)});dirty=false;}catch(e){status.textContent=e.message;setBusy(false);return;}setBusy(false);await load();$('report-file').value='';};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)flushRevision();});
 window.addEventListener('pagehide',stopUpdates);
 window.addEventListener('pageshow',event=>{if(event.persisted&&model)startUpdates();});
 window.addEventListener('online',()=>{if(dirty&&!saveConflict){paused=false;scheduleSave(0);}});
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 window.addEventListener('has-report-context',event=>{const ctx=event.detail;if(ctx.error){stopUpdates();status.textContent=ctx.error;editor.replaceChildren();$('report-controls').hidden=true;model=null;loaded=false;dirty=false;clearTimeout(saveTimer);return;}const kinds=Object.entries(ctx.permissions).filter(([,allowed])=>allowed).map(([kind])=>kind);if(!kinds.length){stopUpdates();status.textContent='Report access is unavailable for your Main Account position.';$('report-controls').hidden=true;return;}$('report-controls').hidden=false;$('report-scope').textContent=ctx.scope.station+' · '+ctx.scope.account+' · Main Account';$('report-kind').replaceChildren(...kinds.map(kind=>new Option(kind==='da'?'DA · Daily Flight Activity':'WWH · Weekly Worked Hours',kind)));load();});
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}).formatToParts(new Date()),part=type=>parts.find(p=>p.type===type).value;$('report-month').value=Number(part('year'))>=2026?part('year')+'-'+part('month'):'2026-01';
 if(window.hasReportContext)window.dispatchEvent(new CustomEvent('has-report-context',{detail:window.hasReportContext}));
})();
