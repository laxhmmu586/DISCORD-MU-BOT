(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.hasReportMath=factory();})(globalThis,()=>{
 // The supplied workbook uses arithmetic, cell references and SUM only.
 function calculate(cells){
  const cache={},active=new Set();
  const number=address=>{
   if(address in cache){if(typeof cache[address]==='string')throw Error(cache[address]);return cache[address];}
   if(active.has(address))throw Error('Circular formula: '+address);
   const cell=cells[address];if(!cell?.formula)return Number(cell?.value)||0;
   active.add(address);const value=evaluate(cell.formula);active.delete(address);return cache[address]=value;
  };
  function evaluate(formula){
   const source=formula.replace(/\$/g,'').trim().toUpperCase(),tokens=source.match(/SUM|[A-Z]+\d+|\d*\.\d+|\d+|[()+*/,:-]/g)||[];
   if(tokens.join('')!==source.replace(/\s/g,''))throw Error('Unsupported formula: '+formula);
   let i=0;
   const expect=t=>{if(tokens[i++]!==t)throw Error('Invalid formula: '+formula);};
   const atom=()=>{const t=tokens[i++];if(t==='('){const v=sum();expect(')');return v;}if(t==='-')return -atom();if(t==='+')return atom();
    if(t==='SUM'){expect('(');let v=0;do{if(tokens[i+1]===':'){const first=tokens[i++];i++;const last=tokens[i++];const a=first.match(/^([A-Z]+)(\d+)$/),b=last?.match(/^([A-Z]+)(\d+)$/);if(!a||!b)throw Error('Invalid range');const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);const label=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};for(let r=+a[2];r<=+b[2];r++)for(let c=col(a[1]);c<=col(b[1]);c++)v+=number(label(c)+r);}else v+=sum();}while(tokens[i]===','&&++i);expect(')');return v;}
    if(/^[A-Z]+\d+$/.test(t||''))return number(t);if(!/^\d*\.?\d+$/.test(t||''))throw Error('Invalid formula');return +t;
   };
   const product=()=>{let v=atom();while(['*','/'].includes(tokens[i])){const op=tokens[i++],right=atom();v=op==='*'?v*right:v/right;}return v;};
   const sum=()=>{let v=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++],right=product();v=op==='+'?v+right:v-right;}return v;};
   const value=sum();if(i!==tokens.length)throw Error('Invalid formula result');if(!Number.isFinite(value))throw Error('#DIV/0!');return value;
  }
  Object.keys(cells).filter(a=>cells[a].formula).forEach(a=>{try{number(a);}catch(e){if(e.message.startsWith('#')){cache[a]=e.message;active.clear();}else throw e;}});return cache;
 }
 return {calculate};
});
