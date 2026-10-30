(() => {
 async function request(path='',body){
  const user=firebase.auth().currentUser;if(!user)throw Error('Please sign in first.');
  let response;try{response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/profile-api'+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch(error){throw Error(error.name==='TimeoutError'?'The profile service took too long. Your changes are kept; please retry.':'Unable to reach the profile service. Your changes are kept; check your connection and retry.');}
  if(response.status===413)throw Error('The photo upload is too large. Crop the photo and retry.');const data=await response.json().catch(()=>{throw Error('The profile service returned an unexpected response. Your changes are kept; please retry.');});if(!response.ok)throw Object.assign(Error(data.error||'Unable to load your profile.'),{status:response.status});return data;
 }
 window.employeeProfileApi=request;
})();
