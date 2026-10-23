(()=>{
 const sources=[['uniform','Request Uniform','requests'],['incident','Incident Investigation Report','reports'],['expense','Expense Report','reports'],['terrific','Terrific Ten Distribution Form','reports']];
 let currentUser,sequence=0,pending,refreshQueued=false;
 const title=(kind,r)=>[sources.find(s=>s[0]===kind)?.[1]||'Request',[r.employee?.station,r.employee?.account].filter(Boolean).join(' / ')||r.fields?.station||r.fields?.account||r.fields?.departmentReason||'Account unavailable',r.employee?.name||'Unknown employee'].join(' · ');
 function badge(selector,count,label){document.querySelectorAll(selector).forEach(link=>{let alert=link.querySelector('.request-alert');if(count&&!alert){alert=document.createElement('span');alert.className='request-alert';alert.textContent='!';link.append(alert);}if(alert){alert.hidden=!count;alert.setAttribute('aria-label',count+' '+label);}});}
 function profileCases(rows,groups){const host=document.getElementById('profile-request-cases');if(!host)return;host.replaceChildren();
  const priority=({r})=>r.canReview||r.needsRevision?0:r.status==='pending'?1:2;
  const sorted=rows.filter(({r})=>r.canDelete===true||r.employee?.id&&r.employee.id===r.viewerId).sort((a,b)=>priority(a)-priority(b)||String(b.r.updatedAt||b.r.submittedAt||'').localeCompare(String(a.r.updatedAt||a.r.submittedAt||'')));
  for(const {kind,r} of sorted.slice(0,5)){const link=document.createElement('a');link.className='profile-case-entry';link.href='/request.html?request='+encodeURIComponent(r.id);const copy=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=title(kind,r);
   const state=r.needsRevision?'Returned for revision':r.canReview?'Awaiting your review':r.status==='pending'?'In Progress':({draft:'Draft',approved:'Approved',rejected:'Rejected'}[r.status]||r.status),at=r.updatedAt||r.submittedAt||r.createdAt;detail.textContent=state+(at&&!Number.isNaN(Date.parse(at))?' · '+new Date(at).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT':'');copy.append(name,detail);link.append(copy);
   if(r.canReview||r.needsRevision){const alert=document.createElement('span');alert.className='request-alert';alert.textContent='!';alert.setAttribute('aria-label','This case requires your attention');link.append(alert);}host.append(link);
  }
  if(!sorted.length){const empty=document.createElement('p');empty.className='info-note';empty.textContent=groups.some(g=>g.error)?'Unable to load some cases. Open Request to retry.':'No cases yet.';host.append(empty);}
 }
 function refresh(){if(pending){refreshQueued=true;return pending;}return load();}
 async function load(){
  if(!currentUser)return; if(pending)return pending;
  const user=currentUser,version=sequence;
  pending=(async()=>{const token=await user.getIdToken(),base=(window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'');
   const signing=fetch(base+'/read-sign-api',{cache:'no-store',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)}).then(async response=>response.ok?(await response.json()).memos||[]:response.status===403?[]:null).catch(()=>null);
   const groups=await Promise.all(sources.map(async([kind,name,property])=>{try{const response=await fetch(base+'/'+kind+'-api',{cache:'no-store',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(response.status===403)return {kind,name,rows:[]};const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load requests.');return {kind,name,position:result.employee?.position||result.position,rows:result[property]||[]};}catch(error){return {kind,name,rows:[],error:error.message};}}));
   if(version!==sequence)return;const rows=groups.flatMap(g=>g.rows.map(r=>({kind:g.kind,r}))),count=rows.filter(({r})=>r.canReview||r.needsRevision).length;
   const nav=document.getElementById('profile-admin-nav'),position=groups.find(g=>g.position)?.position,isAdmin=['lake@mu.com','nextweek1216@gmail.com','tamsun10@gmail.com'].includes(String(user.email||'').trim().toLowerCase());if(nav&&(position||isAdmin))nav.hidden=!(isAdmin||['Supervisor','Business Manager','Manager'].includes(position));
   const memos=await signing;if(version!==sequence)return;const signCount=memos===null?(window.RequestInbox.data?.signCount||0):memos.filter(m=>['pending','overdue'].includes(m.myStatus)).length;
   badge('.profile-sidebar a[href="/request.html"]',count,'requests requiring your attention');badge('.profile-sidebar a[href="/read-sign.html"],.activity-row[href="/read-sign.html"]',signCount,'documents awaiting your signature');profileCases(rows,groups);
   window.RequestInbox.data={groups,rows,count,signCount};window.dispatchEvent(new CustomEvent('request-inbox-updated',{detail:window.RequestInbox.data}));return window.RequestInbox.data;
  })();try{return await pending;}finally{pending=null;if(refreshQueued){refreshQueued=false;load().catch(()=>{});}}
 }
 window.RequestInbox={load:refresh,title,data:null};
 firebase.auth().onAuthStateChanged(user=>{currentUser=user;sequence++;if(user)refresh().catch(()=>{});else{const nav=document.getElementById('profile-admin-nav');if(nav)nav.hidden=true;window.RequestInbox.data=null;document.querySelectorAll('.request-alert').forEach(b=>b.remove());}});
 window.addEventListener('request-changed',()=>refresh().catch(()=>{}));window.addEventListener('read-sign-changed',()=>refresh().catch(()=>{}));window.addEventListener('storage',event=>{if(event.key==='read-sign-updated')refresh().catch(()=>{});});window.addEventListener('focus',()=>load().catch(()=>{}));
 setInterval(()=>{if(!document.hidden)load().catch(()=>{});},60000);
})();
