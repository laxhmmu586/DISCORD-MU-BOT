// Transparent rings leave the space background visible through the center.
document.querySelectorAll('.status-metric').forEach((metric,index)=>{
 const lengths=[75,64,53];
 metric.insertAdjacentHTML('afterbegin',`<svg class="metric-rings" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-outline" cx="60" cy="60" r="58"/><circle class="ring-inner" cx="60" cy="60" r="46"/><circle class="ring-base" cx="60" cy="60" r="54"/><circle class="ring-light" cx="60" cy="60" r="54" pathLength="100" stroke-dasharray="${lengths[index]} 100" transform="rotate(-90 60 60)"/><circle class="ring-dot" cx="60" cy="6" r="3.2"/></svg>`);
});
// CSS runs the scanner; JS only measures geometry after layout/data changes.
const rail=document.querySelector('.timeline');
if(rail){
 const scanner=document.createElement('div');scanner.className='rail-scanner';scanner.setAttribute('aria-hidden','true');scanner.innerHTML='<i class="rail-meteor"></i>';rail.append(scanner);
 let layoutFrame=0;
 function measureRail(){
  layoutFrame=0;const nodes=[...rail.querySelectorAll('.node')].filter(n=>!n.hidden);if(!nodes.length){scanner.hidden=true;return;}
  scanner.hidden=false;rail.classList.remove('rail-ready');
  const first=nodes[0],last=nodes[nodes.length-1],gap=parseFloat(getComputedStyle(rail).columnGap)||18;
  const start=first.offsetLeft-gap/2,end=last.offsetLeft+last.offsetWidth+gap/2,distance=end-start;
  const railY=parseFloat(getComputedStyle(rail).getPropertyValue('--timeline-rail-y'))||first.offsetTop-28;
  rail.parentElement.style.setProperty('--rail-screen-y',(rail.offsetTop+railY-1)+'px');
  scanner.style.left=(start-3)+'px';scanner.style.top=(railY-10)+'px';scanner.style.width=distance+'px';scanner.style.setProperty('--rail-distance',distance+'px');
  requestAnimationFrame(()=>rail.classList.add('rail-ready'));
 }
 const schedule=()=>{if(!layoutFrame)layoutFrame=requestAnimationFrame(measureRail);};
 new ResizeObserver(schedule).observe(rail);
 new MutationObserver(schedule).observe(rail,{subtree:true,attributes:true,attributeFilter:['hidden','data-status']});
 schedule();
}
// Dismiss transient detail panels without affecting interactive controls.
function closeFlightOverlays(){
  document.querySelector('.node-card')?.classList.remove('is-open');
  document.querySelector('.details-panel')?.classList.remove('is-meal-open');
  const result=document.querySelector('.result-panel');
  if(result?.innerHTML){result.innerHTML='';result.className='result-panel';result.style.top='';result._passengerRows=[];}
  document.querySelectorAll('.passenger-modal-backdrop').forEach(modal=>modal.remove());
}
document.addEventListener('click',event=>{
  const target=event.target;
  // Keep acknowledgement, passenger drill-down, copying and input controls usable.
  if(target.closest('button,a,input,select,textarea,label,[role="button"],[contenteditable="true"]'))return;
  if(window.getSelection()?.toString())return;
  closeFlightOverlays();
},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeFlightOverlays();});
