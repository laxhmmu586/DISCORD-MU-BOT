(() => {
 const auth=window.firebase?.apps?.length ? firebase.auth() : null;
 let currentUser=null,pending=null,generation=0;
 const isLax=data=>data?.state==='ready'&&['LAX','HQ','HEADQUARTER','HEADQUARTERS'].includes(String(data.profile?.station||'').trim().toUpperCase());
 const apply=allowed=>document.querySelectorAll('[data-info-access]').forEach(element=>{element.hidden=!allowed;});
 window.employeeInfoAccess=user=>{
  if(user===currentUser&&pending)return pending;
  currentUser=user;
  pending=(async()=>{
   const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/profile-api',{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+await user.getIdToken()}});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Unable to load your profile.');
   return isLax(data);
  })();
  return pending;
 };
 if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get("preview")==="1"){window.employeeInfoAccess=async()=>true;apply(true);return;}
 apply(false);
 auth?.onAuthStateChanged(async user=>{
  const request=++generation;apply(false);currentUser=null;pending=null;
  if(!user)return;
  try{const allowed=await window.employeeInfoAccess(user);if(request===generation)apply(allowed);}catch{}
 });
 window.addEventListener('employee-profile-updated',event=>apply(Boolean(auth?.currentUser)&&isLax({state:'ready',profile:event.detail})));
})();
