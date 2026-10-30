(()=>{
 const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 let loading=false;
 async function load(){if(loading)return;loading=true;
  await Promise.allSettled([
   peopleApi('/read-sign-api').then(data=>{$('profile-pending-sign').textContent=`${data.memos.filter(m=>['pending','overdue'].includes(m.myStatus)).length} pending items`;$('profile-signed-count').textContent=`${data.memos.filter(m=>m.myStatus==='signed').length} signed acknowledgments`;}).catch(()=>{$('profile-pending-sign').textContent='Open Read & Sign to load records';}),
   peopleApi('/attendance-api/history').then(data=>{
    const today=attendanceOverview.today();
    attendanceOverview.create($('profile-month-mini'),{records:data.records,month:today.slice(0,7),onSelect:month=>location.assign('/attendance.html?month='+month+'#attendance-records'),onYearChange:updateCount});
    function updateCount(year){const rows=data.records.filter(r=>String(r.date).startsWith(year+'-'));$('profile-monthly-count').textContent=`${year} · ${rows.filter(r=>r.type==='sick').length} Call Off / Sick · ${rows.filter(r=>r.type==='late').length} Coming Late`;}
    updateCount(Number(today.slice(0,4)));

   }).catch(()=>{$('profile-monthly-count').textContent='Unable to load attendance. Open View All to retry.';})
  ]);loading=false;
 }
 window.addEventListener('employee-profile-updated',load);
})();
