(() => {
 const card=document.querySelector('.profile-report-panel');if(!card)return;
 const empty=document.getElementById('profile-report-empty');
 function update(context){
  let available=false;
  card.querySelectorAll('[data-report-access]').forEach(link=>{
   const kind=new URL(link.href,location.href).searchParams.get('kind');
   if(kind){link.hidden=context?.permissions?.[kind]!==true;available ||= !link.hidden;}
  });
  const all=card.querySelector('.panel-view-all');if(all)all.hidden=!available;
  empty.hidden=available;empty.textContent=context?.error||'No reports are available for your account.';
 }
 window.addEventListener('has-report-context',event=>update(event.detail));
 update(window.hasReportContext||{error:'Sign in to view available reports.'});
})();
