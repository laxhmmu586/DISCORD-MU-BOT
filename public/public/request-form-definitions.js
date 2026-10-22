(()=>{
 const incidentFields={incidentDate:'Date of incident',station:'Station / Account',location:'Incident Location',preparedBy:'Prepared by',title:'Title',reportDate:'Date',closedDate:'Date report closed',summary:'Summary of the Event',immediateAction:'Immediate action taken',findings:'Investigation findings: Who, What, Where, When, Why',rootCause:'Root cause',correctiveAction:'Corrective action',preventativePlan:'Preventative action plan',followUp:'Is a follow up required? Yes / No (explain)',thirtyDayFollowUp:'30 day follow up: effectiveness, review date and people involved'};
 const stages={incident:['Business Manager','General Manager','HQ Safety & Security Manager','Vice President of Operations','President'],expense:['Manager','General Manager','Vice President of Operations','President','Accounting'],terrific:['Manager','General Manager','Vice President of Operations','Badge Coordinator']};
 window.requestFormDefinitions=(kind,employee)=>{
  const definition=kind==='incident'?{fields:incidentFields}:kind==='expense'?window.expenseDefinition:window.terrificDefinition;
  return {...definition,employee,canCreate:/Supervisor|Manager|Director|President|^CFO$/.test(employee.position||''),stages:stages[kind],approvalRoute:[],reports:[],historyLoading:true};
 };
})();
