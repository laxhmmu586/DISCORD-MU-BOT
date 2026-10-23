(() => {
 const dashboard=document.getElementById('has-dashboard-link');
 requireServiceLogin(async user=>{const config=document.getElementById('has-config-button');if(config&&!document.getElementById('has-view')){try{config.hidden=!(await apiJson('/has-pbb-api/context')).canConfigure;}catch{config.hidden=String(user.email||'').trim().toLowerCase()!=='lake@mu.com';}}if(dashboard)dashboard.hidden=!['lake@mu.com','demo@hm.com'].includes(String(user.email||'').trim().toLowerCase());});
})();
