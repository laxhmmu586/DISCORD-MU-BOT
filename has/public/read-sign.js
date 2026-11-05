(()=>{
 const $=id=>document.getElementById(id),status=$('rs-status');let data,selected,filter='all',busy=false,publishId=crypto.randomUUID(),draft=null,strokes=[],drawing=null,clockOffset=0,reportRefreshing=false,detailRevision=0;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const date=(v,short=false)=>new Date(v).toLocaleString('en-US',{timeZone:'America/Los_Angeles',...(short?{month:'short',day:'numeric',year:'numeric'}:{dateStyle:'medium',timeStyle:'short'})})+(short?'':' PT');
 const badge=m=>node('span',{signed:'Signed',pending:'Awaiting your signature',overdue:'Overdue','not-required':'Not assigned'}[m.myStatus],'rs-badge '+m.myStatus);
 const api=async(path='',body,blob)=>{const result=await peopleApi('/read-sign-api'+path,body,blob);if(body){window.dispatchEvent(new Event('read-sign-changed'));try{localStorage.setItem('read-sign-updated',String(Date.now()));}catch{}}return result;};
 function completion(){
  const report=selected?.completion;
  $('rs-completion').hidden=!report;
  if(!report)return;
  const queued=report.status==='queued',sent=report.status==='sent',supplement=report.status==='awaiting-signatures';
  const seconds=Math.max(0,Math.ceil((Date.parse(report.deliverAt)-Date.now()-clockOffset)/1000));
  $('rs-send-completion').hidden=queued||sent||supplement;
  $('rs-send-completion').disabled=busy||!report.eligible;
  $('rs-cancel-completion').hidden=!queued;
  $('rs-cancel-completion').disabled=busy||seconds===0;
  $('rs-completion-status').textContent=supplement?'Additional signatures are pending. The existing report is kept and will update automatically as they sign.':sent?'Completion sent to Safety.':queued?`Sending to Safety in ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}. You can cancel during the countdown.`:report.eligible?'Everyone assigned in this account has signed. Send the completed register to Safety.':'All assigned employees in this account must sign before you can send completion.';
  if(queued&&seconds===0&&!busy&&!reportRefreshing){
   reportRefreshing=true;
   open(selected.id).catch(error=>status.textContent=error.message).finally(()=>{reportRefreshing=false;});
  }
 }
 const reportView={memoId:null,station:'LAX',account:null};
 function reports(memo){
  $('rs-completion-reports').hidden=!Array.isArray(memo.completionReports);
  const container=$('rs-report-list');container.replaceChildren();
  if(!memo.completionReports)return;
  $('rs-report-count').textContent=`${memo.reportedAccounts} / ${memo.totalAccounts} accounts complete · ${memo.receivedAccounts} reports received`;
  const scopes=memo.completionScopes||[];
  const stations=[...new Set(scopes.map(scope=>scope.station))].sort((a,b)=>Number(b==='LAX')-Number(a==='LAX')||a.localeCompare(b));
  if(reportView.memoId!==memo.id){reportView.memoId=memo.id;reportView.station=stations[0];reportView.account=null;}
  const toolbar=node('label','Station','rs-report-toolbar'),select=node('select');select.setAttribute('aria-label','Completion report station');
  select.append(...stations.map(station=>new Option(station,station)));select.value=reportView.station;
  select.onchange=()=>{reportView.station=select.value;reportView.account=null;reports(memo);};toolbar.append(select);container.append(toolbar);
  const accounts=scopes.filter(scope=>scope.station===reportView.station).sort((a,b)=>a.account.localeCompare(b.account));
  if(!accounts.some(scope=>scope.account===reportView.account))reportView.account=accounts.find(scope=>scope.targeted)?.account||accounts[0]?.account;
  const grid=node('div',null,'rs-report-grid');grid.setAttribute('aria-label',reportView.station+' account completion');
  for(const scope of accounts){
   const report=memo.completionReports.find(report=>report.station===scope.station&&report.account===scope.account);
   const rate=report?.total?Math.round(100*report.signed/report.total):scope.targeted?0:null;
   const card=node('button',null,'rs-account-card');card.type='button';card.dataset.account=scope.account;
   card.setAttribute('aria-pressed',String(reportView.account===scope.account));
   card.setAttribute('aria-label',scope.station+' / '+scope.account+' · '+(rate===null?'No assigned memo':rate+'% completed'));
   card.dataset.received=String(Boolean(report));card.append(node('strong',scope.account));
   const ring=document.createElementNS('http://www.w3.org/2000/svg','svg');ring.setAttribute('viewBox','0 0 160 160');ring.setAttribute('aria-hidden','true');
   ring.dataset.chargePercent=rate===null?'':String(rate);ring.dataset.chargeKey=memo.id+':'+scope.station+':'+scope.account;
   ring.innerHTML=`<circle cx="80" cy="80" r="58" fill="none" stroke="#dbe8f5" stroke-width="13"/>${rate?'<circle cx="80" cy="80" r="58" fill="none" stroke="#258be8" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="'+rate+' 100" transform="rotate(-90 80 80)"/>':''}<text x="80" y="89" text-anchor="middle" font-size="30" font-weight="700" fill="#205f9e">${rate===null?'—':rate+'%'}</text>`;
   card.append(ring);card.onclick=()=>{reportView.account=scope.account;reports(memo);};grid.append(card);
  }
  container.append(grid);
  window.chargeDashboard?.(container);
  const report=memo.completionReports.find(report=>report.station===reportView.station&&report.account===reportView.account);
  const detail=node('section',null,'rs-report-detail');detail.append(node('h4',reportView.station+' / '+reportView.account));
  if(!report){detail.append(node('p',accounts.find(scope=>scope.account===reportView.account)?.targeted?'Awaiting the Business Manager’s completion report.':'No employees assigned to this memo in this account.','rs-muted'));container.append(detail);return;}
  detail.append(node('p',`${report.signed} / ${report.total} completed · Sent by ${report.submittedBy.name} · ${date(report.deliverAt)}`,'rs-muted'));
  const table=node('table',null,'rs-table'),head=node('tr');
  for(const title of ['Employee','Signature','Acknowledged'])head.append(node('th',title));
  const thead=node('thead'),tbody=node('tbody');thead.append(head);
  for(const person of report.roster){
   const row=node('tr'),signature=node('td');
   if(person.signature){const img=node('img');img.className='rs-signature';img.src=person.signature;img.alt='Signature of '+person.name;signature.append(img);}
   row.append(node('td',person.name),signature,node('td',person.signedAt?date(person.signedAt):'Awaiting signature'));tbody.append(row);
  }
  table.append(thead,tbody);const wrap=node('div',null,'rs-table-wrap');wrap.append(table);detail.append(wrap);container.append(detail);
 }
 function list(){
  const q=$('rs-search').value.toLowerCase();$('rs-list').replaceChildren();
  const memos=data.memos.filter(m=>(filter==='all'||filter==='signed'&&m.myStatus==='signed'||filter==='pending'&&['pending','overdue'].includes(m.myStatus))&&(m.subject+' '+m.memoNumber).toLowerCase().includes(q));
  for(const m of memos){const b=node('button',null,selected?.id===m.id?'is-selected':'');b.type='button';b.append(badge(m),node('h3',m.subject),node('p',`Deadline · ${date(m.deadline,true)}`));if(data.canPublish){const bar=node('span',null,'rs-progress'),fill=node('i');fill.style.width=(m.total?m.signed/m.total*100:0)+'%';bar.append(fill);b.append(bar,node('p',`${m.signed} / ${m.total} signed · ${m.total-m.signed} pending`));}if(m.reportedAccounts!==undefined)b.append(node('p',`${m.reportedAccounts} / ${m.totalAccounts} accounts reported complete`));b.onclick=()=>open(m.id).catch(e=>status.textContent=e.message);$('rs-list').append(b);}
  if(!memos.length)$('rs-list').append(node('p','No Read & Sign records in this view.','rs-empty'));
  $('stat-pending').textContent=data.memos.filter(m=>['pending','overdue'].includes(m.myStatus)).length;$('stat-signed').textContent=data.memos.filter(m=>m.myStatus==='signed').length;$('stat-overdue').textContent=data.memos.filter(m=>m.myStatus==='overdue').length;
  document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
 }
 async function load(){data=await api();$('publish-memo').hidden=!data.canPublish;document.querySelector('.rs-subtitle').textContent=data.mainAccount.station+' / '+data.mainAccount.account+' · Read, acknowledge and sign.';const account=$('memo-account');account.replaceChildren(...(data.canSelectAccounts?[new Option('All accounts','ALL')]:[]),...(data.recipientAccounts||[]).map(a=>new Option(a.station+' / '+a.account,JSON.stringify([a.station,a.account]))));account.disabled=!data.canSelectAccounts;list();return data;}
 async function open(id){
  const revision=++detailRevision,result=await api('/'+encodeURIComponent(id));if(revision!==detailRevision)return;selected=result;const r=selected;clockOffset=Date.parse(r.serverNow)-Date.now();history.replaceState(null,'','?memo='+encodeURIComponent(id)+(filter==='signed'?'&view=history':''));list();$('rs-empty-detail').hidden=true;$('rs-detail-content').hidden=false;completion();reports(r);
  $('rs-detail-badge').replaceChildren(badge(r));$('rs-subject').textContent=r.subject;$('rs-body').textContent=r.body;
  $('rs-meta').replaceChildren(...[`Memo # ${r.memoNumber||'—'}`,`Published ${date(r.publishedAt,true)} · ${r.publisher.name}`,`Deadline ${date(r.deadline)}`].map(v=>node('span',v)));
  $('rs-print-heading').textContent=`HALLMARK AVIATION SERVICES · HMMU / China Eastern\nDate of Issuance: ${date(r.publishedAt,true)}\nMemo #: ${r.memoNumber||'—'}\nTopic: ${r.subject}\nDeadline: ${date(r.deadline)}`;
  $('rs-files').replaceChildren();for(const f of r.attachments){if(!r.canDownload){$('rs-files').append(node('span',f.name,'rs-file-label'));continue;}const b=node('button',`↓ ${f.name} · ${(f.size/1024).toFixed(0)} KB`);b.type='button';b.onclick=async()=>{b.disabled=true;try{const blob=await api('/'+r.id+'/attachments/'+f.id,undefined,true),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};$('rs-files').append(b);}
  $('rs-register-section').hidden=!r.canManage;document.querySelector('.rs-detail').classList.toggle('can-manage',r.canManage);$('rs-register-count').textContent=r.canManage?`${r.signed} signed · ${r.total-r.signed} pending`:'';$('rs-register').replaceChildren();
  for(const p of r.roster||[]){const tr=node('tr'),name=node('td',p.name),sig=node('td'),ack=node('td');if(p.signature){const img=node('img');img.src=p.signature;img.alt='Handwritten signature of '+p.name;img.className='rs-signature';sig.append(img);ack.append(node('span',date(p.signedAt)),node('small',p.late?'Signed after deadline':'Acknowledged'));}else{sig.append(node('span','Not signed','rs-badge '+(new Date(r.deadline)<new Date()?'overdue':'')));ack.textContent='—';}if(data.canPublish)name.append(node('small',`Email: ${{sent:'Sent',pending:'Queued',failed:'Retry pending','missing-email':'Missing email address'}[p.emailStatus]}`));tr.append(name,sig,ack);$('rs-register').append(tr);}
  const candidates=r.availableRecipients||[];$('rs-recipient-editor').hidden=!r.canManage||!candidates.length;$('rs-add-recipients').replaceChildren(...candidates.map(p=>new Option(p.name+(p.eid?' · '+p.eid:''),p.id)));$('rs-recipient-status').textContent='';
  $('rs-sign-box').hidden=!r.required||r.myStatus==='signed';$('rs-signed-receipt').hidden=r.myStatus!=='signed';$('rs-signed-receipt').textContent=r.mySignedAt?'Your signed acknowledgement is saved · '+date(r.mySignedAt):'';
  clear();$('rs-ack').checked=false;
 }
 const canvas=$('rs-canvas'),ctx=canvas.getContext('2d');
 function redraw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#102c48';for(const s of strokes){ctx.beginPath();s.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p[0]*canvas.width,p[1]*canvas.height));ctx.stroke();}}
 function clear(){strokes=[];drawing=null;redraw();}
 const point=e=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))];};
 canvas.onpointerdown=e=>{if(busy||drawing||e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing=[point(e)];strokes.push(drawing);};canvas.onpointermove=e=>{if(!drawing||busy)return;drawing.push(point(e));redraw();};
 canvas.onpointerup=canvas.onpointercancel=()=>{if(drawing?.length<2)strokes.pop();drawing=null;redraw();};$('clear-signature').onclick=clear;
 $('rs-add-recipients-save').onclick=async()=>{if(busy||!selected)return;const employeeIds=[...$('rs-add-recipients').selectedOptions].map(option=>option.value),id=selected.id;if(!employeeIds.length){$('rs-recipient-status').textContent='Select at least one employee.';return;}busy=true;$('rs-add-recipients-save').disabled=true;try{await api('/'+id+'/recipients',{employeeIds});await load();await open(id);status.textContent='Employees added. They can now sign this memo; email reminders are queued.';}catch(e){$('rs-recipient-status').textContent=e.message;}finally{busy=false;$('rs-add-recipients-save').disabled=false;}};
 $('save-signature').onclick=async()=>{if(busy||!selected)return;if(!$('rs-ack').checked){status.textContent='Confirm that you have read and understood the memo.';return;}if(strokes.flat().length<6){status.textContent='Draw your full handwritten signature.';return;}busy=true;$('save-signature').disabled=true;try{await api('/'+selected.id+'/sign',{acknowledged:true,strokes});await load();await open(selected.id);status.textContent='Your signature and acknowledgement date have been saved.';}catch(e){status.textContent=e.message;}finally{busy=false;$('save-signature').disabled=false;}};
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;list();});$('rs-search').oninput=list;
 $('refresh-memos').onclick=async()=>{try{await load();if(selected)await open(selected.id);status.textContent='Updated.';}catch(e){status.textContent=e.message;}};
 $('print-register').onclick=()=>{if(selected?.canManage)window.print();};
 async function sendCompletion(action){
  if(busy||!selected)return;
  ++detailRevision;busy=true;completion();const id=selected.id;
  try{await api('/'+id+'/completion',{action});await load();await open(id);status.textContent=action==='cancel'?'Completion sending cancelled.':'Completion scheduled. You have two minutes to cancel.';}
  catch(error){status.textContent=error.message;}
  finally{busy=false;completion();}
 }
 $('rs-send-completion').onclick=()=>sendCompletion('send');
 $('rs-cancel-completion').onclick=()=>sendCompletion('cancel');
 setInterval(completion,1000);
 setInterval(async()=>{
  if(!selected?.allAccounts||busy||drawing||strokes.length||document.hidden||$('compose-dialog').open||document.activeElement?.closest('#rs-recipient-editor')||reportRefreshing)return;
  const id=selected.id;reportRefreshing=true;
  try{await open(id);if(selected?.id!==id)return;data.memos=data.memos.map(memo=>memo.id===id?selected:memo);list();}
  catch(error){status.textContent=error.message;}
  finally{reportRefreshing=false;}
 },15000);
 const dialog=$('compose-dialog'),form=$('compose-form'),cs=$('compose-status');
 $('publish-memo').onclick=()=>{dialog.showModal();};$('close-compose').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};
 async function payload(){const files=[...$('memo-files').files];if(files.length>5||files.reduce((n,f)=>n+f.size,0)>10*1024*1024)throw Error('Attach up to 5 files, totaling at most 10 MB.');return {requestId:publishId,targetAccount:$('memo-account').value,subject:$('memo-subject').value,memoNumber:$('memo-number').value,body:$('memo-body').value,deadline:new Date($('memo-deadline').value).toISOString(),attachments:await Promise.all(files.map(async f=>({name:f.name,type:f.type||(/\.txt$/i.test(f.name)?'text/plain':''),data:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Could not read attachment.'));reader.readAsDataURL(f);})})))};}
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;try{draft=await payload();if(new Date(draft.deadline)<=new Date())throw Error('Choose a future deadline.');$('compose-fields').hidden=true;$('compose-preview').hidden=false;$('compose-preview-text').textContent=`To: ${$('memo-account').selectedOptions[0]?.textContent||'Main Account'}\nSubject: ${draft.subject}\nMemo #: ${draft.memoNumber||'—'}\nDeadline: ${date(draft.deadline)}\n\n${draft.body}\n\nAttachments: ${draft.attachments.map(f=>f.name).join(', ')||'None'}`;cs.textContent='Publishing will notify employees in the selected account scope and require their handwritten signature.';}catch(e){cs.textContent=e.message;}};
 $('edit-draft').onclick=()=>{if(busy)return;$('compose-fields').hidden=false;$('compose-preview').hidden=true;cs.textContent='';};
 $('confirm-publish').onclick=async()=>{if(busy||!draft)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await api('',draft);publishId=crypto.randomUUID();draft=null;form.reset();$('compose-fields').hidden=false;$('compose-preview').hidden=true;dialog.close();await load();await open(r.id);status.textContent='Published. Email reminders are queued; delivery status appears beside each employee in the register.';}catch(e){cs.textContent=e.message;}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 firebase.auth().onAuthStateChanged(async user=>{if(!user){peopleSignIn();return;}try{await load();$('rs-content').hidden=false;filter=new URLSearchParams(location.search).get('view')==='history'?'signed':'all';list();const id=new URLSearchParams(location.search).get('memo');if(id)await open(id);else{const first=filter==='signed'?data.memos.find(m=>m.myStatus==='signed'):data.memos[0];if(first)await open(first.id);}status.textContent='';}catch(e){status.textContent=e.message;}});
})();
