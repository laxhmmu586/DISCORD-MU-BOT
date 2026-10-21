(function(root){
 function status(expiry,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry||''))return '';
  if(expiry<today)return 'expired';
  const [year,month,day]=today.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const nextMonth=new Date(Date.UTC(year,month,Math.min(day,lastDay))).toISOString().slice(0,10);
  return expiry<nextMonth?'warning':'';
 }
 if(typeof module==='object')module.exports=status;else root.pbbQualificationStatus=status;
})(typeof window==='object'?window:globalThis);
