window.uniformApi=async(path='',body,pdf=false)=>{
 const user=firebase.auth().currentUser;if(!user)throw Error('Sign in required.');
 const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/uniform-api'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok){const data=await response.json();throw Error(data.error||'Unable to load requests.');}return pdf?response.blob():response.json();
};
