(() => {
  const host=document.querySelector('#flight-account');
  if(!host) return;
  const auth=window.firebase?.apps?.length && window.firebase?.auth ? firebase.auth() : null;
  let profileGeneration=0;
  let activeScope=null;
  window.workspaceHeaders=()=>activeScope?{'X-Workspace-Account':JSON.stringify(activeScope)}:{};

  const loginOriginKey='mufc_login_origin';
  const readLoginOrigin=()=>{for(const storageName of ['localStorage','sessionStorage']){try{const value=window[storageName].getItem(loginOriginKey);if(value)return value;}catch{}}return '';};
  host.innerHTML=`<button class="login-button" type="button" aria-label="Open login menu" aria-expanded="false" aria-controls="flight-login-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z"/><path d="M4.25 20.25a8.25 8.25 0 0 1 15.5 0"/></svg><span class="flight-account-name">Account</span><span aria-hidden="true">⌄</span></button><div class="login-menu" id="flight-login-menu" hidden><div class="login-user"><span>LOGGED IN AS</span><strong id="current-user">Checking session…</strong></div><button id="change-password" type="button">CHANGE PASSWORD</button><button id="logout" type="button">LOGOUT</button></div>`;
  const style=document.createElement('style');
  style.textContent=`.flight-account{position:relative;gap:0}.flight-account .login-button{display:flex;align-items:center;gap:12px;max-width:100%;border:0;background:none;color:#f3f7ff;width:auto;height:44px;cursor:pointer}.flight-account-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.flight-account .login-button svg{flex:none;width:30px;height:30px;border:0;border-radius:0;padding:0;stroke-width:2.1;stroke-linecap:round}.flight-account .login-menu{position:absolute;right:0;top:50px;width:270px;z-index:20;border:1px solid #72889d66;background:#020e18;box-shadow:0 12px 30px #0009}.login-user{padding:18px;display:grid;gap:6px}.login-user span{font-size:11px;font-weight:700;letter-spacing:1px;color:#9aaab8}.login-user strong{font-size:14px;overflow-wrap:anywhere}.login-menu button{display:block;width:100%;padding:15px 18px;color:#fff;background:none;border:0;border-top:1px solid #72889d44;text-align:left;font-weight:700;cursor:pointer}.login-menu button[hidden]{display:none!important}.login-menu button:hover{background:#1a3550}.flight-password{color:#f3f7ff;background:#061626;border:1px solid #6b91b3;border-radius:12px;padding:24px;width:min(430px,90vw)}.flight-password::backdrop{background:#0009}.flight-password label{display:block;margin:15px 0}.flight-password input{display:block;width:100%;margin-top:8px;padding:10px;color:#fff;background:#020b14;border:1px solid #6885a1}.flight-password button{padding:10px 16px;border:1px solid #83acd2;border-radius:6px;background:#12365a;color:#fff;cursor:pointer}.flight-password #password-status{line-height:1.5}`;
  document.head.append(style);
  const menu=host.querySelector('.login-menu'),button=host.querySelector('.login-button');
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));};
  document.addEventListener('click',event=>{if(!host.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  const profileButton=document.createElement('button');profileButton.type='button';profileButton.hidden=true;profileButton.textContent='PROFILE';profileButton.onclick=()=>location.assign('/profile');host.querySelector('#change-password').before(profileButton);
  const avatar=document.createElement('span');avatar.className='flight-user-avatar';avatar.setAttribute('aria-hidden','true');host.querySelector('svg').replaceWith(avatar);
  style.textContent+='.flight-user-avatar{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:#254965;color:#fff;font-size:13px;font-weight:700;border:1px solid #84b1d4;overflow:hidden}.flight-user-avatar img{width:100%;height:100%;object-fit:cover}';
  function renderProfile(profile,user=auth?.currentUser){
    const glassNavigation=document.body.classList.contains("workspace-glass")||document.body.classList.contains("home-page");
    const externalMu=/^[^@\s]+@mu\.com$/i.test(String(user?.email||'').trim())&&!['lax@mu.com','lake@mu.com'].includes(String(user?.email||'').trim().toLowerCase());document.body.classList.toggle('mu-external-services',externalMu);
    for(const nav of document.querySelectorAll('.profile-sidebar nav,.workspace-features')){
      let schedule=nav.querySelector('[data-schedule-nav]');
      if(!schedule){const profileLink=nav.querySelector('a[href="/profile"]');if(profileLink){schedule=document.createElement('a');schedule.href='/schedule';schedule.dataset.scheduleNav='';schedule.innerHTML=glassNavigation?'<span class="art-icon icon-schedule" aria-hidden="true"></span><span>Schedule</span>':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2"/></svg><span>Schedule</span>';profileLink.after(schedule);}}
      const profileLink=nav.querySelector('a[href="/profile"],a[data-briefing-nav]');
      if(profileLink){profileLink.href='/briefing';profileLink.dataset.briefingNav='';profileLink.innerHTML=glassNavigation?'<span class="art-icon icon-briefing" aria-hidden="true"></span><span>Briefing</span>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4"/></svg><span>Briefing</span>';profileLink.classList.remove('is-active');profileLink.removeAttribute('aria-current');profileLink.hidden=!(profile?.canViewOperations??(profile?.station==='LAX'&&profile?.account==='MU'));if(location.pathname==='/briefing'){profileLink.classList.add('is-active');profileLink.setAttribute('aria-current','page');}}
      if(schedule){const testAccount=[profile?.loginId,profile?.email,profile?.companyEmail,user?.email].some(v=>String(v||'').trim().toLowerCase()==='test@hm.com');const excluded=!testAccount&&[profile?.name,profile?.nickname].some(value=>['DEMOHAS','HASOPSRAMP'].includes(String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')));schedule.hidden=excluded||!(profile?.canViewOperations??(profile?.station==='LAX'&&profile?.account==='MU'));if(location.pathname==='/schedule'){schedule.classList.add('is-active');schedule.setAttribute('aria-current','page');}}
    }
    for(const link of document.querySelectorAll('[data-flight-workspace-service]'))link.hidden=externalMu||!(profile?.station==='LAX'&&profile?.account==='MU');
    for(const link of document.querySelectorAll('a[href="/has-form"]'))link.hidden=!profile?.canViewForm;
    window.workspaceProfile={profile,user};window.dispatchEvent(new CustomEvent('workspace-profile',{detail:{profile,user}}));
    const label=profile?.nickname||profile?.name||user?.displayName||'Account';host.querySelector('#current-user').textContent=label;host.querySelector('.flight-account-name').textContent=label;
    avatar.replaceChildren();if(profile?.avatar){const img=document.createElement('img');img.alt='';img.src=profile.avatar;avatar.append(img);}else avatar.textContent=label.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  }
  const headerScript=document.createElement('script');headerScript.src='/workspace-header.js?v=20261030-mobile-navigation';document.head.append(headerScript);
  window.addEventListener('employee-profile-updated',event=>renderProfile(event.detail));
  auth?.onAuthStateChanged(async user=>{
    const generation=++profileGeneration;activeScope=null;try{if(user)activeScope=JSON.parse(sessionStorage.getItem('workspace-account:'+user.uid)||'null');}catch{}
    const allowed=Boolean(user)&&(!/^[^@\s]+@mu\.com$/i.test(user.email||'')||['lax@mu.com','lake@mu.com'].includes((user.email||'').trim().toLowerCase()));
    profileButton.hidden=!allowed;
    document.querySelectorAll('a[href="/profile"]').forEach(link=>{link.hidden=!allowed;});
    if(user&&!allowed&&location.pathname==='/profile'){location.replace('/flights.html');return;}
    renderProfile(null,user);if(!user)return;
    try{
      const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/profile-api',{cache:'no-store',headers:{Authorization:'Bearer '+await user.getIdToken()}});const result=await response.json();
      if(generation!==profileGeneration)return;
      if(!response.ok)throw Error(result.error||'Unable to load account.');
      if(result.state==='ready'||(result.profile&&!user.providerData.some(item=>item.providerId==='google.com')))renderProfile(result.profile,user);
      else if(!/^[^@\s]+@mu\.com$/i.test(user.email||'')&&user.providerData.some(item=>item.providerId==='google.com')&&location.pathname!=='/profile')location.replace('/login.html');
    }catch(error){if(generation===profileGeneration&&!/^[^@\s]+@mu\.com$/i.test(user.email||'')&&user.providerData.some(item=>item.providerId==='google.com')&&location.pathname!=='/profile')location.replace('/login.html');}
  });
  async function logout(){
    const loginOrigin=readLoginOrigin();
    const target=loginOrigin==='has'?'/has-login.html':'/login.html';
    window.setMufcFlight?.(null);
    for(const store of [localStorage,sessionStorage]) for(const key of ['mufc_allow_app_entry','mufc_auth_session_started_at','mufc_auth_last_activity_at',loginOriginKey]) { try{store.removeItem(key);}catch{} }
    try { if(auth?.currentUser) await auth.signOut(); } finally { location.replace(target); }
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
