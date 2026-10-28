(() => {
 const auth=window.firebase?.apps?.length&&firebase.auth();let generation=0;
 window.hasReportRequest=async(path='',body)=>{
  const user=auth?.currentUser;if(!user)throw Error('Please sign in first.');
  const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/has-report-api'+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{...(window.workspaceHeaders?.()||{}),Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(auth.currentUser!==user)throw Error('Your sign-in changed. Reload the report.');if(!response.ok){const data=await response.json();throw Object.assign(Error(data.error||'Unable to load report.'),{status:response.status});}return /\/(export|preview)$/.test(path)?response.blob():response.json();
 };
 window.hasReportStream=async(path,signal)=>{
  const user=auth?.currentUser;if(!user)throw Object.assign(Error('Please sign in first.'),{status:401});
  const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/has-report-api'+path,{cache:'no-store',signal,headers:{...(window.workspaceHeaders?.()||{}),Authorization:'Bearer '+await user.getIdToken(),Accept:'text/event-stream'}});
  if(auth.currentUser!==user)throw Object.assign(Error('Your sign-in changed.'),{status:401});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(Error(data.error||'Live updates are unavailable.'),{status:response.status});}return response;
 };
 document.querySelectorAll('[data-report-access]').forEach(report=>{if(report.parentElement.querySelector('[data-checklist-access]'))return;const link=document.createElement('a');link.href='/has-checklist.html';link.dataset.checklistAccess='';link.hidden=true;const icon=report.querySelector('svg');if(icon)link.append(icon.cloneNode(true));link.append(document.createTextNode('Checklist'));report.after(link);});
 const publish=detail=>{window.hasReportContext=detail;const admin=document.getElementById('profile-admin-nav');if(admin&&typeof detail.canAdmin==='boolean')admin.hidden=!detail.canAdmin;document.querySelectorAll('[data-checklist-access]').forEach(link=>{link.hidden=!detail.canChecklist||Boolean(detail.error);if(location.pathname==='/has-checklist.html'){link.classList.add('is-active');link.setAttribute('aria-current','page');}});window.dispatchEvent(new CustomEvent('has-report-context',{detail}));};
 auth?.onAuthStateChanged(async user=>{const current=++generation;document.querySelectorAll('[data-report-access]').forEach(a=>a.hidden=true);publish({error:user?'Checking report access…':'Please sign in first.'});if(!user)return;try{const context=await window.hasReportRequest('/context');if(current!==generation)return;document.querySelectorAll('[data-report-access]').forEach(a=>a.hidden=!Object.values(context.permissions).some(Boolean));publish(context);}catch(error){if(current===generation)publish({error:error.message});}});
})();
