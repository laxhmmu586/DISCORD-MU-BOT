(() => {
 const $=id=>document.getElementById(id),esc=escapeHtml;let timer,chartObserver,requestVersion=0,dashboardRecords=[];
 const qa=document.body.classList.contains('qa-workspace');
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
   return '<button type="button" class="has-qa-scope" data-qa-scope="'+esc(key)+'"><strong>'+esc(key)+'</strong><svg class="has-progress-ring" viewBox="0 0 160 160" role="img" aria-label="'+(rate===null?'No scheduled flights':rate+'% covered')+'"><circle cx="80" cy="80" r="58" fill="none" stroke="#edf3fa" stroke-width="13"/>'+(rate?'<circle cx="80" cy="80" r="58" fill="none" stroke="#258be8" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="'+rate+' 100" transform="rotate(-90 80 80)"/>':'')+'<text x="80" y="89" text-anchor="middle" font-size="30" font-weight="700" fill="#205f9e">'+(rate===null?'—':rate+'%')+'</text></svg></button>';
  }).join('');
  return '<section class="has-qa-overview"><h2>'+esc(title)+'</h2>'+(station?'<button type="button" data-qa-back>← '+(account?'All accounts in '+esc(d.station):'All stations')+'</button>':'')+(account?'':'<div class="has-chart-grid has-qa-grid">'+(cards||'<p>No PBB scopes available.</p>')+'</div>')+'</section>';
 }
 const headings='<th>Expected flights</th><th>Submitted flights</th><th>Submitted checklists</th><th>In progress</th>';
 const cells=r=>`<td>${r.expectedFlights}</td><td>${r.submittedFlights}</td><td>${r.submittedChecklists}</td><td>${r.pending}</td>`;
 function charts(d,plotWidth=550){
  const sum=key=>d.daily.reduce((n,r)=>n+r[key],0),expected=sum('expectedFlights'),submitted=sum('submittedFlights'),covered=sum('coveredFlights'),percent=expected?Math.min(100,Math.round(covered/expected*100)):0;
  const w=Math.max(220,plotWidth,d.daily.length*62+60),h=230,left=38,bottom=194,top=22,max=Math.max(1,...d.daily.map(r=>Math.max(r.expectedFlights,r.submittedFlights))),step=(w-left-20)/d.daily.length;
  const bars=d.daily.map((r,i)=>{const x=left+i*step+step/2,bw=Math.min(16,step*.26),expectedHeight=(bottom-top)*r.expectedFlights/max,submittedHeight=(bottom-top)*r.submittedFlights/max;return `<g><title>${r.date}: ${r.expectedFlights} expected flights, ${r.submittedFlights} submitted flights</title><rect x="${x-bw-2}" y="${bottom-expectedHeight}" width="${bw}" height="${expectedHeight}" rx="3" fill="#dbe7f4"/><rect x="${x+2}" y="${bottom-submittedHeight}" width="${bw}" height="${submittedHeight}" rx="3" fill="#2087e4"/><text x="${x+bw/2+2}" y="${Math.max(12,bottom-submittedHeight-7)}" text-anchor="middle" font-size="10" fill="#2265a1">${r.submittedFlights}</text><text x="${x}" y="216" text-anchor="middle" font-size="10" fill="#73899e">${r.date.slice(5)}</text></g>`;}).join('');
  const ticks=[...new Set([0,Math.ceil(max/2),max])].map(n=>{const y=bottom-(bottom-top)*n/max;return `<line x1="${left}" y1="${y}" x2="${w-10}" y2="${y}" stroke="#edf2f7"/><text x="${left-9}" y="${y+3}" text-anchor="end" fill="#8498ab" font-size="10">${n}</text>`;}).join('');
  return `<div class="has-chart-grid"><section class="has-chart-card"><h3>Submission chart</h3><div class="has-chart-legend"><span><i></i>Expected flights</span><span><i class="submitted"></i>Submitted flights</span></div><div class="has-chart-scroll"><svg class="has-bars" style="min-width:${w}px" viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily chart: ${expected} expected flights and ${submitted} submitted flights">${ticks}${bars}</svg></div></section><section class="has-chart-card"><h3>Flight coverage</h3><svg class="has-progress-ring" viewBox="0 0 160 160" role="img" aria-label="${covered} of ${expected} expected flights submitted"><circle cx="80" cy="80" r="58" fill="none" stroke="#edf3fa" stroke-width="13"/><circle cx="80" cy="80" r="58" fill="none" stroke="#258be8" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="${percent} 100" transform="rotate(-90 80 80)"/><text x="80" y="83" text-anchor="middle" font-size="30" font-weight="700" fill="#205f9e">${qa&&!expected?'—':percent+'%'}</text><text x="80" y="105" text-anchor="middle" font-size="10" fill="#7c91a5">flights covered</text></svg><p>${covered} / ${expected} expected flights covered</p><div class="has-chart-summary"><span><strong>${expected}</strong> flights expected</span><span><strong>${covered}</strong> flights covered</span></div></section></div>`;
 }
 function fitChart(d){
  chartObserver?.disconnect();const plot=$('dashboard-results').querySelector('.has-chart-scroll');let previousWidth=0;
  const resize=()=>{const width=Math.floor(plot.clientWidth);if(width===previousWidth)return;previousWidth=width;const holder=document.createElement('div');holder.innerHTML=charts(d,width);plot.replaceChildren(holder.querySelector('.has-bars'));};
  resize();if(window.ResizeObserver){chartObserver=new ResizeObserver(resize);chartObserver.observe(plot);}
 }
 async function load(initial=false){const version=++requestVersion;try{
  const query=new URLSearchParams();if(qa)query.set('qa','1');if(!initial){query.set('station',$('dashboard-station').value);query.set('account',$('dashboard-account').value);query.set('start',$('dashboard-start').value);query.set('end',$('dashboard-end').value);}
  const d=await apiJson('/has-pbb-api/dashboard?'+query);if(version!==requestVersion)return;$('dashboard-panel').hidden=false;dashboardRecords=d.records;
  if(initial){for(const key of ['station','account'])$('dashboard-'+key).innerHTML=(qa?`<option value="ALL">All ${key==='station'?'stations':'accounts'}</option>`:'')+[...new Set(d.scopes.map(s=>s[key]))].sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('dashboard-start').value=d.start;$('dashboard-end').value=d.end;}
  const total=key=>d.daily.reduce((sum,r)=>sum+r[key],0),title=d.station==='ALL'&&d.account==='ALL'?'Overall statistics':`${d.station==='ALL'?'All stations':d.station} / ${d.account==='ALL'?'All accounts':d.account}`;
  $('dashboard-results').innerHTML=`<section class="has-panel"><h2>${esc(title)}</h2><div class="has-totals"><div><strong>${total('expectedFlights')}</strong>Expected flights</div><div><strong>${total('submittedFlights')}</strong>Flights submitted</div><div><strong>${total('submittedChecklists')}</strong>Bridge checklists submitted</div></div><small>Expected flights include Arrival + Departure on their configured operating days. Each submitted Arrival or Departure flight counts once after at least one bridge checklist has both signatures. Additional bridge checklists count separately. Coverage includes scheduled flights only.</small>${charts(d)}<h3>Daily submissions</h3><div class="has-table-wrap"><table><thead><tr><th>Date</th>${headings}</tr></thead><tbody>${d.daily.map(r=>`<tr><td>${r.date}</td>${cells(r)}</tr>`).join('')}</tbody></table></div></section><section class="has-panel"><h2>By station and account</h2><div class="has-table-wrap"><table><thead><tr><th>Station</th><th>Account</th><th>Arrivals / week</th><th>Departures / week</th>${headings}</tr></thead><tbody>${d.byScope.map(r=>`<tr><td>${esc(r.station)}</td><td>${esc(r.account)}</td><td>${r.weeklyArrivals}</td><td>${r.weeklyDepartures}</td>${cells(r)}</tr>`).join('')}</tbody></table></div></section><section class="has-panel"><h2>Checklist details</h2><div class="has-table-wrap"><table><thead><tr><th>Station / Account</th><th>Date</th><th>Flight / Gate</th><th>Operation</th><th>Bridge</th><th>Driver</th><th>Spotter</th><th>Submitted</th><th>PDF</th></tr></thead><tbody>${d.records.map(r=>`<tr><td>${esc(r.station)} / ${esc(r.account)}</td><td>${r.date}</td><td>${esc(r.flightNo)} / ${esc(r.gate)}</td><td>${r.type==='departure'?'Departure':'Arrival'}</td><td>${r.bridge}</td><td>${esc(r.operators.driver||'—')}</td><td>${esc(r.operators.spotter||'—')}</td><td>${r.completedAt?esc(r.completedAt):'In progress'}</td><td>${r.completedAt?`<button type="button" data-download-pdf="${esc(r.id)}">Download PDF</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></section>`;
  if(qa){const results=$('dashboard-results');if(d.account==='ALL')results.lastElementChild.remove();results.children[1].remove();results.insertAdjacentHTML('afterbegin',qaOverview(d));}
  if(qa&&d.account!=='ALL'){
   const missing=d.missing||[];
   $('dashboard-results').lastElementChild.insertAdjacentHTML('beforebegin',
    '<section class="has-panel"><h2>Uncovered scheduled flights ('+missing.length+')</h2>'+
    (missing.length?'<div class="has-table-wrap"><table><thead><tr><th>Date</th><th>Flight</th><th>Operation</th></tr></thead><tbody>'+missing.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.flightNo)+'</td><td>'+(r.type==='arrival'?'Arrival':'Departure')+'</td></tr>').join('')+'</tbody></table></div>':'<p>No uncovered scheduled flights for this date range.</p>')+'</section>');
  }
  fitChart(d);
  $('has-status').textContent='Updated '+new Date().toLocaleTimeString()+' · Refreshes every 30 seconds';
 }catch(e){if(version!==requestVersion)return;if(e.status===403){$('dashboard-results').replaceChildren();$('dashboard-panel').hidden=true;dashboardRecords=[];chartObserver?.disconnect();}$('has-status').textContent=e.message;}}
 $('dashboard-results').addEventListener('click',async event=>{
  const scope=event.target.closest('[data-qa-scope]'),back=event.target.closest('[data-qa-back]');
  if(qa&&(scope||back)){
   const station=$('dashboard-station'),account=$('dashboard-account');
   if(back){if(account.value!=='ALL')account.value='ALL';else station.value='ALL';}
   else if(station.value==='ALL')station.value=scope.dataset.qaScope;else account.value=scope.dataset.qaScope;
   await load();$('dashboard-results').querySelector('[data-qa-back], [data-qa-scope]')?.focus();return;
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
