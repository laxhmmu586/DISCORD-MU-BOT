(() => {
  const host=document.querySelector('#flight-account');
  if(!host) return;
  const auth=window.firebase?.apps?.length && window.firebase?.auth ? firebase.auth() : null;
  host.innerHTML=`<button class="login-button" type="button" aria-label="Open login menu" aria-expanded="false" aria-controls="flight-login-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z"/><path d="M4.25 20.25a8.25 8.25 0 0 1 15.5 0"/></svg><span class="flight-account-name">Account</span><span aria-hidden="true">⌄</span></button><div class="login-menu" id="flight-login-menu" hidden><div class="login-user"><span>LOGGED IN AS</span><strong id="current-user">Checking session…</strong></div><button id="change-password" type="button">CHANGE PASSWORD</button><button id="logout" type="button">LOGOUT</button></div>`;
  const style=document.createElement('style');
  style.textContent=`.flight-account{position:relative;gap:0}.flight-account .login-button{display:flex;align-items:center;gap:12px;max-width:100%;border:0;background:none;color:#f3f7ff;width:auto;height:44px;cursor:pointer}.flight-account-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.flight-account .login-button svg{flex:none;width:30px;height:30px;border:0;border-radius:0;padding:0;stroke-width:2.1;stroke-linecap:round}.flight-account .login-menu{position:absolute;right:0;top:50px;width:270px;z-index:20;border:1px solid #72889d66;background:#020e18;box-shadow:0 12px 30px #0009}.login-user{padding:18px;display:grid;gap:6px}.login-user span{font-size:11px;font-weight:700;letter-spacing:1px;color:#9aaab8}.login-user strong{font-size:14px;overflow-wrap:anywhere}.login-menu button{display:block;width:100%;padding:15px 18px;color:#fff;background:none;border:0;border-top:1px solid #72889d44;text-align:left;font-weight:700;cursor:pointer}.login-menu button:hover{background:#1a3550}.flight-password{color:#f3f7ff;background:#061626;border:1px solid #6b91b3;border-radius:12px;padding:24px;width:min(430px,90vw)}.flight-password::backdrop{background:#0009}.flight-password label{display:block;margin:15px 0}.flight-password input{display:block;width:100%;margin-top:8px;padding:10px;color:#fff;background:#020b14;border:1px solid #6885a1}.flight-password button{padding:10px 16px;border:1px solid #83acd2;border-radius:6px;background:#12365a;color:#fff;cursor:pointer}.flight-password #password-status{line-height:1.5}`;
  document.head.append(style);
  const menu=host.querySelector('.login-menu'),button=host.querySelector('.login-button');
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));};
  document.addEventListener('click',event=>{if(!host.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  auth?.onAuthStateChanged(user=>{const label=user?.email||'Account';host.querySelector('#current-user').textContent=label;host.querySelector('.flight-account-name').textContent=label;});
  async function logout(){
    window.setMufcFlight?.(null);
    for(const store of [localStorage,sessionStorage]) for(const key of ['mufc_allow_app_entry','mufc_auth_session_started_at','mufc_auth_last_activity_at']) store.removeItem(key);
    try { if(auth?.currentUser) await auth.signOut(); } finally { location.replace('/login.html'); }
  }
  host.querySelector('#logout').onclick=logout;
  const dialog=document.createElement('dialog');dialog.className='flight-password';
  dialog.innerHTML=`<form><h2>Change Password</h2><label>New password<input id="flight-new-password" type="password" autocomplete="new-password" minlength="6" required></label><label>Confirm password<input id="flight-confirm-password" type="password" autocomplete="new-password" minlength="6" required></label><p id="password-status" role="status"></p><button id="flight-save-password" type="submit">Update password</button> <button id="flight-close-password" type="button">Close</button></form>`;
  document.body.append(dialog);
  const status=dialog.querySelector('#password-status');
  host.querySelector('#change-password').onclick=()=>{
    close();dialog.querySelector('form').reset();
    const signedIn=Boolean(auth?.currentUser);
    status.textContent=signedIn?'':'Please sign in to change your password.';
    dialog.querySelectorAll('input,#flight-save-password').forEach(el=>el.disabled=!signedIn);
    dialog.showModal();
  };
  dialog.querySelector('#flight-close-password').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const password=dialog.querySelector('#flight-new-password').value;
    if(password!==dialog.querySelector('#flight-confirm-password').value){status.textContent='Passwords do not match.';return;}
    const save=dialog.querySelector('#flight-save-password');save.disabled=true;
    try {
      if(!auth?.currentUser)throw new Error('Please sign in first.');
      await auth.currentUser.updatePassword(password);await logout();
    } catch(error) {status.textContent=error.code==='auth/requires-recent-login'?'Please sign in again before changing your password.':error.message;}
    finally{save.disabled=false;}
  };
})();
