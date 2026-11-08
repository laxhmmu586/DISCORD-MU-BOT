(() => {
 const $=id=>document.getElementById(id),esc=escapeHtml;let timer,chartObserver,requestVersion=0,dashboardRecords=[];
 const qa=document.body.classList.contains('qa-workspace');
 const monthNav=document.createElement('nav');monthNav.className='has-month-navigation';monthNav.setAttribute('aria-label','Checklist month');monthNav.innerHTML='<button type="button" data-month-step="-1" aria-label="Previous month">‹</button><label>Month<input type="month" id="dashboard-month" aria-label="Checklist month"></label><button type="button" data-month-step="1" aria-label="Next month">›</button><span id="dashboard-month-label" aria-live="polite"></span>';$('dashboard-form').before(monthNav);
 function setMonth(value){if(!/^\d{4}-\d{2}$/.test(value))return;const [year,month]=value.split('-').map(Number);if(year<1900||year>9998||month<1||month>12)return;$('dashboard-start').value=value+'-01';$('dashboard-end').value=value+'-'+new Date(Date.UTC(year,month,0)).getUTCDate();load();}
 monthNav.querySelectorAll('[data-month-step]').forEach(button=>button.onclick=()=>{const value=$('dashboard-start').value||new Date().toISOString().slice(0,10);const date=new Date(value+'T12:00:00Z');date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+Number(button.dataset.monthStep));setMonth(date.toISOString().slice(0,7));});$('dashboard-month').onchange=event=>setMonth(event.target.value);

 if(qa){
  document.title='QA · PBB';
  $('dashboard-station').closest('label').hidden=true;
  $('dashboard-account').closest('label').hidden=true;
 }
 if(document.querySelector('.menu-toggle')){
  const toggle=document.querySelector('.menu-toggle'),scrim=document.querySelector('.sidebar-scrim');
  const show=open=>{document.body.classList.toggle('sidebar-open',open);toggle.setAttribute('aria-expanded',String(open));scrim.hidden=!open;};
  toggle.onclick=()=>show(scrim.hidden);
  scrim.onclick=()=>{show(false);toggle.focus();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!scrim.hidden)scrim.onclick();});
 }
 if(qa)$('qa-account-settings').onclick=async()=>{
  const trigger=$('qa-account-settings');trigger.disabled=true;
  try{
   const policy=await apiJson('/has-pbb-api/dashboard/qa-accounts'),key=scope=>scope.station+'/'+scope.account,hidden=new Set(policy.hidden.map(key));
   const dialog=document.createElement('dialog');dialog.className='qa-account-dialog';dialog.setAttribute('aria-labelledby','qa-account-title');
   dialog.innerHTML=`<form><header><div><h2 id="qa-account-title">Accounts shown in QA</h2><p>Choose which accounts appear in QA coverage and totals.</p></div><button type="button" data-qa-close aria-label="Close account settings">×</button></header><div class="qa-account-controls"><label>Station<select data-qa-settings-station><option value="">All stations</option>${[...new Set(policy.accounts.map(scope=>scope.station))].map(station=>`<option>${esc(station)}</option>`).join('')}</select></label><label>Find account<input type="search" data-qa-settings-search placeholder="Search accounts"></label></div><div class="qa-account-choices"></div><p data-qa-settings-status role="status" aria-live="polite"></p><footer><button type="button" data-qa-cancel>Cancel</button><button type="submit" class="primary">Save settings</button></footer></form>`;
   document.body.append(dialog);let saving=false,dirty=false;
   const close=()=>{if(!saving&&(!dirty||confirm('Discard unsaved account display changes?')))dialog.close();};
   dialog.querySelector('[data-qa-close]').onclick=close;dialog.querySelector('[data-qa-cancel]').onclick=close;
   dialog.oncancel=event=>{if(saving||dirty&&!confirm('Discard unsaved account display changes?'))event.preventDefault();};
   dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
   const render=()=>{const station=dialog.querySelector('select').value,search=dialog.querySelector('input[type=search]').value.trim().toLowerCase();dialog.querySelector('.qa-account-choices').innerHTML=policy.accounts.filter(scope=>(!station||scope.station===station)&&key(scope).toLowerCase().includes(search)).map(scope=>`<label><input type="checkbox" data-qa-account="${esc(key(scope))}" ${hidden.has(key(scope))?'':'checked'}><strong>${esc(scope.account)}</strong><small>${esc(scope.station)}</small></label>`).join('')||'<p>No matching accounts.</p>';};
   dialog.querySelector('select').onchange=render;dialog.querySelector('input[type=search]').oninput=render;
   dialog.querySelector('.qa-account-choices').onchange=event=>{const checkbox=event.target.closest('[data-qa-account]');if(!checkbox)return;if(checkbox.checked)hidden.delete(checkbox.dataset.qaAccount);else hidden.add(checkbox.dataset.qaAccount);dirty=true;};
   dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;dialog.querySelectorAll('button,input,select').forEach(element=>element.disabled=true);try{
    await apiJson('/has-pbb-api/dashboard/qa-accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:policy.revision,hidden:policy.accounts.filter(scope=>hidden.has(key(scope)))})});
    dirty=false;dialog.close();await refreshScheduleTotals();
   }catch(error){dialog.querySelector('[data-qa-settings-status]').textContent=error.message;}finally{saving=false;dialog.querySelectorAll('button,input,select').forEach(element=>element.disabled=false);}};
   render();dialog.showModal();
  }catch(error){$('has-status').textContent=error.message;}finally{trigger.disabled=false;}
 };
 function qaOverview(d){
  const station=d.station!=='ALL',account=d.account!=='ALL';
  const title=account?d.station+' / '+d.account:station?d.station+' accounts':'Company PBB coverage by station';
  const groups=new Map();
  for(const row of d.byScope){
   const key=station?row.account:row.station;
   const group=groups.get(key)||{expectedFlights:0,coveredFlights:0};
   for(const metric of Object.keys(group))group[metric]+=row[metric];
   groups.set(key,group);
  }
  const cards=[...groups].sort(([a],[b])=>Number(b==='LAX')-Number(a==='LAX')||a.localeCompare(b)).map(([key,row])=>{
   const rate=row.expectedFlights?Math.min(100,Math.round(row.coveredFlights/row.expectedFlights*100)):null;
   return '<button type="button" class="has-qa-scope" data-qa-scope="'+esc(key)+'" data-covered="'+Boolean(row.coveredFlights)+'"><strong>'+esc(key)+'</strong><svg class="has-progress-ring" data-charge-percent="'+(rate===null?'':rate)+'" data-charge-key="'+esc(title+'/'+key)+'" viewBox="0 0 160 160" role="img" aria-label="'+(rate===null?'No scheduled flights':rate+'% covered')+'"><circle cx="80" cy="80" r="58" fill="none" stroke="#dbe8f5" stroke-width="13"/>'+(rate?'<circle cx="80" cy="80" r="58" fill="none" stroke="#258be8" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="'+rate+' 100" transform="rotate(-90 80 80)"/>':'')+'<text x="80" y="89" text-anchor="middle" font-size="30" font-weight="700" fill="#205f9e">'+(rate===null?'—':rate+'%')+'</text></svg></button>';
  }).join('');
  const stationOptions=[...$('dashboard-station').options].map(({value})=>
   `<option value="${esc(value)}" ${d.station===value?'selected':''}>${value==='ALL'?'All stations':esc(value)}</option>`).join('');
  const stationPicker=station?`<label class="coverage-station-picker">Station <select data-qa-station>${stationOptions}</select></label>`:'';
  const filters=account?'':'<div class="coverage-filters" aria-label="Coverage filter"><button type="button" data-coverage-filter="all">All</button><button type="button" data-coverage-filter="covered">With coverage</button><button type="button" data-coverage-filter="uncovered">No coverage</button></div>';
  return `<section class="has-panel has-qa-overview"><h2>${esc(title)}</h2><div class="coverage-toolbar">${filters}${stationPicker}</div>${account?`<button type="button" data-qa-back>← All accounts in ${esc(d.station)}</button>`:`<div class="has-chart-grid has-qa-grid">${cards||'<p>No PBB scopes available.</p>'}</div>`}</section>`;
 }
 function submittedTime(value){const date=new Date(value);if(Number.isNaN(date.getTime()))return esc(value);const iso=date.toISOString();return '<time class="has-submitted-time" datetime="'+esc(value)+'" title="'+esc(value)+'"><span>'+iso.slice(0,10)+'</span><span>'+iso.slice(11,19)+' UTC</span></time>';}
 const headings='<th>Expected flights</th><th>Submitted flights</th><th>Submitted checklists</th><th>In progress</th>';
 const cells=r=>`<td>${r.expectedFlights}</td><td>${r.submittedFlights}</td><td>${r.submittedChecklists}</td><td>${r.pending}</td>`;
 function charts(d,plotWidth=550){
  const sum=key=>d.daily.reduce((n,r)=>n+r[key],0),expected=sum('expectedFlights'),submitted=sum('submittedFlights'),covered=sum('coveredFlights'),percent=expected?Math.min(100,Math.round(covered/expected*100)):0;
  const w=Math.max(220,plotWidth,d.daily.length*62+60),h=230,left=38,bottom=194,top=22,max=Math.max(1,...d.daily.map(r=>Math.max(r.expectedFlights,r.submittedFlights))),step=(w-left-20)/d.daily.length;
  const bars=d.daily.map((r,i)=>{const x=left+i*step+step/2,bw=Math.min(16,step*.26),expectedHeight=(bottom-top)*r.expectedFlights/max,submittedHeight=(bottom-top)*r.submittedFlights/max;return `<g><title>${r.date}: ${r.expectedFlights} expected flights, ${r.submittedFlights} submitted flights</title><rect x="${x-bw-2}" y="${bottom-expectedHeight}" width="${bw}" height="${expectedHeight}" rx="3" fill="#dbe7f4"/><rect x="${x+2}" y="${bottom-submittedHeight}" width="${bw}" height="${submittedHeight}" rx="3" fill="#2087e4"/><text x="${x+bw/2+2}" y="${Math.max(12,bottom-submittedHeight-7)}" text-anchor="middle" font-size="10" fill="#2265a1">${r.submittedFlights}</text><text x="${x}" y="216" text-anchor="middle" font-size="10" fill="#405b75">${r.date.slice(5)}</text></g>`;}).join('');
  const ticks=[...new Set([0,Math.ceil(max/2),max])].map(n=>{const y=bottom-(bottom-top)*n/max;return `<line x1="${left}" y1="${y}" x2="${w-10}" y2="${y}" stroke="#edf2f7"/><text x="${left-9}" y="${y+3}" text-anchor="end" fill="#405b75" font-size="10">${n}</text>`;}).join('');
  return `<div class="has-chart-grid"><section class="has-chart-card"><h2>Submission trend</h2><div class="has-chart-legend"><span><i></i>Expected flights</span><span><i class="submitted"></i>Submitted flights</span></div><div class="has-chart-scroll"><svg class="has-bars" style="min-width:${w}px" viewBox="0 0 ${w} ${h}" role="img" aria-label="Submission trend: ${expected} expected flights and ${submitted} submitted flights">${ticks}${bars}</svg></div></section><section class="has-chart-card"><h2>PBB coverage</h2><svg class="has-progress-ring" data-charge-percent="${expected?percent:''}" data-charge-key="coverage-${esc(d.station)}-${esc(d.account)}" viewBox="0 0 160 160" role="img" aria-label="${covered} of ${expected} expected flights submitted"><circle cx="80" cy="80" r="58" fill="none" stroke="#dbe8f5" stroke-width="13"/><circle cx="80" cy="80" r="58" fill="none" stroke="#258be8" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="${percent} 100" transform="rotate(-90 80 80)"/><text x="80" y="83" text-anchor="middle" font-size="30" font-weight="700" fill="#205f9e">${!expected?'—':percent+'%'}</text><text x="80" y="105" text-anchor="middle" font-size="10" fill="#7c91a5">flights covered</text></svg><p>${covered} / ${expected} expected flights covered</p><div class="has-chart-summary"><span><strong>${expected}</strong> flights expected</span><span><strong>${covered}</strong> flights covered</span></div></section></div>`;
 }
 function fitChart(d){
  chartObserver?.disconnect();const plot=$('dashboard-results').querySelector('.has-chart-scroll');let previousWidth=0;
  const resize=()=>{const width=Math.floor(plot.clientWidth);if(width===previousWidth)return;previousWidth=width;const holder=document.createElement('div');holder.innerHTML=charts(d,width);plot.replaceChildren(holder.querySelector('.has-bars'));};
  resize();if(window.ResizeObserver){chartObserver=new ResizeObserver(resize);chartObserver.observe(plot);}
 }
 async function load(initial=false){const version=++requestVersion;try{
  const query=new URLSearchParams();if(qa)query.set('qa','1');if(!initial){query.set('station',$('dashboard-station').value);query.set('account',$('dashboard-account').value);query.set('start',$('dashboard-start').value);query.set('end',$('dashboard-end').value);}
  const d=await apiJson('/has-pbb-api/dashboard?'+query);if(version!==requestVersion)return;$('dashboard-panel').hidden=false;dashboardRecords=d.records;
  if(qa)$('qa-account-settings').hidden=!d.canManageAccounts;
  if(initial||qa){let reset=false;for(const key of ['station','account']){const select=$('dashboard-'+key),previous=initial?'ALL':select.value;select.innerHTML=(qa?`<option value="ALL">All ${key==='station'?'stations':'accounts'}</option>`:'')+[...new Set(d.scopes.map(s=>s[key]))].sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');if([...select.options].some(option=>option.value===previous))select.value=previous;else if(qa){select.value='ALL';reset=true;}}if(initial){$('dashboard-start').value=d.start;$('dashboard-end').value=d.end;}else if(reset){await load();return;}}
  $('dashboard-month').value=d.start.slice(0,7);$('dashboard-month-label').textContent=d.start+' – '+d.end;
  const total=key=>d.daily.reduce((sum,r)=>sum+r[key],0),title=d.station==='ALL'&&d.account==='ALL'?'Overall statistics':`${d.station==='ALL'?'All stations':d.station} / ${d.account==='ALL'?'All accounts':d.account}`;
  $('dashboard-results').innerHTML=`<section class="has-panel"><h2>${esc(title)}</h2><div class="has-totals"><div><strong>${total('expectedFlights')}</strong>Expected flights</div><div><strong>${total('submittedFlights')}</strong>Flights submitted</div><div><strong>${total('submittedChecklists')}</strong>Bridge checklists submitted</div></div><small>Expected flights include Arrival + Departure on their configured operating days. Each submitted Arrival or Departure flight counts once after at least one bridge checklist has both signatures. Additional bridge checklists count separately. Coverage includes scheduled flights only.</small>${charts(d)}<h3>Daily submissions</h3><div class="has-table-wrap"><table><thead><tr><th>Date</th>${headings}</tr></thead><tbody>${d.daily.map(r=>`<tr><td>${r.date}</td>${cells(r)}</tr>`).join('')}</tbody></table></div></section><section class="has-panel"><h2>By station and account</h2><div class="has-table-wrap"><table><thead><tr><th>Station</th><th>Account</th><th>Arrivals / week</th><th>Departures / week</th>${headings}</tr></thead><tbody>${d.byScope.map(r=>`<tr><td>${esc(r.station)}</td><td>${esc(r.account)}</td><td>${r.weeklyArrivals}</td><td>${r.weeklyDepartures}</td>${cells(r)}</tr>`).join('')}</tbody></table></div></section><section class="has-panel"><h2>Checklist details</h2><div class="has-table-wrap"><table><thead><tr><th>Station / Account</th><th>Date</th><th>Flight / Gate</th><th>Operation</th><th>Bridge</th><th>Driver</th><th>Spotter</th><th>Submitted</th><th>PDF</th></tr></thead><tbody>${d.records.map(r=>`<tr><td>${esc(r.station)} / ${esc(r.account)}</td><td>${r.date}</td><td>${esc(r.flightNo)} / ${esc(r.gate)}</td><td>${r.type==='departure'?'Departure':'Arrival'}</td><td>${r.bridge}</td><td>${esc(r.operators.driver||'—')}</td><td>${esc(r.operators.spotter||'—')}</td><td>${r.completedAt?submittedTime(r.completedAt):'In progress'}</td><td>${r.completedAt?`<button type="button" data-download-pdf="${esc(r.id)}">Download PDF</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></section>`;
  const results=$('dashboard-results');
  const [overview,scopeTable,recordTable]=results.children;
  recordTable.classList.add('has-checklist-details');if(!d.records.length)recordTable.querySelector('.has-table-wrap').insertAdjacentHTML('beforebegin','<p class="has-empty-checklists">No checklists for this date range.</p>');const labels=['Station / Account','Date','Flight / Gate','Operation','Bridge','Driver','Spotter','Submitted','PDF'];for(const row of recordTable.querySelectorAll('tbody tr'))[...row.cells].forEach((cell,index)=>cell.dataset.label=labels[index]);
  const chart=overview.querySelector('.has-chart-grid');
  const [trend,gauge]=chart.children;
  const totals=overview.querySelector('.has-totals');
  const expected=total('expectedFlights'),covered=total('coveredFlights');
  totals.insertAdjacentHTML('beforeend',`<div class="coverage-kpi"><strong ${expected?`data-charge-number="${Math.round(100*covered/expected)}" data-charge-suffix="%" data-charge-key="coverage-kpi-${esc(d.station)}-${esc(d.account)}"`:""}>${expected?Math.round(100*covered/expected)+'%':'—'}</strong>PBB coverage <small>${covered} / ${expected} scheduled</small></div>`);
  const [heading,,method,,,auditTable]=overview.children;
  const audit=document.createElement('section');
  audit.className='has-panel coverage-audit';
  audit.innerHTML='<h2>Daily submissions <small>Audit view</small></h2>';
  audit.append(auditTable);
  for(const row of audit.querySelectorAll('tr')){
   const day=d.daily[row.rowIndex-1];
   row.insertAdjacentHTML('beforeend',day?`<td>${day.expectedFlights?Math.round(100*day.coveredFlights/day.expectedFlights)+'%':'—'}</td>`:'<th scope="col">Coverage</th>');
  }
  const coverage=document.createElement('div'),detail=document.createElement('div');
  coverage.className='coverage-overview-grid';detail.className='coverage-detail-grid';
  coverage.append(gauge);
  if(qa)coverage.insertAdjacentHTML('beforeend',qaOverview(d));
  else coverage.append(scopeTable);
  detail.append(trend,audit);
  const notes=document.createElement('details');
  notes.className='coverage-method';
  notes.innerHTML='<summary>How coverage is calculated</summary>';
  notes.append(method);
  results.replaceChildren(heading,totals,coverage,detail,notes);
  if(!qa||d.account!=='ALL')results.append(recordTable);
  applyCoverageFilter();
  if(qa&&d.account!=='ALL'){
   const missing=d.missing||[];
   $('dashboard-results').lastElementChild.insertAdjacentHTML('beforebegin',
    '<section class="has-panel"><h2>Uncovered scheduled flights ('+missing.length+')</h2>'+
    (missing.length?'<div class="has-table-wrap"><table><thead><tr><th>Date</th><th>Flight</th><th>Operation</th></tr></thead><tbody>'+missing.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.flightNo)+'</td><td>'+(r.type==='arrival'?'Arrival':'Departure')+'</td></tr>').join('')+'</tbody></table></div>':'<p>No uncovered scheduled flights for this date range.</p>')+'</section>');
  }
  results.querySelectorAll('.has-totals strong,.has-chart-summary strong').forEach((number,index)=>{
   if(number.dataset.chargeNumber!==undefined)return;
   const value=Number(number.textContent.replaceAll(',','').trim());
   if(!Number.isFinite(value))return;
   number.dataset.chargeNumber=value;number.dataset.chargeKey='qa-count-'+index;
  });
  fitChart(d);
  window.chargeDashboard?.(results);
  $('has-status').textContent='Updated '+new Date().toLocaleTimeString()+' · Refreshes every 30 seconds';
 }catch(e){if(version!==requestVersion)return;if(e.status===403){$('dashboard-results').replaceChildren();$('dashboard-panel').hidden=true;dashboardRecords=[];chartObserver?.disconnect();}$('has-status').textContent=e.message;}}
 let coverageFilter='all';
 function applyCoverageFilter(){
  for(const button of document.querySelectorAll('[data-coverage-filter]'))button.setAttribute('aria-pressed',String(button.dataset.coverageFilter===coverageFilter));
  for(const card of document.querySelectorAll('[data-qa-scope]'))card.hidden=coverageFilter!=='all'&&(card.dataset.covered==='true')!==(coverageFilter==='covered');
 }
 $('dashboard-results').addEventListener('change',async event=>{
  if(!event.target.matches('[data-qa-station]'))return;
  $('dashboard-station').value=event.target.value;
  $('dashboard-account').value='ALL';
  coverageFilter='all';
  await load();
  $('dashboard-results').querySelector('[data-qa-station], [data-qa-scope]')?.focus();
 });
 $('dashboard-results').addEventListener('click',async event=>{
  const filter=event.target.closest('[data-coverage-filter]');
  if(filter){coverageFilter=filter.dataset.coverageFilter;applyCoverageFilter();return;}
  const scope=event.target.closest('[data-qa-scope]'),back=event.target.closest('[data-qa-back]');
  if(qa&&(scope||back)){
   const station=$('dashboard-station'),account=$('dashboard-account');
   if(back){if(account.value!=='ALL')account.value='ALL';else station.value='ALL';}
   else if(station.value==='ALL')station.value=scope.dataset.qaScope;else account.value=scope.dataset.qaScope;
   coverageFilter='all';await load();$('dashboard-results').querySelector('[data-qa-station], [data-qa-back], [data-qa-scope]')?.focus();return;
  }
  const button=event.target.closest('[data-download-pdf]');if(!button)return;const record=dashboardRecords.find(r=>r.id===button.dataset.downloadPdf);if(!record)return;button.disabled=true;
  try{const response=await fetch(resolveApiBase()+'/has-pbb-api/dashboard/records/'+encodeURIComponent(button.dataset.downloadPdf)+'/pdf'+(qa?'?qa=1':''),{headers:await authHeaders(),cache:'no-store'});
   if(!response.ok){const data=await response.json();throw Error(data.error||'Unable to download PDF.');}
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;
   link.download=requestDownloadName(record.type,{...record,submitterName:record.operators.driver});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){$('has-status').textContent=e.message;}finally{button.disabled=false;}
 });
 async function refreshScheduleTotals(){const filters=Object.fromEntries(['station','account','start','end'].map(key=>[key,$('dashboard-'+key).value]));await load(true);for(const [key,value] of Object.entries(filters))if(key==='start'||key==='end'||[...$('dashboard-'+key).options].some(option=>option.value===value))$('dashboard-'+key).value=value;await load();}
 window.addEventListener('storage',event=>{if(event.key==='has-pbb-schedule-revision'&&!$('dashboard-panel').hidden)refreshScheduleTotals();});
 window.addEventListener('focus',()=>{if(!$('dashboard-panel').hidden)load();});
 $('dashboard-form').onsubmit=e=>{e.preventDefault();load();};$('dashboard-station').onchange=$('dashboard-account').onchange=()=>load();
 requireServiceLogin(async()=>{await load(true);timer=setInterval(()=>load($('dashboard-panel').hidden),30000);});window.addEventListener('pagehide',()=>{clearInterval(timer);chartObserver?.disconnect();});
})();
