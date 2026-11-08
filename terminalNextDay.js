'use strict';
// Accept aggregate-only data from the already device-signed local send action.
function validate(value,flightNo,date) {
 if(!value||value.flightNo!==flightNo||value.flightDate!==date||!Array.isArray(value.reservationTicketed)||value.reservationTicketed.length!==4)return null;
 const count=n=>Number.isInteger(n)&&n>=0&&n<=2000;
 if(!value.reservationTicketed.slice(1).every(count)||!value.jcsy?.complete||!value.jcsy.paginationComplete||!Array.isArray(value.jcsy.rows)||!value.jcsy.rows.length||value.jcsy.rows.length>500)return null;
 const rows=[];for(const row of value.jcsy.rows){if(!row||!count(row.total))return null;rows.push({total:row.total,departure:String(row.departure||row.depart||'').slice(0,8),overnight:Boolean(row.overnight),isDomestic:Boolean(row.isDomestic),category:['overnight','pvgOnly','domestic','international'].includes(row.category)?row.category:'',market:row.market==='Domestic'?'Domestic':'International'});}
 return {flightNo,flightDate:date,reservationTicketed:value.reservationTicketed,jcsy:{complete:true,paginationComplete:true,rows}};
}
module.exports={validate};
