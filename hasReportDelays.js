const {calculate}=require('./public/public/has-report-math');
function minutes(value){
 if(typeof value==='string')value=value.trim();
 if(value==null||value==='')return null;
 if(typeof value==='string'&&/^\d{1,2}:\d{2}$/.test(value)){const [h,m]=value.split(':').map(Number);return h<=24&&m<60&&(h!==24||m===0)?h*60+m:null;}
 const n=Number(value);if(!Number.isFinite(n)||n<0)return null;if(n<=1)return Math.round(n*1440)%1440;
 if(!Number.isInteger(n))return null;const h=Math.floor(n/100),m=n%100;return h<=24&&m<60&&(h!==24||m===0)?h*60+m:null;
}
function flightDelays(model){
 const values=calculate(model.cells),summary=()=>({under30:0,from30to59:0,atLeast60:0,total:0,evaluated:0}),result={arrival:summary(),departure:summary()};
 for(const day of model.days)for(let row=day.start;row<=day.end;row++)for(const [kind,scheduled,actual] of [['arrival','E','F'],['departure','G','H']]){
  const read=column=>{const address=column+row,cell=model.cells[address];return minutes(cell?.formula?values[address]:cell?.value);},start=read(scheduled),end=read(actual);if(start===null||end===null)continue;
  // DA has clock times without a separate actual-date field. A backward jump
  // exceeding twelve hours is treated as a midnight rollover; small backward
  // differences remain early arrivals/departures.
  const totals=result[kind];totals.evaluated++;let delay=end-start;if(delay< -720)delay+=1440;if(delay<=0)continue;
  totals.total++;totals[delay<30?'under30':delay<60?'from30to59':'atLeast60']++;
 }
 return result;
}
module.exports={flightDelays};
