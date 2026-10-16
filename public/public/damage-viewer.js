import * as THREE from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';
import { createSuitcase } from './suitcase-model.js';

// Each shell face owns a texture. UV ray hits keep ink fixed to that face
// through arbitrary rotations, bag changes and report export.
const canvas=document.querySelector('#damage-sketch');
const keys=['right','left','top','bottom','front','back'];
const labels=['Front','Back','Left','Right','Top','Bottom'];
const angles={front:[.04,-.23],back:[0,Math.PI],left:[0,Math.PI/2],right:[0,-Math.PI/2],top:[Math.PI/2,0],bottom:[-Math.PI/2,0]};
try {
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf5f9ff,0);
const scene=new THREE.Scene();let camera=new THREE.PerspectiveCamera(33,1,.1,100);camera.position.set(0,.12,6.9);
scene.add(new THREE.HemisphereLight(0xffffff,0x7c899c,.8));
const hdr=await new HDRLoader().loadAsync('/assets/studio_small_08_1k.hdr');hdr.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(hdr).texture;scene.environmentRotation.y=.65;hdr.dispose();pmrem.dispose();
for(const [x,y,z,power] of [[-3,5,6,2.5],[4,2,3,1.2]]){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(x,y,z);if(power===2.5){light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:15});light.shadow.bias=-.0003;light.shadow.normalBias=.015;light.shadow.radius=3;}scene.add(light);}
const {bag,skinGeometries}=createSuitcase(THREE);scene.add(bag);const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),sg=sc.createRadialGradient(64,64,0,64,64,64);sg.addColorStop(0,'rgba(12,24,40,.22)');sg.addColorStop(.4,'rgba(12,24,40,.12)');sg.addColorStop(1,'rgba(12,24,40,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);const floor=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.15),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.59;scene.add(floor);
const textures=new Map(),surfaces=[];
for(const key of keys){const ink=document.createElement('canvas');ink.width=512;ink.height=768;const texture=new THREE.CanvasTexture(ink);texture.colorSpace=THREE.SRGBColorSpace;textures.set(key,{ink,texture});const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});let w=1.7,h=2.5;if(['left','right'].includes(key))w=.78;if(['top','bottom'].includes(key)){w=1.7;h=.78;}const mesh=new THREE.Mesh(skinGeometries.get(key)||new THREE.PlaneGeometry(w,h),material);if(key==='right'){mesh.position.x=.89;mesh.rotation.y=Math.PI/2;}if(key==='left'){mesh.position.x=-.89;mesh.rotation.y=-Math.PI/2;}if(key==='top'){mesh.position.y=1.29;mesh.rotation.x=-Math.PI/2;}if(key==='bottom'){mesh.position.y=-1.29;mesh.rotation.x=Math.PI/2;}mesh.userData.face=key;bag.add(mesh);surfaces.push(mesh);}
let tool='mark',yaw=-.23,pitch=.04,zoom=1,dirty=new Set(),last=null;
const pointers=new Map(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
let rotationGesture=false;
function render(){bag.rotation.set(pitch,yaw,0,'YXZ');camera.zoom=zoom;camera.updateProjectionMatrix();bag.updateMatrixWorld(true);renderer.render(scene,camera);}
function resize(){const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;render();}
new ResizeObserver(resize).observe(canvas.parentElement);
function view(key){[pitch,yaw]=angles[key];document.querySelectorAll('[data-damage-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.damageView===key)));render();}
document.querySelectorAll('[data-view-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.viewAction;if(action==='front')view('front');if(action==='reset'){zoom=1;view('front');}if(action==='up')pitch+=Math.PI/8;if(action==='down')pitch-=Math.PI/8;if(action==='in')zoom=Math.min(1.7,zoom+.15);if(action==='out')zoom=Math.max(.65,zoom-.15);render();});
document.querySelectorAll('[data-damage-tool]').forEach(b=>b.onclick=()=>{tool=tool===b.dataset.damageTool?'rotate':b.dataset.damageTool;document.querySelectorAll('[data-damage-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.damageTool===tool)));});
function hit(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);return ray.intersectObjects(surfaces)[0];}
function paint(e){const intersection=hit(e);if(!intersection){last=null;return;}const key=intersection.object.userData.face,{ink,texture}=textures.get(key),ctx=ink.getContext('2d');const p={x:intersection.uv.x*ink.width,y:(1-intersection.uv.y)*ink.height,key};ctx.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';ctx.strokeStyle='#ef3439';ctx.fillStyle='#ef3439';ctx.lineWidth=tool==='erase'?35:10;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();if(last?.key===key){ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();}else{ctx.arc(p.x,p.y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}last=p;texture.needsUpdate=true;const data=ctx.getImageData(0,0,ink.width,ink.height).data;let hasInk=false;for(let i=3;i<data.length;i+=4)if(data[i]){hasInk=true;break;}if(hasInk)dirty.add(key);else dirty.delete(key);render();}
canvas.onpointerdown=e=>{
 e.preventDefault();canvas.setPointerCapture(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:false});last=null;
 // Wait for movement or a completed tap: a second finger can still join this gesture.
 if(pointers.size>1)rotationGesture=true;
};
canvas.onpointermove=e=>{
 const prev=pointers.get(e.pointerId);if(!prev)return;e.preventDefault();
 if(tool==='rotate'||rotationGesture){
  yaw+=(e.clientX-prev.x)*.012;pitch+=(e.clientY-prev.y)*.012;last=null;render();
 }else{
  if(!prev.moved)paint({clientX:prev.x,clientY:prev.y});
  paint(e);
 }
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:true});
};
function finishPointer(e){
 const pointer=pointers.get(e.pointerId);
 if(e.type==='pointerup'&&pointer&&!pointer.moved&&!rotationGesture&&tool!=='rotate')paint(e);
 pointers.delete(e.pointerId);last=null;
 // Releasing one finger must not turn the remaining rotation gesture into drawing.
 if(!pointers.size)rotationGesture=false;
}
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finishPointer;
function snapshot(){return new Map([...dirty].map(key=>{const src=textures.get(key).ink,c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return [key,c];}));}
function load(marks=new Map()){dirty=new Set(marks.keys());for(const [key,{ink,texture}] of textures){const ctx=ink.getContext('2d');ctx.clearRect(0,0,ink.width,ink.height);if(marks.has(key))ctx.drawImage(marks.get(key),0,0);texture.needsUpdate=true;}render();}
document.querySelector('#clear-sketch').onclick=()=>load();
function exportViews(marks){
 if(!marks?.size)return '';
 const saved=snapshot(),rotation=[pitch,yaw,zoom],liveCamera=camera,size=renderer.getSize(new THREE.Vector2());
 const output=document.createElement('canvas');output.width=900;output.height=660;const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,660);
 // Report views share one physical scale, square viewport, and exact orthogonal axes.
 camera=new THREE.OrthographicCamera(-1.95,1.95,1.95,-1.95,.1,100);camera.position.set(0,0,8);renderer.setSize(450,450,false);floor.visible=false;zoom=1;load(marks);
 labels.forEach((name,i)=>{const key=name.toLowerCase();[pitch,yaw]=key==='front'?[0,0]:angles[key];render();const x=(i%3)*300,y=Math.floor(i/3)*330;ctx.drawImage(canvas,x,y,300,300);ctx.fillStyle='#173f73';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText(name,x+150,y+320);});
 camera=liveCamera;renderer.setSize(size.x,size.y,false);floor.visible=true;[pitch,yaw,zoom]=rotation;load(saved);render();return output.toDataURL('image/jpeg',.85);
}

window.DamageViewer={snapshot,load,view,export:exportViews};resize();document.dispatchEvent(new Event('damage-viewer-ready'));
}catch(error){const message=document.querySelector('#damage-viewer-error');message.hidden=false;message.textContent='3D view unavailable. Please enable WebGL or use another browser. You can still upload damage photos.';console.error(error);}
