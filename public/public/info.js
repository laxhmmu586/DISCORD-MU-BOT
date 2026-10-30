(()=>{
 const auth=window.firebase?.apps?.length&&firebase.auth(),status=document.querySelector('#info-status'),content=document.querySelector('#info-content');
 let generation=0;
 if(window.resourceDesignPreview){content.hidden=false;status.textContent='';return;}
 if(!auth){status.textContent='Unable to initialize sign-in. Please reload.';return;}
 auth.onAuthStateChanged(async user=>{
  const request=++generation;content.hidden=true;
  if(!user){location.replace('/login.html');return;}
  document.querySelector('#profile-admin-nav').hidden=!['lake@mu.com','nextweek1216@gmail.com','tamsun10@gmail.com'].includes(user.email?.toLowerCase());
  status.textContent='Checking access…';
  try{
   const allowed=await window.employeeInfoAccess(user);
   if(request!==generation)return;
   content.hidden=!allowed;
   status.textContent=allowed?'':'Info is currently available to LAX employees only.';
  }catch(error){if(request===generation)status.textContent='Unable to verify Info access. Please reload.';}
 });
})();
