(() => {
 if(!window.mufcDesktop?.openHasWorkspace)return;
 const bindAuth=()=>window.firebase?.auth?.().onAuthStateChanged(user=>{if(!user)void window.mufcDesktop.closeHasWorkspaces();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindAuth,{once:true});else bindAuth();
 const open=async destination=>{
  const user=window.firebase?.auth?.().currentUser;
  if(!user)throw Error('Sign in to MUFC first.');
  await window.mufcDesktop.openHasWorkspace({destination,token:await user.getIdToken()});
 };
 document.addEventListener('click',event=>{
  const link=event.target.closest('a');if(!link)return;
  const href=link.getAttribute('href')||'';
  const destination=link.hasAttribute('data-open-shared-da')||['/report.html','/has-report.html','https://has-station.com/has-report'].includes(href)?'da':link.matches('.flight-pbb-link,[data-mobile-service="jetbridge"]')||['/has-pbb.html','https://has-station.com/has-pbb.html'].includes(href)?'pbb':null;
  if(!destination)return;event.preventDefault();event.stopImmediatePropagation();
  void open(destination).catch(error=>{const status=document.getElementById('report-status')||document.getElementById('flight-status');if(status){status.hidden=false;status.textContent=error.message;}else alert(error.message);});
 },true);
})();
