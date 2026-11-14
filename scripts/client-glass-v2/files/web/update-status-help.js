// Explain the existing safe-refresh rule without changing update permissions.
(()=>{
  if(!window.mufcDesktop)return;
  const explain=()=>document.querySelectorAll('.mufc-settings [data-update]').forEach(status=>{
    if(status.textContent.trim()==='Verified hotfix downloaded; waiting for a safe moment.')status.textContent='界面更新已下载。请关闭 Settings，回到“选择航班”或登录页，停留约30秒不操作，即可自动应用。';
  });
  const start=()=>{explain();new MutationObserver(explain).observe(document.body,{subtree:true,childList:true,characterData:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
