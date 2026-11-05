const crypto=require('node:crypto');
function createSearchCache(parse,limit=8){
 const results=new Map();let previousLog,revision;
 return (log,query,context)=>{
  if(log!==previousLog){revision=crypto.createHash('sha256').update(log).digest('hex');previousLog=log;}
  const key=JSON.stringify([revision,query,context]);
  if(!results.has(key)){
   const parsed=parse(log,query,context);
   if(!parsed.sy)return parsed;
   results.set(key,structuredClone(parsed));
   if(results.size>limit)results.delete(results.keys().next().value);
  }
  return structuredClone(results.get(key));
 };
}
module.exports={createSearchCache};
