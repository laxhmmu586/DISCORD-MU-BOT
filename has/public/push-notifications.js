(() => {
 const button=document.querySelector('#enable-notifications');if(!button||!window.firebase?.apps?.length)return;
 const auth=firebase.auth();let messaging,token='',busy=false,stopping=false,syncJob=null;
 const base=(window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'');
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 const supported=()=>window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
 const device=()=>{let id=localStorage.getItem('mufc-push-device');if(!id){id=crypto.randomUUID();localStorage.setItem('mufc-push-device',id);}return id;};
 async function api(path,body,user=auth.currentUser){if(!user)throw Error('Please sign in first.');const response=await fetch(base+'/notification-api/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save notification settings.');return result;}
 function label(){button.textContent=token&&Notification.permission==='granted'?'Notifications Enabled':'Enable Notifications';button.disabled=busy;}
 function loadSDK(){if(firebase.messaging)return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js';script.onload=resolve;script.onerror=()=>reject(Error('Unable to load notifications. Please retry.'));document.head.append(script);});}
 function sync(){if(stopping)return Promise.resolve();if(syncJob)return syncJob;syncJob=register().finally(()=>{syncJob=null;});return syncJob;}
 async function register(){
  const user=auth.currentUser;if(!user||!supported()||ios&&!standalone||Notification.permission!=='granted')return;
  const config=await api('config');if(!config.configured)throw Error('Notifications are awaiting Firebase Web Push configuration.');
  await loadSDK();if(!await firebase.messaging.isSupported())throw Error('This browser does not support Web Push.');
  messaging||=firebase.messaging();const registration=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
  const next=await messaging.getToken({vapidKey:config.vapidKey,serviceWorkerRegistration:registration});if(!next)throw Error('Unable to register this device. Please retry.');
  if(stopping||auth.currentUser?.uid!==user.uid)return;
  await api('device',{deviceId:device(),token:next,platform:ios?'ios-pwa':navigator.platform,userAgent:navigator.userAgent},user);token=next;label();
 }
 const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='padding:0 18px;font-size:12px;line-height:1.5;max-width:270px';status.hidden=true;button.after(status);
 function tell(message){status.textContent=message;status.hidden=!message;}
 button.onclick=async()=>{
  if(busy)return;if(ios&&!standalone){tell('如需在 iPhone 上接收 MUFC 通知，请先将 MUFC 添加到主屏幕。');return;}
  if(!supported()){tell('This browser does not support Web Push notifications.');return;}
  if(!auth.currentUser){tell('Please sign in first.');return;}
  if(Notification.permission==='denied'){tell('Notifications are blocked. Allow notifications in your browser’s site settings, then try again.');return;}
  busy=true;label();tell('');
  try{
   // Keep the permission request directly in the user's click, including on iOS.
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted'){tell(permission==='denied'?'Notifications are blocked. Change your browser’s site settings to enable them.':'Notifications were not enabled. You can try again later.');return;}
   await sync();tell('');
  }catch(error){tell(error.message);}finally{busy=false;label();}
 };
 window.mufcDisablePush=async()=>{const user=auth.currentUser;if(!user)return;stopping=true;try{await syncJob?.catch(()=>{});const id=localStorage.getItem('mufc-push-device');if(id)await api('device',{deviceId:id,enabled:false},user);token='';label();}catch(error){stopping=false;throw error;}};
 auth.onAuthStateChanged(user=>{stopping=false;token='';label();if(user)sync().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(()=>{});});
 label();
})();
