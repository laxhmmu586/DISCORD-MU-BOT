(()=>{
 const sources=[['uniform','Request Uniform','requests'],['incident','Incident Investigation Report','reports'],['expense','Expense Report','reports'],['terrific','Terrific Ten Distribution Form','reports']];
 let currentUser,sequence=0,pending;
 const title=(kind,r)=>[sources.find(s=>s[0]===kind)?.[1]||'Request',[r.employee?.station,r.employee?.account].filter(Boolean).join(' / ')||r.fields?.station||r.fields?.account||r.fields?.departmentReason||'Account unavailable',r.employee?.name||'Unknown employee'].join(' · ');
 async function load(){
  if(!currentUser)return; if(pending)return pending;
  const user=currentUser,version=sequence;
  pending=(async()=>{const token=await user.getIdToken(),base=(window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'');
   const groups=await Promise.all(sources.map(async([kind,name,property])=>{try{const response=await fetch(base+'/'+kind+'-api',{cache:'no-store',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(response.status===403)return {kind,name,rows:[]};const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load requests.');return {kind,name,rows:result[property]||[]};}catch(error){return {kind,name,rows:[],error:error.message};}}));
   if(version!==sequence)return;const rows=groups.flatMap(g=>g.rows.map(r=>({kind:g.kind,r}))),count=rows.filter(({r})=>r.canReview||r.needsRevision).length;
   document.querySelectorAll('a[href="/request.html"]').forEach(link=>{let badge=link.querySelector('.request-alert');if(count&&!badge){badge=document.createElement('span');badge.className='request-alert';badge.textContent='!';link.append(badge);}if(badge){badge.hidden=!count;badge.setAttribute('aria-label',count+' requests requiring your attention');}link.title=count?count+' requests requiring your attention':'Request';});
   window.RequestInbox.data={groups,rows,count};window.dispatchEvent(new CustomEvent('request-inbox-updated',{detail:window.RequestInbox.data}));return window.RequestInbox.data;
  })();try{return await pending;}finally{pending=null;}
 }
 window.RequestInbox={load,title,data:null};
 firebase.auth().onAuthStateChanged(user=>{currentUser=user;sequence++;if(user)load().catch(()=>{});else{window.RequestInbox.data=null;document.querySelectorAll('.request-alert').forEach(b=>b.remove());}});
 window.addEventListener('request-changed',()=>load().catch(()=>{}));window.addEventListener('focus',()=>load().catch(()=>{}));
 setInterval(()=>{if(!document.hidden)load().catch(()=>{});},60000);
})();
