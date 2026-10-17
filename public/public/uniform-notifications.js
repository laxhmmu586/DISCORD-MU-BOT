(()=>{
 const auth=window.firebase?.apps?.length&&firebase.auth();if(!auth)return;
 let user,checking=false,dialog;
 const seen=new Set();
 async function check(){
  if(!user||checking||document.visibilityState==='hidden'||location.pathname==='/uniform.html')return;checking=true;
  try{
   const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/uniform-api',{cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+await user.getIdToken()}});if(!response.ok)return;
   const data=await response.json();if(!Array.isArray(data.requests))return;
   const pending=data.requests.filter(r=>r.canReview&&!seen.has(user.uid+':'+r.id+':'+r.revision));if(!pending.length||dialog?.open)return;
   dialog ||= document.createElement('dialog');dialog.id='uniform-approval-reminder';dialog.setAttribute('aria-labelledby','uniform-reminder-title');dialog.className='flight-password';dialog.replaceChildren();
   const title=document.createElement('h2');title.id='uniform-reminder-title';title.textContent='Uniform approval required';const text=document.createElement('p');text.textContent=`${pending.length} uniform request${pending.length===1?' is':'s are'} waiting for your ${data.position} approval.`;dialog.append(title,text);
   for(const r of pending){const button=document.createElement('button');button.type='button';button.textContent=`Review ${r.employee.name} · ${r.date}`;button.style.cssText='display:block;width:100%;text-align:left;margin:10px 0;overflow-wrap:anywhere';button.onclick=()=>{dialog.close();location.assign('/uniform.html?request='+encodeURIComponent(r.id));};dialog.append(button);}
   const close=document.createElement('button');close.type='button';close.textContent='Later';close.onclick=()=>dialog.close();dialog.append(close);if(!dialog.isConnected)document.body.append(dialog);dialog.showModal();for(const r of pending)seen.add(user.uid+':'+r.id+':'+r.revision);
  }catch{/* A notification lookup must not interrupt sign-in or the current task. */}finally{checking=false;}
 }
 auth.onAuthStateChanged(value=>{user=value;if(!user){seen.clear();dialog?.close();}else check();});
 window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);setInterval(check,60000);
})();
