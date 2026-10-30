/* Local design preview only. HQ names and lines transcribed from the user's screenshots.
 * Station team members are placeholders. Never imported into the employee database. */
window.hrReferenceData=()=>{
  const employees=[];
  function person(id,name,position,reportsTo='',station='HQ',account='HQ'){employees.push({id,name,position,reportsTo,station,account,nickname:'',companyEmail:''});}
  person('president','Tanitsorn Pengcharoen','President');
  const branches=[
    ['finance','Jim Chappell','CFO',[['Varoth Changthong','Director of Cash Management & Internal Control'],['Joy Yadao','Accounts Payable'],['Sasima Keereewat','Accounts Receivable'],['Jen Flores','Payroll'],['Tim Plengchindaruang','Accounting']]],
    ['commercial','Kenneth Pierce','Senior Vice President Commercial',[['Sergio Garcia','Director of Sales & Marketing'],['Lilian Kim','Senior Manager Airport Services']]],
    ['operations','Oscar Yiu','Vice President of Operations',[]],
    ['hr','Paula Hooks','Senior Vice President Human Resources',[['Gonca Camacho','HR Director'],['Mehak Hussain','HR Manager'],['Mariela Mejillones','HR Manager'],['Reema Shazad','HQ Out Station Recruiter'],['George Lani','JFK Recruiter'],['HQ Recruiter','HQ Recruiter'],['Nallely Zarate','HRIS Administrator'],['Talia Warren','Benefits Administrator'],['Amy Kirolos','Admin Assistant'],['Connie Rodriguez','Badge Coordinator'],['Melita C. McKay','Workers Comp Advocate']]],
    ['training','Tony Pham','Director Training & Compliance',[['Evelyn Fouse','HQ Senior Instructor'],['Tam Ezzati','HQ Corporate Instructor'],['Sirinya Booyindee','HQ Corporate Instructor'],['DFW Corporate Instructor','DFW Corporate Instructor'],['Trisha Gonzalez','TX Corporate Instructor'],['May Chen','SFO Corporate Instructor'],['Danchai Srisermpoke','Technical Instructor'],['Danny Phumiruk','Technical Instructor']]],
    ['quality','Maria M. Silva','Quality Assurance Manager & Project Coordinator',[]],
    ['safety','Matthew Overmyer','HQ Safety & Security Manager',[['Jesus Alvarez','Safety Advocate'],['Bae Pak','Safety Advocate'],['JFK Safety Advocate','Safety Advocate']]]
  ];
  for(const [id,name,title,children] of branches){person(id,name,title,'president');children.forEach(([n,t],i)=>person(id+'-'+i,n,t,id));}
  person('regional','Nick Nouri','Regional Manager','operations','LAX','REGION');
  [['Sung Kim','Regional Manager','HNL'],['Jinny Hwang','Interim General Manager','SFO'],['Miguel Garcia','General Manager','DFW'],['Ayesha Arshad','Interim General Manager','IAH'],['Ravi Patel','General Manager','EWR'],['Jhon Camacho','Interim General Manager',''],['Najoua Schools','General Manager','ATL'],['Carmen Carson','General Manager','CBS'],['Jose Pichardo','Airport Manager','MCO']].forEach(([n,t,s],i)=>person('station-'+i,n,t,'operations',s||'HQ',s||'HQ'));
  const accountTitles={CI:'Senior Supervisor',QF:'Business Manager',QR:'Business Manager',FJ:'Business Manager',VS:'Business Manager',KE:'Business Manager',TK:'Business Manager',MU:'Business Manager',NH:'Business Manager',AM:'Senior Supervisor',LH:'Business Manager',YP:'Business Manager',BF:'Business Manager',EK:'Business Manager',SQ:'Business Manager',MF:'Senior Supervisor',JX:'Business Manager',BR:'Business Manager','3U':'Senior Supervisor',CZ:'Senior Supervisor',LY:'Senior Supervisor',DE:'Senior Supervisor',OZ:'Supervisor'};
  for(const [code,title] of Object.entries(accountTitles)){
    person('account-'+code,code+' '+title,title,'regional','LAX',code);
    if(['MU','QF','EK'].includes(code)){
      person(code+'-sup-1',code+' Supervisor 01','Supervisor','account-'+code,'LAX',code);
      person(code+'-sup-2',code+' Supervisor 02','Supervisor','account-'+code,'LAX',code);
      person(code+'-agent-1',code+' Team member 01','Agent','team:LAX:'+code+':Supervisor','LAX',code);
      person(code+'-agent-2',code+' Team member 02','Agent','team:LAX:'+code+':Supervisor','LAX',code);
      person(code+'-agent-3',code+' Team member 03','Agent','team:LAX:'+code+':Supervisor','LAX',code);
    }
  }
  const accounts=[{station:'HQ',account:'HQ'},...Object.keys(accountTitles).map(account=>({station:'LAX',account})),...['HNL','SFO','DFW','IAH','EWR','ATL','CBS','MCO'].map(station=>({station,account:station}))];
  return {revision:1,employees,accounts,access:{mode:'admin',employeeId:'preview-admin'}};
};
