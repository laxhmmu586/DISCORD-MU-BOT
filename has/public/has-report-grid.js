(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.hasReportGrid=api;
})(globalThis,()=>{
 'use strict';
 const mime='application/x-has-report-cells';
 const column=n=>{let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
 function coordinate(address){const match=/^([A-Z]+)([1-9]\d*)$/.exec(address||'');if(!match)throw Error('Choose a report cell.');return {row:Number(match[2]),col:[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)};}
 const address=(row,col)=>column(col)+row;
 function bounds(range){const a=coordinate(range.anchor),b=coordinate(range.focus);return {top:Math.min(a.row,b.row),bottom:Math.max(a.row,b.row),left:Math.min(a.col,b.col),right:Math.max(a.col,b.col)};}
 function shiftFormula(value,from,to){
  if(typeof value!=='string'||!value.startsWith('='))return value;
  const a=coordinate(from),b=coordinate(to);
  return value.replace(/(\$?)([A-Z]+)(\$?)([1-9]\d*)\b/gi,(ref,fixedCol,col,fixedRow,row)=>{
   const c=coordinate(col.toUpperCase()+row).col+(fixedCol?0:b.col-a.col),r=Number(row)+(fixedRow?0:b.row-a.row);
   return c<1||r<1?'#REF!':fixedCol+column(c)+fixedRow+r;
  });
 }
 const quote=value=>/[\t\r\n"]/.test(String(value??''))?'"'+String(value??'').replace(/"/g,'""')+'"':String(value??'');
 function copy(model,range,format){
  const b=bounds(range),cells=[];
  for(let r=b.top;r<=b.bottom;r++){const row=[];for(let c=b.left;c<=b.right;c++){const a=address(r,c),cell=model.cells[a];row.push({address:a,value:cell?.editable?cell.value??'':format(a)});}cells.push(row);}
  return {text:cells.map(row=>row.map(cell=>quote(cell.value)).join('\t')).join('\n'),rich:JSON.stringify({kind:'has-report',version:1,cells})};
 }
 function planPaste(model,range,rows){
  if(!Array.isArray(rows)||!rows.length||!Array.isArray(rows[0])||!rows[0].length||rows.some(row=>!Array.isArray(row)||row.length!==rows[0].length))throw Error('Paste a rectangular block of cells.');
  const b=bounds(range),single=rows.length===1&&rows[0].length===1,height=single?b.bottom-b.top+1:rows.length,width=single?b.right-b.left+1:rows[0].length;
  if(height*width>10000||b.top+height-1>model.rows||b.left+width-1>model.columns)throw Error('The copied block does not fit in this report.');
  const changes={};
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
   const target=address(b.top+r,b.left+c),cell=model.cells[target],source=rows[single?0:r][single?0:c];
   if(!cell?.editable)throw Error('The block includes a read-only or merged cell ('+target+'). No cells were changed.');
   const rich=source&&typeof source==='object';let value=rich?source.value:source;
   if(!['string','number'].includes(typeof value))throw Error('The clipboard contains an invalid cell value.');
   if(rich&&source.address&&cell.formulaAllowed)value=shiftFormula(value,source.address,target);
   changes[target]=value;
  }
  return {changes,range:{anchor:address(b.top,b.left),focus:address(b.top+height-1,b.left+width-1)}};
 }
 function planFill(model,range,lastRow){
  const b=bounds(range);if(lastRow<=b.bottom)return {changes:{},range};
  if(lastRow>model.rows)throw Error('Fill within the existing report rows.');
  const changes={};
  for(let r=b.bottom+1;r<=lastRow;r++)for(let c=b.left;c<=b.right;c++){
   const from=address(b.top+(r-b.bottom-1)%(b.bottom-b.top+1),c),to=address(r,c),source=model.cells[from],target=model.cells[to];
   if(!source?.editable||!target?.editable)throw Error('Fill includes a read-only or merged cell. No cells were changed.');
   changes[to]=target.formulaAllowed?shiftFormula(source.value??'',from,to):source.value??'';
  }
  return {changes,range:{anchor:address(b.top,b.left),focus:address(lastRow,b.right)}};
 }
 function attach({editor,getModel,applyValues,format,onNotice=()=>{},isBusy=()=>false}){
  let range=null,drag=null,frame,lastCopy=null,typing=null,editing=false;
  const undo=[],redo=[],toolbar=document.createElement('div');toolbar.className='report-grid-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Report editing');toolbar.hidden=true;
  const buttons={};
  const handle=document.createElement('button');handle.type='button';handle.tabIndex=-1;handle.className='report-fill-handle';handle.title='Drag down to copy selected cells';handle.setAttribute('aria-label','Drag down to fill report cells');
  const input=a=>[...editor.querySelectorAll('[data-cell-input]')].find(el=>el.dataset.cellInput===a);
  const visible=el=>el&&el.getClientRects().length>0&&!el.disabled;
  const current=a=>getModel()?.cells[a]?.value??'';
  const selected=()=>range&&getModel()&&!isBusy()&&!editor.inert;
  function notice(error){onNotice(error.message||String(error));}
  function update(){toolbar.hidden=!getModel();for(const button of Object.values(buttons))button.disabled=!selected();buttons.undo.disabled=!getModel()||isBusy()||!undo.length;buttons.redo.disabled=!getModel()||isBusy()||!redo.length;}
  function paint(preview){
   const b=range?bounds(range):null,p=preview&&bounds(preview);
   for(const el of editor.querySelectorAll('[data-cell-input]')){
    const a=el.dataset.cellInput,{row,col}=coordinate(a),host=el.closest('td')||el.parentElement,inside=b&&row>=b.top&&row<=b.bottom&&col>=b.left&&col<=b.right;
    host.classList.toggle('report-grid-selected',Boolean(inside));host.classList.toggle('report-fill-preview',Boolean(p&&row>=p.top&&row<=p.bottom&&col>=p.left&&col<=p.right));
   }
   const end=b&&input(address(b.bottom,b.right)),host=visible(end)&&end.closest('td');if(host){if(handle.parentElement!==host)host.append(handle);}else handle.remove();
   update();
  }
  function focus(a){const next=input(a);if(!visible(next))return false;next.focus({preventScroll:true});if(next.type!=='date'&&typeof next.select==='function')next.select();next.scrollIntoView({block:'nearest',inline:'nearest'});return true;}
  function choose(a,extend=false){range={anchor:extend&&range?range.anchor:a,focus:a};typing=null;editing=false;paint();}
  function record(a,before,after){
   if(before===after)return;
   if(typing?.address===a&&undo.at(-1)===typing.entry){typing.entry.after[a]=after;}
   else{const entry={before:{[a]:before},after:{[a]:after}};undo.push(entry);typing={address:a,entry};if(undo.length>100)undo.shift();}
   redo.length=0;editing=true;update();
  }
  function apply(changes,nextRange=range){
   const before=Object.fromEntries(Object.keys(changes).map(a=>[a,current(a)]));
   applyValues(changes);const after=Object.fromEntries(Object.keys(changes).map(a=>[a,current(a)]));
   if(Object.keys(changes).some(a=>before[a]!==after[a])){undo.push({before,after});if(undo.length>100)undo.shift();redo.length=0;}
   typing=null;editing=false;range=nextRange;paint();
  }
  function travel(back){
   const source=back?undo:redo,target=back?redo:undo,entry=source.at(-1);if(!entry||isBusy()||!getModel())return;
   const expected=back?entry.after:entry.before,values=back?entry.before:entry.after;
   if(Object.entries(expected).some(([a,value])=>current(a)!==value))throw Error('These cells changed since this edit. Reload and review the report.');
   applyValues(values);source.pop();target.push(entry);typing=null;editing=false;paint();
  }
  function clear(){const b=bounds(range),values={};for(let r=b.top;r<=b.bottom;r++)for(let c=b.left;c<=b.right;c++){const a=address(r,c);if(getModel().cells[a]?.editable)values[a]='';}apply(values);}
  function fillDown(){const b=bounds(range);if(b.top===b.bottom){if(b.top===1)return;const source={anchor:address(b.top-1,b.left),focus:address(b.top-1,b.right)};const plan=planFill(getModel(),source,b.bottom);apply(plan.changes,range);}else{const source={anchor:address(b.top,b.left),focus:address(b.top,b.right)};apply(planFill(getModel(),source,b.bottom).changes,range);}}
  function copied(){return copy(getModel(),range,format);}
  function paste(text,rich=''){
   let rows;if(rich){try{const data=JSON.parse(rich);if(data.kind==='has-report'&&data.version===1)rows=data.cells;}catch{}}
   rows||=window.hasRechargeGrid.parseTSV(text);const plan=planPaste(getModel(),range,rows);apply(plan.changes,plan.range);onNotice(Object.keys(plan.changes).length+' cells pasted. Saving changes…');
  }
  const actions={undo:()=>travel(true),redo:()=>travel(false),copy:async()=>{lastCopy=copied();await navigator.clipboard.writeText(lastCopy.text);},paste:async()=>{const model=getModel(),selection=JSON.stringify(range),text=await navigator.clipboard.readText();if(model!==getModel()||selection!==JSON.stringify(range)||!selected())return;paste(text,lastCopy?.text===text?lastCopy.rich:'');},fill:fillDown,clear};
  for(const [key,label] of [['undo','Undo'],['redo','Redo'],['copy','Copy'],['paste','Paste'],['fill','Fill down'],['clear','Clear']]){
   const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(key==='undo'||key==='redo'||selected())Promise.resolve().then(actions[key]).catch(notice);};toolbar.append(button);buttons[key]=button;
  }
  const help=document.createElement('span');help.textContent='Tab → · Shift+Tab ← · Enter ↓ · Shift+click to select · Drag the corner to fill';toolbar.append(help);editor.before(toolbar);
  editor.addEventListener('focusin',event=>{const a=event.target.dataset.cellInput;if(a&&(!range||range.focus!==a)){choose(a);}});
  editor.addEventListener('dblclick',event=>{if(event.target.dataset.cellInput)editing=true;});
  editor.addEventListener('keydown',event=>{
   const a=event.target.dataset.cellInput;if(!a||!selected()||event.isComposing)return;
   const key=event.key,mod=event.ctrlKey||event.metaKey;
   try{
    if(mod&&['z','y'].includes(key.toLowerCase())){event.preventDefault();travel(key.toLowerCase()==='z'&&!event.shiftKey);return;}
    if(mod&&key.toLowerCase()==='d'){event.preventDefault();fillDown();return;}
    if(key==='F2'){editing=true;return;}
    if(key==='Escape'){editing=false;choose(a);return;}
    if(mod||event.altKey)return;
    if(event.target.tagName==='SELECT'&&key!=='Tab')return;
    if(['Delete','Backspace'].includes(key)&&range.anchor!==range.focus){event.preventDefault();clear();return;}
    const fields=[...editor.querySelectorAll('[data-cell-input]')].filter(visible),index=fields.indexOf(event.target),pos=coordinate(a);let next;
    if(key==='Tab')next=fields[index+(event.shiftKey?-1:1)];
    else if(key==='Enter'||!editing&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)){
     const vertical=key==='Enter'||key==='ArrowUp'||key==='ArrowDown',direction=key==='ArrowUp'||key==='ArrowLeft'||key==='Enter'&&event.shiftKey?-1:1;
     const candidates=fields.filter(el=>{const p=coordinate(el.dataset.cellInput);return vertical?p.col===pos.col&&(p.row-pos.row)*direction>0:p.row===pos.row&&(p.col-pos.col)*direction>0;});
     candidates.sort((x,y)=>{const p=coordinate(x.dataset.cellInput),q=coordinate(y.dataset.cellInput);return direction*(vertical?p.row-q.row:p.col-q.col);});next=candidates[0];
    }
    if(next){event.preventDefault();const anchor=range.anchor;focus(next.dataset.cellInput);range={anchor:event.shiftKey&&key.startsWith('Arrow')?anchor:next.dataset.cellInput,focus:next.dataset.cellInput};typing=null;editing=false;paint();}
    else if(key==='Enter')event.preventDefault();
   }catch(error){event.preventDefault();notice(error);}
  });
  editor.addEventListener('copy',event=>{
   if(!selected()||!event.clipboardData||editing&&range.anchor===range.focus&&event.target.selectionStart!==event.target.selectionEnd)return;
   try{lastCopy=copied();event.clipboardData.setData('text/plain',lastCopy.text);event.clipboardData.setData(mime,lastCopy.rich);event.preventDefault();}catch(error){notice(error);}
  });
  editor.addEventListener('paste',event=>{
   if(!selected()||!event.target.dataset.cellInput||!event.clipboardData)return;
   const text=event.clipboardData.getData('text/plain'),rich=event.clipboardData.getData(mime)||(lastCopy?.text===text?lastCopy.rich:'');
   if(!rich&&!/[\t\r\n]/.test(text)&&range.anchor===range.focus)return;
   event.preventDefault();try{paste(text,rich);}catch(error){notice(error);}
  });
  function cellAt(x,y){const el=document.elementFromPoint(x,y);return el?.closest('[data-cell-input]')?.dataset.cellInput||el?.closest('td')?.querySelector('[data-cell-input]')?.dataset.cellInput;}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=null;drag=null;paint();}
  function preview(){if(!drag)return;const a=cellAt(drag.x,drag.y);if(!a)return;if(drag.fill){const last=Math.max(bounds(drag.source).bottom,coordinate(a).row);if(last!==drag.last){drag.last=last;paint({anchor:drag.source.anchor,focus:address(drag.last,bounds(drag.source).right)});}}else if(a!==range.focus){range.focus=a;drag.moved=true;editing=false;window.getSelection()?.removeAllRanges();paint();}}
  function scroll(){if(!drag||!editor.isConnected){stop();return;}const rect=editor.getBoundingClientRect(),edge=28;if(drag.x>rect.right-edge)editor.scrollLeft+=16;else if(drag.x<rect.left+edge)editor.scrollLeft-=16;if(drag.y>rect.bottom-edge)editor.scrollTop+=12;else if(drag.y<rect.top+edge)editor.scrollTop-=12;preview();frame=requestAnimationFrame(scroll);}
  editor.addEventListener('pointerdown',event=>{
   if(!getModel()||isBusy()||editor.inert||event.button!==0||event.pointerType==='touch')return;
   if(event.target===handle&&range){event.preventDefault();drag={id:event.pointerId,fill:true,source:{...range},last:bounds(range).bottom,x:event.clientX,y:event.clientY};handle.setPointerCapture(event.pointerId);}
   else{const a=cellAt(event.clientX,event.clientY);if(!a)return;const anchor=event.shiftKey&&range?range.anchor:a;if(event.shiftKey){event.preventDefault();focus(a);}range={anchor,focus:a};typing=null;editing=false;paint();drag={id:event.pointerId,x:event.clientX,y:event.clientY};}
   frame=requestAnimationFrame(scroll);
  });
  document.addEventListener('pointermove',event=>{if(drag&&event.pointerId===drag.id){drag.x=event.clientX;drag.y=event.clientY;preview();if(drag.moved||drag.fill)event.preventDefault();}});
  document.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag.id)return;try{preview();if(drag.fill){const plan=planFill(getModel(),drag.source,drag.last);apply(plan.changes,plan.range);onNotice('Cells filled. Saving changes…');}}catch(error){notice(error);}finally{stop();}});
  document.addEventListener('pointercancel',()=>{if(drag)stop();});
  document.addEventListener('pointerdown',event=>{if(!editor.contains(event.target)&&!toolbar.contains(event.target)){range=null;typing=null;paint();}});
  return {record,update,reset(){stop();range=null;typing=null;editing=false;undo.length=0;redo.length=0;lastCopy=null;paint();}};
 }
 return {coordinate,bounds,shiftFormula,copy,planPaste,planFill,attach};
});
