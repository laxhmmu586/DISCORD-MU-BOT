(() => {
 const dashboard=document.getElementById('has-dashboard-link');
 requireServiceLogin(user=>{if(dashboard)dashboard.hidden=String(user.email||'').trim().toLowerCase()!=='lake@mu.com';});
})();
