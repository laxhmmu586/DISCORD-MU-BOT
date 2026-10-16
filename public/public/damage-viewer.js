import * as THREE from './vendor/three.module.js';

// Each shell face owns a texture. UV ray hits keep ink fixed to that face
// through arbitrary rotations, bag changes and report export.
const canvas=document.querySelector('#damage-sketch');
const keys=['right','left','top','bottom','front','back'];
const labels=['Front','Back','Left','Right','Top','Bottom'];
const angles={front:[.025,-.14],back:[0,Math.PI],left:[0,Math.PI/2],right:[0,-Math.PI/2],top:[Math.PI/2,0],bottom:[-Math.PI/2,0]};
try {
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf5f9ff,0);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,100);camera.position.set(0,.12,6.9);
scene.add(new THREE.HemisphereLight(0xffffff,0x7c899c,.8));
// Broad studio strips reflected by the metal produce the silver shell highlights.
const studio=document.createElement('canvas');studio.width=1024;studio.height=512;const studioCtx=studio.getContext('2d');const studioGradient=studioCtx.createLinearGradient(0,0,0,512);studioGradient.addColorStop(0,'#dce3eb');studioGradient.addColorStop(.45,'#68717b');studioGradient.addColorStop(.75,'#9ba5af');studioGradient.addColorStop(1,'#27313c');studioCtx.fillStyle=studioGradient;studioCtx.fillRect(0,0,1024,512);for(const [x,w] of [[80,90],[360,35],[670,120],[920,30]]){const strip=studioCtx.createLinearGradient(x-25,0,x+w+25,0);strip.addColorStop(0,'#57616d');strip.addColorStop(.18,'#eaf0f7');strip.addColorStop(.45,'#ffffff');strip.addColorStop(.8,'#edf3fa');strip.addColorStop(1,'#65707b');studioCtx.fillStyle=strip;studioCtx.fillRect(x-25,45,w+50,370);}const studioTexture=new THREE.CanvasTexture(studio);studioTexture.mapping=THREE.EquirectangularReflectionMapping;studioTexture.colorSpace=THREE.SRGBColorSpace;const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(studioTexture).texture;studioTexture.dispose();pmrem.dispose();
for(const [x,y,z,power] of [[-3,5,6,5],[4,2,3,3],[-4,-2,-3,2]]){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);}
const bag=new THREE.Group();scene.add(bag);
const silver=new THREE.MeshStandardMaterial({color:0xc8cbd0,metalness:.92,roughness:.23,envMapIntensity:1.5});
const dark=new THREE.MeshStandardMaterial({color:0x111419,roughness:.9});
const trim=new THREE.MeshStandardMaterial({color:0x697079,metalness:.65,roughness:.28});
function box(w,h,d,x,y,z,material=silver,r=.08){const shape=new THREE.Shape();const hw=w/2,hh=h/2;r=Math.min(r,hw-.001,hh-.001);shape.moveTo(-hw+r,-hh);shape.lineTo(hw-r,-hh);shape.quadraticCurveTo(hw,-hh,hw,-hh+r);shape.lineTo(hw,hh-r);shape.quadraticCurveTo(hw,hh,hw-r,hh);shape.lineTo(-hw+r,hh);shape.quadraticCurveTo(-hw,hh,-hw,hh-r);shape.lineTo(-hw,-hh+r);shape.quadraticCurveTo(-hw,-hh,-hw+r,-hh);const geo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:8});geo.translate(0,0,-d/2);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.position.set(x,y,z);bag.add(mesh);return mesh;}
box(1.7,2.5,.78,0,0,0,silver,.23);box(1.72,2.46,.06,0,0,0,dark,.16);
// Metallic ribs, rounded corners, telescopic handle and four spinner wheels.
for(const z of [-.408,.408])for(let x=-.69;x<.7;x+=.095){const rib=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,2.13,16),silver);rib.position.set(x,0,z);bag.add(rib);for(const y of [-1.065,1.065]){const end=new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),silver);end.position.set(x,y,z);bag.add(end);}}
for(const x of [-.68,.68])for(const y of [-1.08,1.08])for(const z of [-.435,.435]){box(.15,.18,.04,x,y,z,y>0?silver:dark,.055);const rivet=new THREE.Mesh(new THREE.SphereGeometry(.018,10,8),silver);rivet.position.set(x,y,z>0?.485:-.485);bag.add(rivet);}
for(const x of [-.28,.28])box(.045,.48,.055,x,1.45,0,trim,.015);
box(.66,.095,.11,0,1.7,0,dark,.04);box(.5,.08,.12,0,1.3,.18,dark,.035);
box(.09,.55,.12,.9,.15,0,dark,.04);box(.1,.26,.1,.9,.55,.15,dark,.02);
for(const x of [-.65,.65])for(const z of [-.28,.28]){box(.11,.15,.12,x,-1.31,z,trim,.025);const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.14,24),dark);wheel.rotation.x=Math.PI/2;wheel.position.set(x,-1.43,z);bag.add(wheel);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.145,20),trim);hub.rotation.x=Math.PI/2;hub.position.copy(wheel.position);bag.add(hub);}
const textures=new Map(),surfaces=[];
for(const key of keys){const ink=document.createElement('canvas');ink.width=512;ink.height=768;const texture=new THREE.CanvasTexture(ink);texture.colorSpace=THREE.SRGBColorSpace;textures.set(key,{ink,texture});const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});let w=1.7,h=2.5;if(['left','right'].includes(key))w=.78;if(['top','bottom'].includes(key)){w=1.7;h=.78;}const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);if(key==='front')mesh.position.z=.49;if(key==='back'){mesh.position.z=-.49;mesh.rotation.y=Math.PI;}if(key==='right'){mesh.position.x=.89;mesh.rotation.y=Math.PI/2;}if(key==='left'){mesh.position.x=-.89;mesh.rotation.y=-Math.PI/2;}if(key==='top'){mesh.position.y=1.29;mesh.rotation.x=-Math.PI/2;}if(key==='bottom'){mesh.position.y=-1.29;mesh.rotation.x=Math.PI/2;}mesh.userData.face=key;bag.add(mesh);surfaces.push(mesh);}
let tool='mark',yaw=-.14,pitch=.025,zoom=1,dirty=new Set(),last=null;
const pointers=new Map(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
function render(){bag.rotation.set(pitch,yaw,0,'YXZ');camera.zoom=zoom;camera.updateProjectionMatrix();bag.updateMatrixWorld(true);renderer.render(scene,camera);}
function resize(){const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;render();}
new ResizeObserver(resize).observe(canvas.parentElement);
function view(key){[pitch,yaw]=angles[key];document.querySelectorAll('[data-damage-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.damageView===key)));render();}
document.querySelectorAll('[data-view-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.viewAction;if(action==='front')view('front');if(action==='reset'){zoom=1;view('front');}if(action==='up')pitch+=Math.PI/8;if(action==='down')pitch-=Math.PI/8;if(action==='in')zoom=Math.min(1.7,zoom+.15);if(action==='out')zoom=Math.max(.65,zoom-.15);render();});
document.querySelectorAll('[data-damage-tool]').forEach(b=>b.onclick=()=>{tool=tool===b.dataset.damageTool?'rotate':b.dataset.damageTool;document.querySelectorAll('[data-damage-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.damageTool===tool)));});
function hit(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);return ray.intersectObjects(surfaces)[0];}
function paint(e){const intersection=hit(e);if(!intersection){last=null;return;}const key=intersection.object.userData.face,{ink,texture}=textures.get(key),ctx=ink.getContext('2d');const p={x:intersection.uv.x*ink.width,y:(1-intersection.uv.y)*ink.height,key};ctx.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';ctx.strokeStyle='#ef3439';ctx.fillStyle='#ef3439';ctx.lineWidth=tool==='erase'?35:10;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();if(last?.key===key){ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();}else{ctx.arc(p.x,p.y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}last=p;texture.needsUpdate=true;const data=ctx.getImageData(0,0,ink.width,ink.height).data;let hasInk=false;for(let i=3;i<data.length;i+=4)if(data[i]){hasInk=true;break;}if(hasInk)dirty.add(key);else dirty.delete(key);render();}
canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});last=null;if(pointers.size===1&&tool!=='rotate')paint(e);};
canvas.onpointermove=e=>{const prev=pointers.get(e.pointerId);if(!prev)return;e.preventDefault();if(tool==='rotate'||pointers.size>1){yaw+=(e.clientX-prev.x)*.012;pitch+=(e.clientY-prev.y)*.012;last=null;render();}else paint(e);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});};
canvas.onpointerup=canvas.onpointercancel=e=>{pointers.delete(e.pointerId);last=null;};canvas.onlostpointercapture=e=>{pointers.delete(e.pointerId);last=null;};
function snapshot(){return new Map([...dirty].map(key=>{const src=textures.get(key).ink,c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return [key,c];}));}
function load(marks=new Map()){dirty=new Set(marks.keys());for(const [key,{ink,texture}] of textures){const ctx=ink.getContext('2d');ctx.clearRect(0,0,ink.width,ink.height);if(marks.has(key))ctx.drawImage(marks.get(key),0,0);texture.needsUpdate=true;}render();}
document.querySelector('#clear-sketch').onclick=()=>load();
function exportViews(marks){if(!marks?.size)return '';const saved=snapshot(),rotation=[pitch,yaw,zoom],output=document.createElement('canvas');output.width=900;output.height=660;const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,660);load(marks);zoom=1;labels.forEach((name,i)=>{view(name.toLowerCase());const x=(i%3)*300,y=Math.floor(i/3)*330;ctx.drawImage(canvas,x,y,300,300);ctx.fillStyle='#173f73';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText(name,x+150,y+320);});load(saved);[pitch,yaw,zoom]=rotation;render();return output.toDataURL('image/jpeg',.8);}
window.DamageViewer={snapshot,load,view,export:exportViews};resize();document.dispatchEvent(new Event('damage-viewer-ready'));
}catch(error){const message=document.querySelector('#damage-viewer-error');message.hidden=false;message.textContent='3D view unavailable. Please enable WebGL or use another browser. You can still upload damage photos.';console.error(error);}
