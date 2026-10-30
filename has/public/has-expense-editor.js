(() => {
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 window.renderHasExpense=({model,inputFor,format})=>{
  const root=el('div',undefined,'expense-editor');
  root.append(el('h2','Expense Report'),el('p',model.scope.station+' / '+model.scope.account+' · '+model.month,'expense-period'));
  function control(address,label){
   const cell=model.cells[address];if(!cell)return el('span');
   if(cell.editable){if(['A4','F4','H4','J4','G7','J7','A77','E77','G77'].includes(address))cell.multiline=false;const input=inputFor(address,cell);input.setAttribute('aria-label',label);if(cell.formulaAllowed)input.inputMode='decimal';if(['F4','H4','J4'].includes(address)&&(!cell.value||/^\d{4}-\d{2}-\d{2}$/.test(cell.value)))input.type='date';return input;}
   const output=el('output',format(address));if(cell.formula)output.dataset.formula=address;return output;
  }
  function fields(parent,items){const grid=el('div',undefined,'expense-fields');for(const [address,label] of items){const field=el('label');field.append(el('span',label),control(address,label));grid.append(field);}parent.append(grid);}
  const info=el('section',undefined,'expense-section');info.append(el('h3','Report details'));
  fields(info,[['A4','Name / title / department'],['F4','Report date'],['H4','Period from'],['J4','Period to'],['A7','Department or account / reason'],['G7','Company expense'],['J7','Credit rebill']]);root.append(info);
  function section(title,from,to,columns,totals=[],open=false){
   const section=el('details',undefined,'expense-section'),summary=el('summary',title);section.open=open||Array.from({length:to-from+1},(_,i)=>from+i).some(r=>columns.some(([c])=>model.cells[c+r]?.editable&&model.cells[c+r].value!==''));section.append(summary);
   const wrap=el('div',undefined,'expense-table-wrap'),table=el('table',undefined,'expense-table'),head=el('thead'),header=el('tr'),body=el('tbody');
   const colgroup=el('colgroup');let width=0;for(const [,label] of columns){const col=el('col'),size=/details|purpose|reason/i.test(label)?260:label==='Hotel'?160:110;col.style.width=size+'px';width+=size;colgroup.append(col);header.append(el('th',label));}table.style.minWidth=width+'px';head.append(header);table.append(colgroup,head,body);wrap.append(table);section.append(wrap);
   const rows=[];
   for(let r=from;r<=to;r++){
    const row=el('tr');let populated=false;
    for(const [column,label] of columns){const address=column+r,cell=model.cells[address],td=el('td');td.dataset.label=label;if(cell){td.className=cell.editable?'expense-entry':'expense-result';td.append(control(address,label+' · line '+(r-from+1)));if(cell.editable&&cell.value!=='')populated=true;}row.append(td);}
    row.hidden=r>=from+2&&!populated;rows.push(row);body.append(row);
   }
   const add=el('button','+ Add line','expense-add-line');add.type='button';add.onclick=()=>{const row=rows.find(r=>r.hidden);if(row){row.hidden=false;row.querySelector('input,textarea')?.focus();}add.hidden=rows.every(r=>!r.hidden);};add.hidden=rows.every(r=>!r.hidden);section.append(add);
   if(totals.length){const footer=el('div',undefined,'expense-subtotals');for(const [address,label] of totals){const item=el('span');item.append(el('span',label),control(address,label));footer.append(item);}section.append(footer);}
   root.append(section);return section;
  }
  section('Cash advance',10,11,[['A','Date'],['C','Reason'],['G','Amount']]);
  section('Travel & transportation',14,21,[['A','From'],['B','To'],['C','Date / time'],['E','Purpose / transportation / miles'],['I','Local amount'],['J','Company card'],['K','Cash']],[['I22','Total'],['J22','Company card'],['K22','Cash']]);
  section('Personal meals',26,35,[['A','Date'],['B','Breakfast'],['C','Lunch'],['D','Dinner'],['E','Tel / sundry'],['F','Daily total'],['G','Foreign currency'],['H','Exchange rate'],['I','Local amount'],['J','Company card'],['K','Cash']],[['I36','Total'],['J36','Company card'],['K36','Cash']]);
  section('Hotel',40,43,[['A','City'],['B','Hotel'],['D','Days'],['E','Daily rate'],['F','Foreign currency'],['G','Exchange rate'],['H','Local amount'],['I','Company card'],['J','Cash']],[['H44','Total'],['I44','Company card'],['J44','Cash']]);
  section('Other expenses',48,65,[['A','Details / business purpose'],['F','Foreign currency'],['G','Exchange rate'],['H','Local amount'],['I','Company card'],['J','Cash']],[['H66','Total'],['I66','Company card'],['J66','Cash']],true);
  // Keep any previously entered values in the template's irregular spare
  // cells reachable without making empty spreadsheet artifacts into fields.
  const used=new Set([...root.querySelectorAll('[data-cell-input]')].map(n=>n.dataset.cellInput));
  const extra=Object.entries(model.cells).filter(([a,c])=>c.editable&&!used.has(a)&&c.value!==''&&!['J74','A77','E77','G77'].includes(a));
  if(extra.length){const legacy=el('details',undefined,'expense-section');legacy.append(el('summary','Additional saved entries'));fields(legacy,extra.map(([a])=>[a,'Additional entry '+a]));root.append(legacy);}
  const total=el('section',undefined,'expense-section expense-summary');total.append(el('h3','Totals & balance'));
  const totals=el('div',undefined,'expense-total-grid');for(const [address,label] of [['H68','Total expenses'],['I68','Company card'],['J68','Cash expenses'],['J70','Travel advance'],['J72','Due to employee'],['J74','Due to company']]){const item=el('label');item.append(el('span',label),control(address,label));totals.append(item);}total.append(totals);root.append(total);
  const signatures=el('section',undefined,'expense-section');signatures.append(el('h3','Signatures'));fields(signatures,[['A77','Signature'],['E77','Approved by'],['G77','Signature and date']]);root.append(signatures);
  return root;
 };
})();
