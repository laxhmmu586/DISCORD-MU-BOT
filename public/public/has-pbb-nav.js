(() => {
 const dashboard=document.getElementById('has-dashboard-link');
 requireServiceLogin(async user=>{const config=document.getElementById('has-config-button');if(document.getElementById('has-view'))return;try{const context=await apiJson('/has-pbb-api/context');if(config)config.hidden=!context.canConfigure;if(dashboard)dashboard.hidden=!context.dashboard;}catch{if(config)config.hidden=!['lax@mu.com','lake@mu.com'].includes(String(user.email||'').trim().toLowerCase());if(dashboard)dashboard.hidden=!['lax@mu.com','lake@mu.com','nextweek1216@gmail.com','demo@hm.com'].includes(String(user.email||'').trim().toLowerCase());}});
})();
