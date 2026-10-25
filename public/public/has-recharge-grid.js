(function(root){
 'use strict';
 function parseTSV(text){
  const rows=[[]];let value='',quoted=false;
  for(let i=0;i<text.length;i++){
   const ch=text[i];
   if(ch==='"'&&(quoted||value==='')){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
   else if(!quoted&&(ch==='\t'||ch==='\r'||ch==='\n')){rows.at(-1).push(value);value='';if(ch!=='\t'){if(ch==='\r'&&text[i+1]==='\n')i++;rows.push([]);}}
   else value+=ch;
  }
  if(quoted)throw Error('The copied cells contain an unfinished quoted value.');
  rows.at(-1).push(value);if(rows.length>1&&rows.at(-1).length===1&&rows.at(-1)[0]==='')rows.pop();return rows;
 }
 function coordinate(address){const m=/^([A-N])(2[3-9]|[3-5][0-9])$/.exec(address||'');return m?{column:m[1].charCodeAt(0)-65,row:+m[2]}:null;}
 const address=(column,row)=>String.fromCharCode(65+column)+row;
 function planPaste(start,text){
  const origin=coordinate(start);if(!origin)throw Error('Choose a cell in the daily charge table.');
  const rows=parseTSV(text),changes=[];
  for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){
   const column=origin.column+c,row=origin.row+r;if(row>59||column>13)throw Error('The copied cells exceed the daily form. Paste within the 37 name rows and available columns.');
   let value=rows[r][c];
   if(column>=1&&column<=12&&value.trim()!==''){
    value=value.trim();if(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value))value=value.replace(/,/g,'');
    if(!/^(?:\d+\.?\d*|\.\d+)$/.test(value)||Number(value)>10000||Math.abs(Number(value)*100-Math.round(Number(value)*100))>1e-7)throw Error('Hours must be non-negative numbers with up to two decimals. No cells were pasted.');
   }
   changes.push({address:address(column,row),value});
  }
  return changes;
 }
 function attach({table,inputs,onNotice=()=>{}}){
  const handle=document.createElement('button');handle.type='button';handle.className='recharge-fill-handle';handle.title='Drag down to copy this cell';handle.setAttribute('aria-label','Drag down to fill cells');
  let active,drag,frame;
  const cells=Object.keys(inputs).filter(coordinate);
  function clearPreview(){for(const a of cells)inputs[a].parentElement.classList.remove('recharge-fill-preview');}
  function select(input){if(!coordinate(input?.dataset.rechargeCell)||drag)return;active?.parentElement.classList.remove('recharge-grid-active');active=input;active.parentElement.classList.add('recharge-grid-active');active.parentElement.append(handle);}
  function apply(changes){for(const change of changes)inputs[change.address].value=change.value;for(const change of changes)inputs[change.address].dispatchEvent(new Event('input',{bubbles:true}));onNotice(changes.length+' cells updated.');}
  table.addEventListener('focusin',e=>{if(e.target.dataset.rechargeCell)select(e.target);});
  table.addEventListener('paste',e=>{
   if(!coordinate(e.target.dataset.rechargeCell))return;const text=e.clipboardData?.getData('text/plain');if(!text||!/[\t\r\n]/.test(text))return;
   e.preventDefault();try{apply(planPaste(e.target.dataset.rechargeCell,text));}catch(error){onNotice(error.message);}
  });
  table.addEventListener('keydown',e=>{
   const pos=coordinate(e.target.dataset.rechargeCell);if(!pos)return;
   if(e.key==='Enter'&&!e.isComposing){e.preventDefault();const row=pos.row+(e.shiftKey?-1:1);if(row>=23&&row<=59){const next=inputs[address(pos.column,row)];next.focus();next.select();}return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&pos.row>23){e.preventDefault();apply([{address:address(pos.column,pos.row),value:inputs[address(pos.column,pos.row-1)].value}]);}
  });
  function stop(){cancelAnimationFrame(frame);frame=null;clearPreview();drag=null;}
  function finish(e){if(!drag||e.pointerId!==drag.id)return;const current=drag;if(current.last>current.row){const changes=[];for(let row=current.row+1;row<=current.last;row++)changes.push({address:address(current.column,row),value:current.value});apply(changes);}stop();}
  function target(e){
   if(!drag||e.pointerId!==drag.id)return;drag.x=e.clientX;drag.y=e.clientY;
   const td=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-form-cell]'),pos=coordinate(td?.dataset.formCell);
   if(pos){drag.last=Math.max(drag.row,pos.row);clearPreview();for(let r=drag.row+1;r<=drag.last;r++)inputs[address(drag.column,r)].parentElement.classList.add('recharge-fill-preview');}
  }
  function scroll(){if(!drag)return;if(!table.isConnected){stop();return;}const scroller=table.closest('dialog'),rect=scroller?.getBoundingClientRect();if(rect){const top=rect.top+45,bottom=rect.bottom-45;if(drag.y<top)scroller.scrollTop-=12;else if(drag.y>bottom)scroller.scrollTop+=12;target({pointerId:drag.id,clientX:drag.x,clientY:drag.y});}frame=requestAnimationFrame(scroll);}
  handle.addEventListener('pointerdown',e=>{if(!active||e.button!==0)return;e.preventDefault();const pos=coordinate(active.dataset.rechargeCell);drag={...pos,last:pos.row,value:active.value,id:e.pointerId,x:e.clientX,y:e.clientY};table.closest('dialog')?.addEventListener('close',stop,{once:true});handle.setPointerCapture(e.pointerId);frame=requestAnimationFrame(scroll);});
  handle.addEventListener('pointermove',target);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',stop);handle.addEventListener('lostpointercapture',()=>{if(drag)stop();});
  table.closest('dialog')?.addEventListener('close',stop,{once:true});
  return {stop};
 }
 const api={parseTSV,planPaste,attach};if(typeof module==='object'&&module.exports)module.exports=api;else root.hasRechargeGrid=api;
})(typeof window==='object'?window:globalThis);
