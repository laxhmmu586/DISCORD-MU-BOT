import * as THREE from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';
import { createSuitcase } from './suitcase-model.js?v=20261016-supplied-fbx';
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
function render(){bag.rotation.set(pitch,yaw,0,'YXZ');camera.zoom=zoom;camera.updateProjectionMatrix();bag.updateMatrixWorld(true);annotations.updateVisibility();renderer.render(scene,camera);}
function resize(){const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;render();}
new ResizeObserver(resize).observe(canvas.parentElement);
function view(key){[pitch,yaw]=angles[key];document.querySelectorAll('[data-damage-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.damageView===key)));render();}
document.querySelector('[data-view-action=front]').onclick=()=>view('front');
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
function exportViews(marks){
 if(!marks?.size)return '';
 const saved=snapshot(),rotation=[pitch,yaw,zoom],liveCamera=camera,size=renderer.getSize(new THREE.Vector2());
 const output=document.createElement('canvas');output.width=900;output.height=660;const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,660);
 // Report views share one physical scale, square viewport, and exact orthogonal axes.
 camera=new THREE.OrthographicCamera(-1.95,1.95,1.95,-1.95,.1,100);camera.position.set(0,0,8);renderer.setSize(450,450,false);floor.visible=false;zoom=1;load(marks);const extent=annotations.extent();Object.assign(camera,{left:-extent,right:extent,top:extent,bottom:-extent});
 labels.forEach((name,i)=>{const key=name.toLowerCase();[pitch,yaw]=key==='front'?[0,0]:angles[key];render();const x=(i%3)*300,y=Math.floor(i/3)*330;ctx.drawImage(canvas,x,y,300,300);ctx.fillStyle='#173f73';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText(name,x+150,y+320);});
 camera=liveCamera;renderer.setSize(size.x,size.y,false);floor.visible=true;[pitch,yaw,zoom]=rotation;load(saved);render();return output.toDataURL('image/jpeg',.85);
}

window.DamageViewer={snapshot,load,view,export:exportViews};resize();document.dispatchEvent(new Event('damage-viewer-ready'));
}catch(error){const message=document.querySelector('#damage-viewer-error');message.hidden=false;message.textContent='3D view unavailable. Please enable WebGL or use another browser. You can still upload damage photos.';console.error(error);}
