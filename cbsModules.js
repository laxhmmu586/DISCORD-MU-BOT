'use strict';
const archived=new Set(['on-hand-rush','shipped','passenger-collected','case-close','linked-passenger-file','change-type','expired']);
const closed=row=>/close|forward\s+to\s+mu/i.test(String(row.status||''));
const closedOnHand=row=>Boolean(row.resolvedAt)&&archived.has(String(row.resolution||'').toLowerCase());
const notLoad=row=>[row.status,row.bagType].some(v=>String(v||'').trim().toLowerCase()==='not load bags');
const month=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}).format(date).slice(0,7);};
function closedDate(row){return (row.updateEvents||[]).filter(e=>e.key==='closed').at(-1)?.at||row.resolvedAt||row.updatedAt||row.submittedAt||'';}
function select(rows,query={},kind='passenger'){
 const view=query.view;if(!view)return {rows}; // legacy clients
 if(!['open','closed','shipment'].includes(view))throw Object.assign(Error('Choose a valid CBS view.'),{status:400});
 if(query.month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month))throw Object.assign(Error('Choose a valid month.'),{status:400});
 if(kind==='onhand'&&query.group){if(!['on-hand','bag-room'].includes(query.group))throw Object.assign(Error('Choose a valid CBS module.'),{status:400});rows=rows.filter(row=>notLoad(row)===(query.group==='bag-room'));}
 const isClosed=kind==='passenger'?closed:closedOnHand;
 if(view==='shipment')return {rows:rows.filter(row=>row.resolution==='shipped'||(row.updateEvents||[]).some(e=>['shipped','shipping'].includes(e.key)))};
 rows=rows.filter(row=>isClosed(row)===(view==='closed'));
 const months=view==='closed'?[...new Set(rows.map(row=>month(kind==='passenger'?closedDate(row):row.resolvedAt)).filter(Boolean))].sort().reverse():[];
 const selected=view==='closed'?(query.month||months[0]||month(new Date())):'';
 return {rows:selected?rows.filter(row=>month(kind==='passenger'?closedDate(row):row.resolvedAt)===selected):rows,...(selected?{month:selected,months}:{})};
}
function rushTag(row){const event=(row.updateEvents||[]).filter(e=>e.key==='upcoming_rush').at(-1);return String(new Map(event?.fields||[]).get('Rush Tag')||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();}
function matchMaps(cases,onhand){
 const onHandMatches={},passengerMatches={};
 for(const item of cases){const tag=rushTag(item);if(!tag)continue;const bag=onhand.find(row=>!row.resolvedAt&&String(row.bagTag||'').replace(/[^A-Z0-9]/gi,'').toUpperCase()===tag);if(bag){onHandMatches[item.rowNumber]={rowNumber:bag.rowNumber,bagTag:bag.bagTag};passengerMatches[bag.rowNumber]={rowNumber:item.rowNumber,bagTag:item.bagTag};}}
 return {onHandMatches,passengerMatches};
}
module.exports={select,closed,closedOnHand,notLoad,matchMaps};
