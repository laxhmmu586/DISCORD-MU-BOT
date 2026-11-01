(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ChargeFormModel=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 // Reference: spreadsheet 1VDIRN77cKZMQPXQ1ZLY-8lp8VI44tpFD5oU1Q9YAzYs, gid 550963234.
 // USD display follows the sheet's whole-dollar currency format; conversion uses the unrounded rate.
 const rows=(prefix,labels,amounts,currency='CNY')=>labels.map((label,i)=>({id:prefix+i,label,amount:amounts[i],currency}));
 const groups={china:rows('cn',['1st EX BAG','2nd EX BAG','OW 24–32KG','OW 33–45KG','OS 159 to 202cm','OS 203 to 302cm'],[1300,2000,1000,2700,1000,2700]),international:rows('intl',['1st EX BAG','2nd EX BAG','OW 24–32KG','OS 159 to 202cm','OS 203 to 302cm'],[1200,2000,1000,1000,2000]),seat:rows('seat',['FIRST ROW'],[900]),business:rows('biz',['Y / B / M / E','H / K / L','N / R / S','V'],[1100,2200,2700,3020],'USD'),first:rows('first',['J','C / D / Q / I'],[1000,2500],'USD'),special:rows('special',['Special Bags','Special Bags','Special Bags','Special Bags'],[1000,3500,2000,4500])};
 const items=Object.values(groups).flat(),defaults=Object.fromEntries(items.map(row=>[row.id,row.amount]));
 const notices=[
  ['【升舱】本次付费项目不累计消费积分及里程积分 ，常旅客积分按升舱前订座的原舱位享受积分累积；\n【升舱】因供应商备餐需要时间，我们会尽力配送，但无法确保提供头等/公务舱餐食；','【UPGRADE】FFP mileage is earned based on the original paid fare/booking class.\n【UPGRADE】We are unable to guarantee the availability of First class/ Business class meals as our suppliers require advance ordering, but we will make every effort to provide them for you.'],
  ['【付费选座】本人确认已知悉并同意所选座位的位置安排','【PAID SEAT】I hereby acknowledge and agree to the assigned location of my selected seat.'],
  ['【升舱，选座类服务】仅限洛杉矶至上海航段','【Upgrade and Seat Selection Services】 Available only on the Los Angeles–Shanghai segment.'],
  ['【购票】若旅客原有机票因个人原因无法使用，再次购买的新票一经出票，将视为优先使用机票，不得退票或作废。','If a passenger already holds a ticket that cannot be used and purchases a new ticket at the counter, the newly issued ticket will be considered the primary ticket and is non-refundable.']
 ];
 const acknowledgment=['本人确认上述费用系本人在机场现场自愿向航空公司支付，用于即时生效的付费项目。该服务一经使用不接受退款、取消或撤销。本人签字确认并同意由此产生的一切费用。','I hereby confirm that the above charges were voluntarily paid by me at the airport directly to the airline for services that take effect immediately. I acknowledge that once the service is used, it is non-refundable, non-cancellable, and cannot be revoked. By signing below, I fully accept and agree to be responsible for all associated charges.'];
 function usd(item,prices,rate){const base=Number(prices[item.id]);if(!Number.isFinite(base)||base<0)return null;if(item.currency==='USD')return base;if(!Number.isFinite(Number(rate))||Number(rate)<=0)return null;return base*Number(rate);}
 const dollars=value=>value===null?'—':'$'+Math.round(value).toLocaleString('en-US');
 return {groups,items,defaults,notices,acknowledgment,usd,dollars};
});
