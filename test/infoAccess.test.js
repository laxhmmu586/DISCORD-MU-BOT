const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const shared=fs.readFileSync('public/public/info-access.js','utf8');
const page=fs.readFileSync('public/public/info.js','utf8');
function setup(data,{error=false}={}){
 const callbacks=[],links=[{hidden:true},{hidden:true}],elements={'#info-status':{},'#info-content':{hidden:true},'#profile-admin-nav':{hidden:true}};
 const user={email:'employee@example.com',getIdToken:async()=> 'token'};
 const auth={currentUser:user,onAuthStateChanged:fn=>callbacks.push(fn)};
 let requests=0,redirect='';
 const window={firebase:{apps:[{}],auth:()=>auth},addEventListener(){}};
 const context=vm.createContext({window,firebase:window.firebase,AbortSignal,document:{querySelectorAll:()=>links,querySelector:key=>elements[key]},location:{replace:path=>redirect=path},fetch:async()=>{requests++;if(error)throw Error('offline');return {ok:true,json:async()=>data};}});
 vm.runInContext(shared,context);vm.runInContext(page,context);
 return {links,elements,auth,get requests(){return requests;},get redirect(){return redirect;},async login(value=user){auth.currentUser=value;await Promise.all(callbacks.map(fn=>fn(value)));}};
}
for(const station of ['LAX',' lax ','SFO','JFK','HQ',''])test('Info access for '+JSON.stringify(station),async()=>{
 const app=setup({state:'ready',profile:{station}});assert(app.links.every(link=>link.hidden));await app.login();
 const allowed=station.trim().toUpperCase()==='LAX';assert.equal(app.elements['#info-content'].hidden,!allowed);assert(app.links.every(link=>link.hidden===!allowed));assert.equal(app.requests,1);
});
test('Unlinked profile cannot view Info',async()=>{const app=setup({state:'confirm',profile:{station:'LAX'}});await app.login();assert(app.elements['#info-content'].hidden);assert(app.links.every(link=>link.hidden));});
test('Profile failure keeps Info hidden',async()=>{const app=setup(null,{error:true});await app.login();assert(app.elements['#info-content'].hidden);assert(app.links.every(link=>link.hidden));assert.match(app.elements['#info-status'].textContent,/Unable to verify/);});
test('Signing out hides Info and sends direct visitors to login',async()=>{const app=setup({state:'ready',profile:{station:'LAX'}});await app.login();await app.login(null);assert(app.elements['#info-content'].hidden);assert(app.links.every(link=>link.hidden));assert.equal(app.redirect,'/login.html');});
test('Insurance removed and each sidebar starts with Info hidden',()=>{
 for(const name of fs.readdirSync('public/public').filter(name=>name.endsWith('.html'))){const html=fs.readFileSync('public/public/'+name,'utf8');if(!html.includes('<aside class="profile-sidebar"'))continue;assert.match(html,/<a hidden data-info-access href="\/info.html"/);assert.match(html,/info-access.js\?v=20261023-lax/);if(['profile.html','info.html'].includes(name))assert.doesNotMatch(html,/Insurance Waiver|info.html#insurance|id="insurance"/);}
});
