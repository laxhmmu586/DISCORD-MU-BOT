const feeds = [
  { url: 'https://en.nia.gov.cn/n147418/n147468/index.html', authority: 'National Immigration Administration', kind: 'feed' },
  { url: 'https://en.nia.gov.cn/n147418/n147463/index.html', authority: 'National Immigration Administration', kind: 'feed' },
  { url: 'https://www.mfa.gov.cn/wjbzwfwpt/kzx/tzgg/', authority: 'Ministry of Foreign Affairs', kind: 'feed' },
  { url: 'https://www.mfa.gov.cn/fyrbt_673021/dhdw_673027/', authority: 'Ministry of Foreign Affairs', kind: 'feed' }
];
const policies = [
  { url: 'https://al.china-embassy.gov.cn/lsfw/lszj/lhqz/202303/t20230301_11033372.htm', authority: 'Chinese Embassy in Albania', kind: 'policy' },
  { url: 'https://my.china-embassy.gov.cn/sgxw/201908/t20190813_1717561.htm', authority: 'Chinese Embassy in Malaysia', kind: 'policy' },
  { url: 'https://www.nia.gov.cn/n794014/n794021/c1659665/content.html', authority: 'National Immigration Administration', kind: 'policy' },
  { url: 'https://cs.mfa.gov.cn/lgk1/201905/t20190529_833938.shtml', authority: 'China Consular Affairs', kind: 'policy' },
  { url: 'https://cgchicago.thaiembassy.org/th/content/thailand-visa-exemption-stay?cate=624678640ec8444296380ad3&menu=6213463206a176712603be23', authority: 'Royal Thai Consulate General Chicago', kind: 'policy' },
  { url: 'https://washingtondc.thaiembassy.org/en/page/visa-information', authority: 'Royal Thai Embassy Washington', kind: 'policy' },
  { url: 'https://www.nia.gov.cn/n794014/n1050181/n1050479/c1013311/content.html', authority: 'National Immigration Administration', kind: 'policy' },
  { url: 'https://cs.mfa.gov.cn/zggmcgx/cgqzapecswlxk/ylb/202607/t20260716_11984014.html', authority: 'China Consular Affairs', kind: 'policy' },
  { url: 'https://www.nia.gov.cn/n741440/n741547/c757556/content.html', authority: 'National Immigration Administration', kind: 'policy' },
  { url: 'https://www.mfa.gov.cn/wjbzwfwpt/kzx/tzgg/202401/t20240129_11234802.html', authority: 'Ministry of Foreign Affairs', kind: 'policy' },
  { url: 'https://www.mfa.gov.cn/web/gjhdq_676201/gj_676203/yz_676205/1206_677076/xgxw_677082/202401/t20240125_11233114.shtml', authority: 'Ministry of Foreign Affairs', kind: 'policy' },
  { url: 'https://almaty.china-consulate.gov.cn/chn/lsfw/lszj/qzyw/202606/t20260604_11937718.htm', authority: 'Chinese Consulate General in Almaty', kind: 'policy' },
  { url: 'https://my.china-embassy.gov.cn/chn/fwzc/lsyw/zytz/qzxgtz/202507/t20250714_11670211.htm', authority: 'Chinese Embassy in Malaysia', kind: 'policy' },
  { url: 'https://chicago.china-consulate.gov.cn/eng/lsfw/qzsq/202510/t20251022_11738238.htm', authority: 'Chinese Consulate General in Chicago', kind: 'policy' },
  { url: 'https://en.nia.gov.cn/n147418/n147463/c183390/content.html', authority: 'National Immigration Administration', kind: 'policy' },
  { url: 'https://www.mfa.gov.cn/fyrbt_673021/dhdw_673027/202602/t20260215_11860462.shtml', authority: 'Ministry of Foreign Affairs', kind: 'policy' },
  { url: 'https://cs.mfa.gov.cn/lgk1/202511/t20251103_11746081.shtml', authority: 'China Consular Affairs', kind: 'policy' },
  { url: 'https://cs.mfa.gov.cn/lh/lhqz_149493/cjwd/', authority: 'China Consular Affairs', kind: 'policy' }
];
function officialUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
      (['travel.state.gov','www.ica.gov.sg','www.mfa.gov.sg','www.gov.uk','www.canada.ca','www.cbp.gov','www.help.cbp.gov','www.immigration.govt.nz','immi.homeaffairs.gov.au','www.immigration.gov.vn','evisa.gov.vn','www.immd.gov.hk','washingtondc.thaiembassy.org','cgchicago.thaiembassy.org'].includes(u.hostname) || ['nia.gov.cn','mfa.gov.cn','china-embassy.gov.cn','china-consulate.gov.cn'].some(host => u.hostname.endsWith('.'+host)||u.hostname===host));
  } catch { return false; }
}
module.exports = { feeds, policies, officialUrl };
