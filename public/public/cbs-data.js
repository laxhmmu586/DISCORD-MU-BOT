/* CBS lists use a tab-scoped cache and one small shared revision check. */
(()=>{
 const original=window.fetch.bind(window),base=(window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,''),key='cbs-data-v2:'+base;
 const moduleFor=key=>{const url=new URL(key,base),view=url.searchParams.get('view')||'open';return url.pathname==='/cbs-cases'?(view==='shipment'?'shipment':'passenger:'+view):url.pathname==='/cbs-unresolved-baggage'?(view==='shipment'?'shipment':(url.searchParams.get('group')||'on-hand')+':'+view):url.pathname==='/cbs-worldtracer-cases'?'rush':url.pathname==='/cbs-missing-bags'?'missing':null;};
 const resource=url=>{const copy=new URL(url);copy.searchParams.delete('refresh');copy.searchParams.sort();return copy.pathname+copy.search;};
 const lists=new Set(['/cbs-cases','/cbs-missing-bags','/cbs-unresolved-baggage','/cbs-worldtracer-cases']);
 let saved={revision:null,rows:{},at:Date.now()},checking=null,writing=0,overlay,pending=new Map(),generation=0;
 try{const value=JSON.parse(sessionStorage.getItem(key));if(value&&Date.now()-value.at<2*60*60*1000)saved=value;}catch{}
 function persist(){saved.at=Date.now();try{sessionStorage.setItem(key,JSON.stringify(saved));}catch{}}
 function invalidate(modules){generation++;if(!modules)saved.rows={};else for(const key of Object.keys(saved.rows))if(modules.includes(moduleFor(key)))delete saved.rows[key];persist();}
 function changed(modules){const event=new Event('cbs-data-changed');event.modules=modules;window.dispatchEvent(event);}
 async function check(announce=true){
  if(document.hidden)return;if(checking)return checking;
  checking=(async()=>{try{const response=await original(base+'/cbs-revision',{cache:'no-store'});if(!response.ok)throw Error('Revision unavailable');const data=await response.json(),previous=saved.revision;const modules=data.modules&&saved.modules?Object.keys(data.modules).filter(name=>data.modules[name]!==saved.modules[name]):null;saved.revision=data.revision;saved.modules=data.modules;saved.summary=data.summary;if(previous!==null&&previous!==data.revision){invalidate(modules);if(announce)changed(modules);}persist();const current=new Event('cbs-data-current');current.summary=data.summary;window.dispatchEvent(current);return true;}catch{window.dispatchEvent(new Event('cbs-data-offline'));return false;}finally{checking=null;}})();return checking;
 }
 function wait(show){
  if(show&&!overlay){overlay=document.createElement('dialog');overlay.className='cbs-saving-dialog';overlay.setAttribute('aria-label','Submitting');overlay.innerHTML='<div class="cbs-saving-spinner" aria-hidden="true"></div><h2>Submitting</h2><p role="status">Please wait. Do not submit again.</p>';overlay.addEventListener('cancel',event=>event.preventDefault());const style=document.createElement('style');style.textContent='.cbs-saving-dialog{border:1px solid #dce8f8;border-radius:24px;padding:32px;width:min(340px,calc(100vw - 48px));text-align:center;background:#f4f8ff;color:#214773;box-shadow:0 20px 80px #17375a33}.cbs-saving-dialog::backdrop{background:#36577955;backdrop-filter:blur(5px)}.cbs-saving-dialog h2{font:600 20px Arial}.cbs-saving-dialog p{font:14px/1.6 Arial}.cbs-saving-spinner{margin:auto;width:36px;height:36px;border:3px solid #d7e6fa;border-top-color:#4386d1;border-radius:50%;animation:cbs-spin .9s linear infinite}@keyframes cbs-spin{to{transform:rotate(360deg)}}';document.head.append(style);document.body.append(overlay);}
  if(show&&!overlay.open)overlay.showModal();else if(!show&&overlay?.open)overlay.close();
 }
 window.cbsDataCache={get summary(){return saved.summary;},has:path=>Boolean(saved.rows[resource(new URL(path,base))]),invalidate,check};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href),method=(options.method||input.method||'GET').toUpperCase();
  if(url.origin!==new URL(base).origin)return original(input,options);
  const path=url.pathname,cacheKey=resource(url),isList=method==='GET'&&lists.has(path),mutation=method!=='GET'&&/^\/(cbs-|wrong-baggage-submissions|contact-form-submissions|test-baggage)/.test(path);
  const background=path==='/cbs-record-sync'||path==='/cbs-missing-bags/sync';
  if(isList){
   if(!url.searchParams.has('refresh')&&saved.rows[cacheKey])return new Response(saved.rows[cacheKey],{headers:{'Content-Type':'application/json'}});
   if(pending.has(cacheKey))return (await pending.get(cacheKey)).clone();
   const run=generation,request=(async()=>{const response=await original(input,options);if(response.ok){const text=await response.clone().text();if(run===generation){saved.rows[cacheKey]=text;persist();}}return response;})();pending.set(cacheKey,request);
   try{return (await request).clone();}finally{pending.delete(cacheKey);}
  }
  if(mutation&&!background){writing++;wait(true);}
  try{const response=await original(input,options);if(mutation&&response.ok){if(checking)await checking;if(!await check(false))invalidate();}return response;}
  finally{if(mutation&&!background){writing--;if(!writing)wait(false);}}
 };
 window.addEventListener('pageshow',()=>void check());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 setInterval(()=>void check(),60000);
})();
