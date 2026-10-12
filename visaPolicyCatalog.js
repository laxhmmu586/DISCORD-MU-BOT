// Reviewed 2026-10-12. Ordinary passports travelling to mainland China.
// Regional/tour-group exemptions and other special entry bases require separate evidence.
const sources = {
  law: {url:'https://www.nia.gov.cn/n794014/n1050181/n1050479/c1013311/content.html',id:'d8fba36a0afcf3d8d7eb6142636caf882c1b0e97b902f4f86f63f54aaba5e298'},
  unilateral: {url:'https://cs.mfa.gov.cn/lh/lhqz_149493/cjwd/',id:'09c81057cdd24b3c8f7c12d3f46a3ace78a354e8e5c77a288d3222a93eefe06e'},
  bilateral: {url:'https://cs.mfa.gov.cn/zggmcgx/cgqzapecswlxk/ylb/202607/t20260716_11984014.html',id:'2defbc268967e81c3323893891135b43f84e0619f0fae3f82d359b2be9c91a4c'},
  canada: {url:'https://www.mfa.gov.cn/fyrbt_673021/dhdw_673027/202602/t20260215_11860462.shtml',id:'2dd9670898d261c1fda6a40e9f97d0895901f6d474da1db67f4c67a0fda80eaf'},
  taiwan: {url:'https://www.nia.gov.cn/n741440/n741547/c757556/content.html',id:'4bbad3726a3b7cb3849c0e78e8fb119585e27e82adb3f926e9473361e87d4a07'},
  tha: {url:'https://www.mfa.gov.cn/wjbzwfwpt/kzx/tzgg/202401/t20240129_11234802.html',id:'0eccbdeb257f59bbd171d1aa8c2c9b9c1be62f53a90ab472d92aa013ae142a89'},
  sgp: {url:'https://www.mfa.gov.cn/web/gjhdq_676201/gj_676203/yz_676205/1206_677076/xgxw_677082/202401/t20240125_11233114.shtml',id:'f9c3a4ac0aea5899338ad86f6c71f8499c8f755ae098181125ab2ca2c7e5b5b9'},
  kaz: {url:'https://almaty.china-consulate.gov.cn/chn/lsfw/lszj/qzyw/202606/t20260604_11937718.htm',id:'cb63ea5e68c143a5dded6be29845535ffa399e6d459102f95f0bc5185237c771'},
  mys: {url:'https://my.china-embassy.gov.cn/chn/fwzc/lsyw/zytz/qzxgtz/202507/t20250714_11670211.htm',id:'1bb7534b74436581748cb78e0b55bd1559b3b5e22f759216ec3fb39a711ceba2'}
};
function entry(nationality,rule_type,conditions,sourceKeys,clause_reference,extra={}) {
  return {id:nationality==='USA'?'chn-usa-visa':`chn-reviewed-${nationality.toLowerCase()}`,nationality,destination_country:'CHN',passport_type:'ordinary',rule_type,conditions,
    effective_from:'2026-10-12',effective_until:null,recheck_due_at:'2026-11-11',sourceKeys,clause_reference,...extra};
}
const rules=[
  entry('CHN','citizen_return',{},['law'],'Entry-exit law Articles 9 and 11: Chinese passport/entry document; visa is not the citizen entry basis.'),
  entry('TWN','special_document',{documentType:'TBZ',issuer:'CHN'},['taiwan'],'Taiwan-resident mainland travel documents, Chapter III Articles 13–15; passport alone is not the travel permit.'),
  ...['USA','MEX','KHM','IND','COL','VNM','CRI','GTM','PHL','LKA','JAM'].map(n=>entry(n,'visa_document',{},['law','unilateral','bilateral'],
    'Article 15 general visa requirement, subject to Article 22 exceptions. No general ordinary-passport exemption in current unilateral/bilateral lists. Manually checked 240 TWOV, residence/travel documents and regional exemptions are separate bases.')),
  ...['CAN','AUS','RUS','PER','FRA','GBR','JPN','KOR','NZL','ESP','DEU','CHL','ITA'].map(n=>entry(n,'visa_exempt',{maxStayDays:30,purposes:['tourism','business','visit','exchange','transit']},['unilateral',...(['CAN','GBR'].includes(n)?['canada']:[])],
    'Visa-free FAQ: ordinary passport; business/tourism/family-friend visit/exchange/transit; at most 30 days from the day after entry; no work/study/news coverage.',
    {effective_until:n==='RUS'?'2027-12-31':'2026-12-31'})),
  entry('KAZ','visa_exempt',{maxStayDays:30,purposes:['private','business','tourism','medical','transport','transit'],cumulativeDays:90,cumulativeWindowDays:180},['kaz','bilateral'],'Ordinary passport; private/business/tourism/medical/transport/transit; 30 days per entry, 90 days in 180 days.'),
  entry('THA','visa_exempt',{maxStayDays:30,purposes:['tourism','business','visit','private','transit'],cumulativeDays:90,cumulativeWindowDays:180},['tha','bilateral'],'Ordinary-passport exemption: 30 days per visit, 90 days in 180; work/study/news/settlement need prior permission.'),
  entry('MYS','visa_exempt',{maxStayDays:30,purposes:['tourism','visit','business','exchange','private','medical','transport','transit'],cumulativeDays:90,cumulativeWindowDays:180},['mys','bilateral'],'Agreement effective 2025-07-17: 30 days per entry, 90 days in 180; specified purposes, no work/study/news/settlement.'),
  entry('SGP','visa_exempt',{maxStayDays:30,purposes:['tourism','business','visit','private','transit']},['sgp','bilateral'],'Ordinary passports, 30 days per entry; work/news coverage and stays over 30 days require prior visa/permission.')
];
module.exports={sources,rules,reviewer:'Official-source review, 2026-10-12'};
