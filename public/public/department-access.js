(() => {
 if(window.departmentAccessStarted)return;window.departmentAccessStarted=true;
 let auth=null,generation=0;
 const hr=()=>document.querySelectorAll('.top-nav [data-department="hr"]');
 const finance=()=>document.querySelectorAll('.top-nav [data-department="finance"]');
 function setAccess(canHr,canFinance){for(const link of hr()){link.setAttribute('aria-disabled',String(!canHr));link.tabIndex=canHr?0:-1;if(canHr)link.setAttribute('href',link.dataset.departmentHref||'/hr');else link.removeAttribute('href');}for(const menu of finance()){menu.inert=!canFinance;menu.setAttribute('aria-disabled',String(!canFinance));const summary=menu.querySelector('summary');summary?.setAttribute('aria-disabled',String(!canFinance));if(summary)summary.tabIndex=canFinance?0:-1;if(!canFinance)menu.open=false;}}
 document.addEventListener('click',event=>{if(event.target.closest('.top-nav [aria-disabled="true"]')){event.preventDefault();event.stopImmediatePropagation();}},true);
 async function refresh(){const run=++generation;setAccess(false,false);const user=auth?.currentUser;if(!user)return;try{const token=await user.getIdToken(),headers={...(window.workspaceHeaders?.()||{}),Authorization:'Bearer '+token};const read=async path=>{const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+path,{cache:'no-store',headers,signal:AbortSignal.timeout(15000)});return response.ok?response.json():null;};const results=await Promise.allSettled([read('/employee-admin-api/access'),read('/has-report-api/context')]);if(run!==generation||auth.currentUser!==user)return;const hrData=results[0].status==='fulfilled'?results[0].value:null,report=results[1].status==='fulfilled'?results[1].value:null;setAccess(hrData?.canAccess===true,report?.canDashboard===true||Object.values(report?.permissions||{}).some(value=>value===true));}catch{if(run===generation)setAccess(false,false);}}
 function start(){setAccess(false,false);if(window.firebase?.apps?.length&&typeof firebase.auth==='function'){auth=firebase.auth();auth.onAuthStateChanged(refresh);}}
 window.addEventListener('workspace-profile',()=>{if(auth)refresh();});
 if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
 setAccess(false,false);
})();
