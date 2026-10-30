// Match the test identity; each workflow decides whether to include or exclude it.
function isTestRosterAccount(employee){
 return [employee?.loginId,employee?.email,employee?.companyEmail].some(value=>String(value||'').trim().toLowerCase()==='test@hm.com');
}
module.exports={hiddenFromOperationalRosters:isTestRosterAccount,isTestRosterAccount};
