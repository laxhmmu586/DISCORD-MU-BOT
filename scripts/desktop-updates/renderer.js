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
  function safe() {
    return !dirty && !pending && !locks.size && !preparing && Date.now()-lastActivity>30000
      && ['/login.html','/flights.html'].includes(location.pathname)
      && !document.querySelector('dialog[open],[aria-busy="true"],iframe[src]')
      && !document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  }
  async function prepare() {
    if(!safe())return {safe:false};
    const event=new CustomEvent('mufc-before-update',{cancelable:true});
    if(!window.dispatchEvent(event))return {safe:false};
    // Selection, URL and scroll only. Login, passenger and draft contents stay
    // in the existing session and are never written to updater storage.
    const state={url:location.pathname+location.search+location.hash,x:scrollX,y:scrollY};
    try{sessionStorage.setItem('mufc-update-navigation',JSON.stringify(state));}catch{return {safe:false};}
    return {safe:true,url:state.url};
  }
  window.mufcDesktop.onUpdatePrepare(async ({token})=>{
    const result=await prepare();preparing=result.safe;document.body.inert=Boolean(result.safe);
    await window.mufcDesktop.updatePrepare({token,...result});
    if(result.safe)setTimeout(()=>{preparing=false;document.body.inert=false;},10000);
  });
  window.addEventListener('pageshow',()=>{
    try{const state=JSON.parse(sessionStorage.getItem('mufc-update-navigation'));if(state?.url===location.pathname+location.search+location.hash){scrollTo(state.x,state.y);sessionStorage.removeItem('mufc-update-navigation');}}catch{}
  });
  let failed=false,readyAt=0;window.addEventListener('error',()=>{failed=true;});window.addEventListener('unhandledrejection',()=>{failed=true;});
  const health=setInterval(async()=>{
    if(failed)return;
    if(document.readyState==='complete' && window.firebase?.apps?.length && window.mufcDesktop && !document.body.classList.contains('is-loading')) {
      if(!readyAt)readyAt=Date.now();if(Date.now()-readyAt<10000)return;
      await window.mufcDesktop.updateHealthy({version:window.mufcUIVersion});clearInterval(health);
    }else readyAt=0;
  },1000);
  setTimeout(()=>clearInterval(health),30000);
})();
