(() => {
 async function request(path='',body){
  const user=firebase.auth().currentUser;if(!user)throw Error('Please sign in first.');
  const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/profile-api'+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Unable to load your profile.'),{status:response.status});return data;
 }
 window.employeeProfileApi=request;
})();
