/* Position titles only; never import names from the organizational chart.
 * Source: Organizational Chart 2026.xlsx, 2026 station sheets and HQ 2026.
 * CSA is the existing Agent position. Legacy Manager/Lead remain supported.
 */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.employeePositions=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 const groups=[
  {label:'Station operations',positions:['Regional Manager','General Manager','Interim General Manager','Airport Manager','Airport Operations Manager','Business Manager','Duty Manager','Senior Supervisor','Supervisor','Lead','Agent']},
  {label:'Headquarters',positions:['President','CFO','Senior Vice President Commercial','Vice President of Operations','Senior Vice President Human Resources','Director of Cash Management & Internal Control','Director of Sales & Marketing','Director Training & Compliance','Senior Manager Airport Services','Quality Assurance Manager & Project Coordinator','HQ Safety & Security Manager','HR Director','HR Manager','HRIS Administrator','Benefits Administrator','Admin Assistant','Badge Coordinator','Workers Comp Advocate','Accounts Receivable','Accounts Payable','Payroll','Accounting','HQ Out Station Recruiter','HQ Recruiter','JFK Recruiter','HQ Senior Instructor','HQ Corporate Instructor','DFW Corporate Instructor','TX Corporate Instructor','SFO Corporate Instructor','Technical Instructor','Safety Advocate']},
  {label:'Existing positions',positions:['Manager']}
 ];
 const positions=groups.flatMap(group=>group.positions);
 const normalize=value=>value==='CSA'?'Agent':value;
 const valid=value=>positions.includes(normalize(value));
 const same=(left,right)=>normalize(left)===normalize(right);
 const finalApprover=valid;
 const maxWorkflowStages=20;
 return {groups,positions,normalize,valid,same,finalApprover,maxWorkflowStages};
});
