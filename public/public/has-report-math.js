(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.hasReportMath=factory();})(globalThis,()=>{
 const column=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),label=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
 function parse(formula){
  const source=formula.replace(/\$/g,'').replace(/^=/,'').trim().toUpperCase(),tokens=source.match(/#REF!|[A-Z]+\d+|[A-Z]+|\d*\.\d+|\d+|>=|<=|<>|[()+*/,:^%=<>-]/g)||[];
  if(!tokens.length||tokens.length>1000||tokens.join('')!==source.replace(/\s/g,''))throw Error('Unsupported formula. Use numbers, cell references and supported spreadsheet functions.');
  let i=0,depth=0;const expect=t=>{if(tokens[i++]!==t)throw Error('Complete the formula.');};
  function atom(){if(++depth>64)throw Error('Formula is too deeply nested.');const t=tokens[i++];let node;
   if(t==='#REF!')node={error:t};
   else if(t==='('){node=compare();expect(')');}
   else if(t==='+'||t==='-')node={op:'unary'+t,args:[atom()]};
   else if(/^[A-Z]+\d+$/.test(t||'')){node={ref:t};if(tokens[i]===':'){i++;const end=tokens[i++];if(!/^[A-Z]+\d+$/.test(end||''))throw Error('Complete the cell range.');node={range:[t,end]};}}
   else if(/^[A-Z]+$/.test(t||'')){if(!['SUM','AVERAGE','MIN','MAX','COUNT','ROUND','IF','IFERROR','ABS'].includes(t))throw Error('Unsupported spreadsheet function: '+t);expect('(');const args=[];if(tokens[i]!==')'){do{args.push(compare());}while(tokens[i]===','&&++i);}expect(')');node={op:t,args};}
   else if(/^\d*\.?\d+$/.test(t||''))node={value:+t};else throw Error('Complete the formula.');
   while(tokens[i]==='%'){i++;node={op:'%',args:[node]};}depth--;return node;
  }
  const power=()=>{let node=atom();if(tokens[i]==='^'){i++;node={op:'^',args:[node,power()]};}return node;};
  const product=()=>{let node=power();while(['*','/'].includes(tokens[i])){const op=tokens[i++];node={op,args:[node,power()]};}return node;};
  const sum=()=>{let node=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++];node={op,args:[node,product()]};}return node;};
  const compare=()=>{let node=sum();if(['=','<>','<','>','<=','>='].includes(tokens[i])){const op=tokens[i++];node={op,args:[node,sum()]};}return node;};
  const tree=compare();if(i!==tokens.length)throw Error('Complete the formula.');return tree;
 }
 function calculate(cells){
  const cache={},active=new Set();
  function number(address){if(Object.hasOwn(cache,address)){if(typeof cache[address]==='string')throw Error(cache[address]);return cache[address];}if(active.has(address)||active.size>128)throw Error('#REF!');const cell=cells[address];if(!cell?.formula){if(typeof cell?.value==='string'&&cell.value.startsWith('#'))throw Error(cell.value);return Number(cell?.value)||0;}
   active.add(address);try{const value=evaluate(parse(cell.formula));if(!Number.isFinite(value))throw Error('#NUM!');return cache[address]=value;}finally{active.delete(address);}
  }
  function evaluate(node){
   if(node.error)throw Error(node.error);
   if('value' in node)return node.value;if(node.ref)return number(node.ref);
   if(node.range){const a=node.range[0].match(/^([A-Z]+)(\d+)$/),b=node.range[1].match(/^([A-Z]+)(\d+)$/),r1=+a[2],r2=+b[2],c1=column(a[1]),c2=column(b[1]);if(r2<r1||c2<c1||(r2-r1+1)*(c2-c1+1)>10000)throw Error('Cell range is too large or reversed.');const values=[];for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++){const ref=label(c)+r,cell=cells[ref];values.push(cell?.formula||typeof cell?.value==='number'||typeof cell?.value==='string'&&cell.value.startsWith('#')?number(ref):null);}return values;}
   const args=node.args,op=node.op;
   if(op==='IF'){if(args.length!==3)throw Error('IF needs three arguments.');return evaluate(args[evaluate(args[0])?1:2]);}
   if(op==='IFERROR'){if(args.length!==2)throw Error('IFERROR needs two arguments.');try{return evaluate(args[0]);}catch(error){if(!error.message.startsWith('#'))throw error;return evaluate(args[1]);}}
   const values=args.map(evaluate),a=values[0],b=values[1];
   if(['SUM','AVERAGE','MIN','MAX','COUNT'].includes(op)){const flat=values.flatMap((value,i)=>Array.isArray(value)?value:args[i].ref&&!cells[args[i].ref]?.formula&&typeof cells[args[i].ref]?.value!=='number'?[]:[value]).filter(v=>typeof v==='number'&&Number.isFinite(v));if(op==='SUM')return flat.reduce((n,v)=>n+v,0);if(op==='COUNT')return flat.length;if(op==='AVERAGE'){if(!flat.length)throw Error('#DIV/0!');return flat.reduce((n,v)=>n+v,0)/flat.length;}return flat.length?Math[op.toLowerCase()](...flat):0;}
   if(values.some(Array.isArray))throw Error('#VALUE!');
   switch(op){case 'unary+':return a;case 'unary-':return -a;case '%':return a/100;case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':if(!b)throw Error('#DIV/0!');return a/b;case '^':return a**b;case '=':return +(a===b);case '<>':return +(a!==b);case '<':return +(a<b);case '>':return +(a>b);case '<=':return +(a<=b);case '>=':return +(a>=b);case 'ABS':return Math.abs(a);case 'ROUND':if(values.length!==2||!Number.isInteger(b)||Math.abs(b)>15)throw Error('ROUND needs a number and precision from -15 to 15.');return Math.sign(a)*Math.round((Math.abs(a)+Number.EPSILON)*10**b)/10**b;default:throw Error('Unsupported formula.');}
  }
  for(const [address,cell] of Object.entries(cells))if(cell.formula){try{number(address);}catch(error){if(error.message.startsWith('#'))cache[address]=error.message;else throw error;}}
  return cache;
 }
 function time(value){if(typeof value==='string'&&/^\d+(\.\d+)?$/.test(value))return time(Number(value));if(typeof value==='string'&&/^\d{1,2}:\d{2}$/.test(value)){const [h,m]=value.split(':').map(Number);return h<=23&&m<=59?(h*60+m)/1440:value;}if(typeof value==='number'&&value>1&&Number.isInteger(value)){const h=Math.floor(value/100),m=value%100;if(h<=23&&m<=59)return (h*60+m)/1440;}return value;}
 function setInput(cell,value){if(cell.formulaAllowed){if(typeof value==='string'&&value.startsWith('=')){parse(value);cell.formula=value.slice(1);}else delete cell.formula;}cell.value=cell.type==='time'&&!(typeof value==='string'&&value.startsWith('='))?time(value):value;return cell;}
 function format(value,cell={}){if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&cell.monthLabel)return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(value.slice(5,7))-1]+'-'+value.slice(2,4);if(typeof value!=='number')return String(value??'');const f=cell.numFmt||'';if(cell.type==='time'||/[hH].*:[mM]/.test(f)){const minutes=((Math.round(value*1440)%1440)+1440)%1440;return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}if(f.includes('%'))return (value*100).toFixed(1)+'%';if(f.includes('$'))return '$'+value.toFixed(2);if(f.includes('.00'))return value.toFixed(2);return String(Math.round(value*10**(cell.displayDecimals??4))/10**(cell.displayDecimals??4));}
 return {calculate,parse,setInput,format};
});
