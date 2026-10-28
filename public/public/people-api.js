window.peopleApi=async(path,body,blob=false)=>{
 const user=firebase.auth().currentUser;if(!user)throw Error('Sign in required.');
 const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(45000),headers:{...(window.workspaceHeaders?.()||{}),Authorization:'Bearer '+await user.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Unable to reach the service. Please retry.');}return blob?response.blob():response.json();
};
window.peopleSignIn=()=>location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search));
