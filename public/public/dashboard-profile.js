(() => {
 const style=document.createElement('style');style.textContent='.nav-actions>.login-button{display:flex;width:auto;max-width:220px;gap:9px}.dashboard-account-avatar{display:grid;place-items:center;width:32px;height:32px;flex:none;border:1px solid #8ab4d5;border-radius:50%;overflow:hidden;background:#234361;font-size:12px}.dashboard-account-avatar img{width:100%;height:100%;object-fit:cover}.dashboard-account-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:600px){.dashboard-account-name{max-width:72px}}';document.head.append(style);
 function render(profile,user){
  const button=document.querySelector('.nav-actions>.login-button'),label=profile?.nickname||profile?.name||user?.displayName||'Account';document.querySelector('#current-user').textContent=label;button.replaceChildren();
  const avatar=document.createElement('span');avatar.className='dashboard-account-avatar';avatar.setAttribute('aria-hidden','true');if(profile?.avatar){const image=document.createElement('img');image.alt='';image.src=profile.avatar;avatar.append(image);}else avatar.textContent=label.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const name=document.createElement('span');name.className='dashboard-account-name';name.textContent=label;button.append(avatar,name);
 }
 window.loadDashboardProfile=async user=>{
  render(null,user);
  try{const result=await employeeProfileApi();if(result.state!=='ready'&&user.providerData.some(item=>item.providerId==='google.com')){location.replace('/login.html');return false;}if(result.profile)render(result.profile,user);return true;}
  catch{if(user.providerData.some(item=>item.providerId==='google.com')){location.replace('/login.html');return false;}return true;}
 };
})();
