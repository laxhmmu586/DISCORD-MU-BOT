(() => {
 const auth=window.firebase?.apps?.length&&firebase.auth();let generation=0;
 window.hasReportRequest=async(path='',body)=>{
  const user=auth?.currentUser;if(!user)throw Error('Please sign in first.');
  const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/has-report-api'+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(auth.currentUser!==user)throw Error('Your sign-in changed. Reload the report.');if(!response.ok){const data=await response.json();throw Object.assign(Error(data.error||'Unable to load report.'),{status:response.status});}return path.endsWith('/export')?response.blob():response.json();
 };
 const publish=detail=>{window.hasReportContext=detail;const admin=document.getElementById('profile-admin-nav');if(admin&&typeof detail.canAdmin==='boolean')admin.hidden=!detail.canAdmin;window.dispatchEvent(new CustomEvent('has-report-context',{detail}));};
 auth?.onAuthStateChanged(async user=>{const current=++generation;document.querySelectorAll('[data-report-access]').forEach(a=>a.hidden=true);publish({error:user?'Checking report access…':'Please sign in first.'});if(!user)return;try{const context=await window.hasReportRequest('/context');if(current!==generation)return;document.querySelectorAll('[data-report-access]').forEach(a=>a.hidden=!Object.values(context.permissions).some(Boolean));publish(context);}catch(error){if(current===generation)publish({error:error.message});}});
})();
