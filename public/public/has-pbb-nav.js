(() => {
 const dashboard=document.getElementById('has-dashboard-link');
 requireServiceLogin(user=>{const config=document.getElementById('has-config-button');if(config)config.hidden=String(user.email||'').trim().toLowerCase()!=='lake@mu.com';if(dashboard)dashboard.hidden=String(user.email||'').trim().toLowerCase()!=='lake@mu.com';});
})();
