(() => {
 const dashboard=document.getElementById('has-dashboard-link');
 requireServiceLogin(async user=>{const config=document.getElementById('has-config-button');if(document.getElementById('has-view'))return;try{const context=await apiJson('/has-pbb-api/context');if(config)config.hidden=!context.canConfigure;if(dashboard)dashboard.hidden=!context.dashboard;}catch{if(config)config.hidden=String(user.email||'').trim().toLowerCase()!=='lake@mu.com';if(dashboard)dashboard.hidden=!['lake@mu.com','demo@hm.com'].includes(String(user.email||'').trim().toLowerCase());}});
})();
