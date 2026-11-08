(() => {
  const decorate = () => {
    for (const notice of document.querySelectorAll('.workspace-permission-notice,#flight-status,#profile-status,#info-status,.login-status')) {
      if (!/unable to initialize sign-in|firebase is not connected|could not be verified|reload to try|please reload/i.test(notice.textContent) || notice.querySelector('[data-mufc-retry]')) continue;
      const actions = document.createElement('span');
      actions.className = 'mufc-recovery-actions';
      const reload = document.createElement('button');reload.type='button';reload.dataset.mufcRetry='';reload.textContent='重新加载 / Reload';reload.title='Ctrl+R / F5';
      reload.addEventListener('click', () => window.mufcDesktop?.windowControl ? void window.mufcDesktop.windowControl('reload') : location.reload());
      const login = document.createElement('button');login.type='button';login.textContent='返回登录 / Sign in';login.addEventListener('click',()=>location.assign('/login.html'));
      actions.append(reload,login);notice.append(actions);
    }
  };
  const mount = () => {
    const style=document.createElement('style');style.textContent='.mufc-recovery-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.mufc-recovery-actions button{appearance:none;border:1px solid #93b7d1;border-radius:9px;padding:10px 16px;background:linear-gradient(145deg,#f5faff,#dcecff);color:#123f62;font:500 13px/1.3 system-ui;cursor:pointer}.mufc-recovery-actions button:focus-visible{outline:2px solid #2877af;outline-offset:3px}';document.head.append(style);
    let queued=false;
    new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate()})}).observe(document.body,{subtree:true,childList:true,characterData:true});
    decorate();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
