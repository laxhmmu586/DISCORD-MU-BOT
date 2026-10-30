(function(root){
 const terminal=(station,gate)=>{if(station!=='LAX')return '';const match=/^(\d+)[A-Z]?$/.exec(String(gate||'').trim().toUpperCase());if(!match)return null;const n=Number(match[1]);return n>=201&&n<=225?'MSC':'TBIT';};
 const valid=(license,date)=>Boolean(license.id&&license.expiry&&license.expiry>=date);
 function certificate(row,name){return {terminal:name,id:name==='MSC'?row.pbbMscId||'':row.pbbId||'',expiry:name==='MSC'?row.pbbMscExpiry||'':row.pbbExpiry||''};}
 const all=row=>row.station==='LAX'?['TBIT','MSC'].map(name=>certificate(row,name)):[certificate(row,'')];
 const forGate=(row,gate)=>{const name=terminal(row.station,gate);return name===null?{terminal:null,id:'',expiry:''}:certificate(row,name);};
 const api={terminal,valid,all,forGate,any:(row,date)=>all(row).some(c=>valid(c,date))};
 if(typeof module==='object')module.exports=api;else root.pbbTerminalLicense=api;
})(typeof window==='object'?window:globalThis);
