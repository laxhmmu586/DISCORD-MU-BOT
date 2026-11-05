const {calculate,setInput,isError}=require('../public/has-report-math');
const addresses=Array.from({length:6},(_,i)=>'C'+(i+5));
function createHoursTemplate({template,read,apply}){
 return async function scopedTemplate(kind,month,scope,extraRows,cache=new Map()){
  const model=await template(kind,month,scope,extraRows);
  if(kind!=='wwh')return model;
  const saved=read(scope,kind,month),active=addresses.filter(a=>model.cells['B'+a.slice(1)]?.value);
  if(month>'2026-01'&&active.some(a=>!Object.hasOwn(saved.values,a))){
   const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);const previous=date.toISOString().slice(0,7);
   if(!cache.has(previous))cache.set(previous,scopedTemplate(kind,previous,scope,undefined,cache));
   const source=await cache.get(previous);apply(source,read(scope,kind,previous).values,true);
   const results=calculate(source.cells),value=a=>source.cells[a]?.formula?results[a]:source.cells[a]?.value;
   const last=addresses.filter(a=>source.cells['B'+a.slice(1)]?.value&&value(a)!==''&&!isError(value(a))).at(-1);
   for(const address of active)if(!Object.hasOwn(saved.values,address)){
    const from=source.cells['B'+address.slice(1)]?.value?address:last,v=from&&value(from);
    if(v!==undefined&&v!==''&&!isError(v))setInput(model.cells[address],v);
   }
  }
  for(const address of addresses)if(!active.includes(address)&&!Object.hasOwn(saved.values,address))setInput(model.cells[address],'');
  return model;
 };
}
function hoursValues(model){return model.kind==='wwh'?Object.fromEntries(addresses.map(a=>[a,model.cells[a].value])):{};}
module.exports={createHoursTemplate,hoursValues};
