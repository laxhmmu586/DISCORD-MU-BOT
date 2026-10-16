import * as THREE from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';
import { createSuitcase } from './suitcase-model.js?v=20261016-silver-reset';
import { createDamageMarks } from './damage-marks.js?v=20261016-outer-strokes';

// Surface-anchored 3D strokes can extend beyond the silhouette while following the suitcase.
const canvas=document.querySelector('#damage-sketch');
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
const {bag}=await createSuitcase(THREE);scene.add(bag);const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),sg=sc.createRadialGradient(64,64,0,64,64,64);sg.addColorStop(0,'rgba(12,24,40,.22)');sg.addColorStop(.4,'rgba(12,24,40,.12)');sg.addColorStop(1,'rgba(12,24,40,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);const floor=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.15),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.59;scene.add(floor);
const annotations=createDamageMarks({bag,canvas,getCamera:()=>camera});
let tool='mark',yaw=-.23,pitch=.04,zoom=1;
const pointers=new Map();
let rotationGesture=false;
function render(){bag.rotation.set(pitch,yaw,0,'YXZ');bag.updateMatrixWorld(true);camera.zoom=1;camera.updateProjectionMatrix();camera.updateMatrixWorld();const bounds=new THREE.Box3().setFromObject(bag);let ex=0,ey=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);ex=Math.max(ex,Math.abs(p.x));ey=Math.max(ey,Math.abs(p.y));}camera.zoom=Math.min(.86/ex,.91/ey)*zoom;camera.updateProjectionMatrix();bag.updateMatrixWorld(true);annotations.updateVisibility();renderer.render(scene,camera);}
function resize(){const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;render();}
new ResizeObserver(resize).observe(canvas.parentElement);
function view(key){[pitch,yaw]=angles[key];document.querySelectorAll('[data-damage-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.damageView===key)));render();}
document.querySelector('[data-view-action=front]').onclick=()=>{zoom=1;view('front');};
document.querySelectorAll('[data-damage-tool]').forEach(b=>b.onclick=()=>{tool=tool===b.dataset.damageTool?'rotate':b.dataset.damageTool;document.querySelectorAll('[data-damage-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.damageTool===tool)));});
function paint(e){annotations.paint(e);render();}
canvas.onpointerdown=e=>{
 e.preventDefault();canvas.setPointerCapture(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:false});annotations.end();
 // Wait for movement or a completed tap: a second finger can still join this gesture.
 if(pointers.size>1)rotationGesture=true;
};
canvas.onpointermove=e=>{
 const prev=pointers.get(e.pointerId);if(!prev)return;e.preventDefault();
 if(tool==='rotate'||rotationGesture){
  yaw+=(e.clientX-prev.x)*.012;pitch+=(e.clientY-prev.y)*.012;annotations.end();render();
 }else{
  if(!prev.moved)paint({clientX:prev.x,clientY:prev.y});
  paint(e);
 }
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:true});
};
function finishPointer(e){
 const pointer=pointers.get(e.pointerId);
 if(e.type==='pointerup'&&pointer&&!pointer.moved&&!rotationGesture&&tool!=='rotate')paint(e);
 pointers.delete(e.pointerId);annotations.end();
 // Releasing one finger must not turn the remaining rotation gesture into drawing.
 if(!pointers.size)rotationGesture=false;
}
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finishPointer;
function snapshot(){return annotations.snapshot();}
function load(marks=new Map()){annotations.load(marks);render();}
document.querySelector('#clear-sketch').onclick=()=>load();
function capture(){render();return canvas.toDataURL('image/jpeg',.92);}
function pose(){return {pitch,yaw,zoom};}
function restorePose(value){if(value){({pitch,yaw,zoom}=value);render();}}
function exportViews(marks){return marks?.size?capture():'';}

window.DamageViewer={snapshot,load,view,capture,pose,restorePose,export:exportViews};resize();document.dispatchEvent(new Event('damage-viewer-ready'));
}catch(error){const message=document.querySelector('#damage-viewer-error');message.hidden=false;message.textContent='3D view unavailable. Please enable WebGL or use another browser. You can still upload damage photos.';console.error(error);}
