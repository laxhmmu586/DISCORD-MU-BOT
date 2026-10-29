// Test identities stay out of operational rosters without deleting their employee records.
function hiddenFromOperationalRosters(employee){
 return [employee?.loginId,employee?.email,employee?.companyEmail].some(value=>String(value||'').trim().toLowerCase()==='test@hm.com');
}
module.exports={hiddenFromOperationalRosters};
