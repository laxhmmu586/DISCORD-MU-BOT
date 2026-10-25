const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const weekdays=['SUN','MON','TUE','WED','THUR','FRI','SAT'];
const copy=value=>JSON.parse(JSON.stringify(value));
function reportMonth(value){const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);if(!match||+match[1]<2026)throw Object.assign(Error('Select a month in 2026 or later.'),{status:400});return {year:+match[1],month:+match[2],name:months[+match[2]-1]};}
function prepareCalendar(sheet,kind,year){
 if(year===2026)return;
 const month=months.indexOf(sheet.name)+1,days=new Date(Date.UTC(year,month,0)).getUTCDate();
 if(!month)return;
 if(kind==='wwh'){
  let start=1,index=0;
  while(start<=days){const day=new Date(Date.UTC(year,month-1,start)).getUTCDay(),end=Math.min(days,start+(4-day+7)%7),row=5+index++;
   sheet.getCell('A'+row).value=index;sheet.getCell('B'+row).value=(start===end?start:start+'-'+end)+' '+sheet.name.toUpperCase();start=end+1;
  }
  for(let row=5+index;row<=10;row++){sheet.getCell('A'+row).value=null;sheet.getCell('B'+row).value=null;}
  sheet.getCell('O2').value=new Date(Date.UTC(year,month,0));sheet.getCell('O2').numFmt='mmm d, yyyy';return;
 }
 let oldLast=5,oldHeader;sheet.eachRow((row,n)=>{if(row.hasValues)oldLast=n;if(row.getCell(12).value==='# Flights')oldHeader=n;});
 const rowStyle=row=>({height:sheet.getRow(row).height,cells:Array.from({length:14},(_,i)=>copy(sheet.getCell(row,i+1).style))});
 const daily=Array.from({length:5},(_,i)=>rowStyle(6+i)),summaries=[0,1,2].map(i=>rowStyle((oldHeader||oldLast-2)+i));
 for(const range of [...sheet.model.merges]){const row=+range.split(':')[0].replace(/\D/g,'');if(row>=6)sheet.unMergeCells(range);}
 const end=5+days*5,header=end+1,total=end+2,otp=end+3;
 for(let r=6;r<=Math.max(oldLast,otp);r++)for(let c=1;c<=14;c++)sheet.getCell(r,c).value=null;
 const applyStyle=(row,style)=>{sheet.getRow(row).height=style.height;for(let c=1;c<=14;c++)sheet.getCell(row,c).style=copy(style.cells[c-1]);};
 let weekStart=6;
 for(let day=1;day<=days;day++){
  const start=6+(day-1)*5,weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();
  for(let offset=0;offset<5;offset++)applyStyle(start+offset,daily[offset]);
  sheet.getCell('A'+start).value=day;sheet.getCell('B'+start).value=weekdays[weekday];sheet.mergeCells('L'+start+':L'+(start+4));sheet.mergeCells('M'+start+':M'+(start+4));
  if(weekday===0||day===days){sheet.mergeCells('N'+weekStart+':N'+(start+4));sheet.getCell('N'+weekStart).value={formula:`SUM(L${weekStart}:L${start+4})`};weekStart=start+5;}
 }
 for(let i=0;i<3;i++)applyStyle(header+i,summaries[i]);
 sheet.getCell('L'+header).value='# Flights';sheet.getCell('M'+header).value='HAS Delays';
 for(const column of ['L','M','N'])sheet.getCell(column+total).value={formula:`SUM(${column}6:${column}${end})`};
 sheet.getCell('K'+otp).value='OTP';sheet.getCell('L'+otp).value={formula:`L${total}-M${total}`};sheet.getCell('M'+otp).value={formula:`L${otp}/L${total}`};
 sheet.getCell('I4').value=new Date(Date.UTC(year,month-1,1));sheet.pageSetup.printArea='A1:N'+otp;
}
module.exports={reportMonth,prepareCalendar,months};
