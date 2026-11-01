(() => {
 const button=document.querySelector('#enable-notifications');if(!button||!window.firebase?.apps?.length)return;
 const auth=firebase.auth();let messaging,token='',busy=false,stopping=false,syncJob=null;
 button.setAttribute('role','switch');button.setAttribute('aria-label','Notifications');
 button.innerHTML='<span>Notifications</span><span class="notification-switch-track" aria-hidden="true"><span class="notification-switch-thumb"></span></span>';
 const style=document.createElement('style');style.textContent='.login-menu #enable-notifications{display:flex;align-items:center;justify-content:space-between;gap:18px}.notification-switch-track{display:block;position:relative;flex:none;width:50px;height:28px;border-radius:99px;background:#f4f5f7;border:1px solid #cdd2d9;box-shadow:inset 0 1px 3px #0000000d;transition:background .15s}.notification-switch-thumb{position:absolute;top:4px;left:4px;width:18px;height:18px;border-radius:50%;background:#717780;transition:transform .15s,background .15s}.login-menu #enable-notifications[aria-checked="true"] .notification-switch-track{background:#7dceb2;border-color:#7dceb2}.login-menu #enable-notifications[aria-checked="true"] .notification-switch-thumb{background:#fff;transform:translateX(22px)}.login-menu #enable-notifications:disabled{opacity:.65;cursor:wait}.login-menu #enable-notifications:focus-visible{outline:2px solid #7dceb2;outline-offset:-3px}@media(prefers-reduced-motion:reduce){.notification-switch-track,.notification-switch-thumb{transition:none}}';document.head.append(style);
 const preferenceKey=()=>auth.currentUser?'mufc-push-enabled:'+auth.currentUser.uid:'';
 const optedOut=()=>{try{return localStorage.getItem(preferenceKey())==='false';}catch{return false;}};
 const savePreference=value=>{try{localStorage.setItem(preferenceKey(),String(value));}catch{}};
 const base=(window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'');
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 const supported=()=>window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
 const device=()=>{let id=localStorage.getItem('mufc-push-device');if(!id){id=crypto.randomUUID();localStorage.setItem('mufc-push-device',id);}return id;};
 async function api(path,body,user=auth.currentUser){if(!user)throw Error('Please sign in first.');const response=await fetch(base+'/notification-api/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save notification settings.');return result;}
 function label(){button.setAttribute('aria-checked',String(Boolean(token&&supported()&&Notification.permission==='granted'&&!optedOut())));button.disabled=busy;}
 function loadSDK(){if(firebase.messaging)return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js';script.onload=resolve;script.onerror=()=>reject(Error('Unable to load notifications. Please retry.'));document.head.append(script);});}
 function sync(enable=false){if(stopping||!enable&&optedOut())return Promise.resolve();if(syncJob)return syncJob;syncJob=register(enable).finally(()=>{syncJob=null;});return syncJob;}
 async function register(enable){
  const user=auth.currentUser;if(!user||!supported()||ios&&!standalone||Notification.permission!=='granted')return;
  if(!enable){const state=await api('device?deviceId='+encodeURIComponent(device()));if(stopping||auth.currentUser?.uid!==user.uid)return;if(state.registered&&!state.enabled){savePreference(false);token='';label();return;}}
  const config=await api('config');if(!config.configured)throw Error('Notifications are awaiting Firebase Web Push configuration.');
  await loadSDK();if(!await firebase.messaging.isSupported())throw Error('This browser does not support Web Push.');
  messaging||=firebase.messaging();const registration=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
  const next=await messaging.getToken({vapidKey:config.vapidKey,serviceWorkerRegistration:registration});if(!next)throw Error('Unable to register this device. Please retry.');
  if(stopping||auth.currentUser?.uid!==user.uid)return;
  await api('device',{deviceId:device(),token:next,platform:ios?'ios-pwa':navigator.platform,userAgent:navigator.userAgent},user);
  if(stopping||auth.currentUser?.uid!==user.uid){await api('device',{deviceId:device(),enabled:false},user);return;}
  token=next;savePreference(true);label();
 }
 const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='padding:0 18px;font-size:12px;line-height:1.5;max-width:270px';status.hidden=true;button.after(status);
 function tell(message){status.textContent=message;status.hidden=!message;}
 button.onclick=async()=>{
  if(busy)return;
  if(token){busy=true;label();tell('');try{await window.mufcDisablePush();}catch(error){tell(error.message);}finally{busy=false;label();}return;}
  if(ios&&!standalone){tell('如需在 iPhone 上接收 MUFC 通知，请先将 MUFC 添加到主屏幕。');return;}
  if(!supported()){tell('This browser does not support Web Push notifications.');return;}
  if(!auth.currentUser){tell('Please sign in first.');return;}
  if(Notification.permission==='denied'){tell('Notifications are blocked. Allow notifications in your browser’s site settings, then try again.');return;}
  busy=true;label();tell('');
  try{
   // Keep the permission request directly in the user's click, including on iOS.
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted'){tell(permission==='denied'?'Notifications are blocked. Change your browser’s site settings to enable them.':'Notifications were not enabled. You can try again later.');return;}
   await syncJob?.catch(()=>{});stopping=false;await sync(true);tell('');
  }catch(error){tell(error.message);}finally{busy=false;label();}
 };
 window.mufcDisablePush=async()=>{const user=auth.currentUser;if(!user)return;stopping=true;try{await syncJob?.catch(()=>{});const id=localStorage.getItem('mufc-push-device');if(id)await api('device',{deviceId:id,enabled:false},user);savePreference(false);token='';label();}catch(error){stopping=false;throw error;}};
 auth.onAuthStateChanged(user=>{stopping=false;token='';label();if(user)sync().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(()=>{});});
 window.addEventListener('storage',event=>{if(event.key!==preferenceKey())return;if(event.newValue==='false'){stopping=true;token='';label();}else{stopping=false;sync().catch(()=>{});}});
 label();
})();
