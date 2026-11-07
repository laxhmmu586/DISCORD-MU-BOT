// Refresh the native server's authenticated session and clear it on sign-out.
(()=>{
  const auth=window.firebase?.apps?.length&&firebase.auth();if(!auth)return;
  auth.onIdTokenChanged(async user=>{
    if(location.pathname==='/login.html')return;
    if(!user){await fetch('/desktop-auth',{method:'DELETE'});location.replace('/login.html');return;}
    try{const response=await fetch('/desktop-auth',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken()}});if(!response.ok)location.replace('/login.html');}catch{location.replace('/login.html');}
  });
})();
