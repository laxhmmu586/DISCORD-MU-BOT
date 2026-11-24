// Core-owned refresh coordinator. No credentials or business drafts are serialized.
(() => {
  if (!window.mufcDesktop?.updatePrepare || window.top !== window) return;
  const nativeFetch = window.fetch.bind(window);
  let pending = 0, lastActivity = Date.now(), dirty = false, preparing = false;
  const locks = new Set();
  // Feature code can hold a lock across a scan, print, file upload or signing flow.
  window.mufcUpdateLock = key => { locks.add(key); return () => locks.delete(key); };
  window.fetch = async (...args) => {
    if(preparing)throw Error('MUFC is applying a verified update.');
    pending++;
    try { return await nativeFetch(...args); } finally { pending--; }
  };
  for (const name of ['pointerdown','keydown','touchstart']) document.addEventListener(name,event=>{if(!event.target.closest?.('[data-mufc-window-action="close"]'))lastActivity=Date.now();},true);
  for (const name of ['input','change']) document.addEventListener(name,event=>{
    if(event.target.matches?.('input,textarea,select,[contenteditable]'))dirty=true;
  },true);
  // A feature must explicitly confirm its business transaction was saved. We
  // never infer that all fields were saved from an arbitrary successful POST.
  window.addEventListener('mufc-work-saved',()=>{dirty=false;});
  function safe(explicit=false) {
    return !dirty && !pending && !locks.size && !preparing && (explicit||Date.now()-lastActivity>30000)
      && ['/login.html','/flights.html'].includes(location.pathname)
      && !document.querySelector(explicit?'dialog[open]:not(.mufc-settings),[aria-busy="true"],iframe[src]':'dialog[open],[aria-busy="true"],iframe[src]')
      && (explicit||!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'));
  }
  async function prepare(explicit=false) {
    if(!safe(explicit))return {safe:false};
    const event=new CustomEvent('mufc-before-update',{cancelable:true});
    if(!window.dispatchEvent(event))return {safe:false};
    // Selection, URL and scroll only. Login, passenger and draft contents stay
    // in the existing session and are never written to updater storage.
    const state={url:location.pathname+location.search+location.hash,x:scrollX,y:scrollY};
    try{sessionStorage.setItem('mufc-update-navigation',JSON.stringify(state));}catch{return {safe:false};}
    return {safe:true,url:state.url};
  }
  window.mufcDesktop.onUpdatePrepare(async ({token,reason})=>{
    const result=await prepare(reason==='core-install');preparing=result.safe;document.body.inert=Boolean(result.safe);
    // Always restore the page even if native installation fails or never replies.
    const release=()=>{preparing=false;document.body.inert=false;};
    if(result.safe)setTimeout(release,40000);
    try{await window.mufcDesktop.updatePrepare({token,...result});}finally{release();}
  });
  window.addEventListener('pageshow',()=>{
    try{const state=JSON.parse(sessionStorage.getItem('mufc-update-navigation'));if(state?.url===location.pathname+location.search+location.hash){scrollTo(state.x,state.y);sessionStorage.removeItem('mufc-update-navigation');}}catch{}
  });
  let failed=false,readyAt=0;window.addEventListener('error',()=>{failed=true;});window.addEventListener('unhandledrejection',()=>{failed=true;});
  // This status uses native IPC, so it works without a signed-in Firebase user.
  if(window.mufcDesktop.updateStatus && window.mufcDesktop.installUpdate){
    const status=document.createElement('div');status.setAttribute('role','status');
    status.style.cssText='position:fixed;left:18px;bottom:14px;z-index:10000;max-width:calc(100vw - 36px);padding:8px 12px;border:1px solid #ffffff20;border-radius:8px;background:#061828ee;color:#c5d0dd;font:12px/1.5 system-ui';
    const label=document.createElement('span'),install=document.createElement('button');install.type='button';install.textContent='立即安装';install.hidden=true;
    install.style.cssText='margin-left:12px;padding:6px 14px;border:0;border-radius:5px;background:#5865f2;color:white;font:600 12px system-ui;cursor:pointer';
    label.textContent='正在检查更新…';status.append(label,install);document.body.append(status);
    install.onclick=async()=>{install.disabled=true;try{await window.mufcDesktop.installUpdate();}catch(error){label.textContent='安装失败：'+error.message;}finally{install.disabled=false;}};
    const paint=async()=>{try{const state=await window.mufcDesktop.updateStatus();status.hidden=location.pathname!=='/login.html'&&!state.core;install.hidden=!state.core;label.textContent=state.status==='error'?state.message:state.core?'新版本'+(state.coreVersion?' '+state.coreVersion:'')+' 已下载，请点击“立即安装”。':state.message;}catch{label.textContent='暂时无法检查更新，将自动重试。';}};
    void paint();setInterval(paint,5000);
    window.addEventListener('online',()=>{void window.mufcDesktop.checkUpdates?.().then(paint).catch(()=>{});});
  }
  const health=setInterval(async()=>{
    if(failed)return;
    if(document.readyState==='complete' && (location.pathname==='/login.html'||window.firebase?.apps?.length) && window.mufcDesktop && !document.body.classList.contains('is-loading')) {
      if(!readyAt)readyAt=Date.now();if(Date.now()-readyAt<10000)return;
      await window.mufcDesktop.updateHealthy({version:window.mufcUIVersion});clearInterval(health);
    }else readyAt=0;
  },1000);
  setTimeout(()=>clearInterval(health),30000);
})();
