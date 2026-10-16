import { FBXLoader } from './vendor/FBXLoader.js';

// The passenger supplied Baggage.fbx is the single source for every viewer/PDF angle.
// Discard its photography floor, lights and camera, then recolor the existing parts.
export async function createSuitcase(T,buffer){
 const manager=new T.LoadingManager();
 // This FBX references external texture files which were not supplied. Recolor its
 // existing material groups locally instead of requesting unavailable source paths.
 manager.addHandler(/.*/,{path:'',setPath(path){this.path=path;return this;},load(){return new T.Texture();}});
 const loader=new FBXLoader(manager);
 const scene=buffer?loader.parse(buffer,''):await loader.loadAsync(new URL('./assets/Baggage.fbx?v=907b6796740d',import.meta.url).href);
 scene.updateMatrixWorld(true);
 const parts=[];scene.traverse(object=>{if(object.isMesh&&!['Plane','Backdrop_1'].includes(object.name))parts.push(object);});
 if(!parts.length)throw new Error('The supplied luggage model has no suitcase geometry.');
 const bag=new T.Group();bag.name='Baggage.fbx';
 const materials=new Map();
 function recolor(original){
  if(materials.has(original))return materials.get(original);
  // C4D reference: silver ribbed shell and fittings, graphite seals and tyres.
  const shell=original.name==='arch49_plastic_blue_2';
  const metal=original.name==='arch49_aluminium';
  const label=original.name==='材质.2';
  const material=new T.MeshPhysicalMaterial({name:original.name,color:shell?0xc6c9cc:metal?0xb9bec3:label?0x555b60:0x505357,metalness:shell?.82:metal?1:label?.65:.12,roughness:shell?.3:metal?.23:label?.4:.65,clearcoat:shell?.08:0});
  materials.set(original,material);return material;
 }
 for(const part of parts){
  const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);
  const mesh=new T.Mesh(geometry,Array.isArray(part.material)?part.material.map(recolor):recolor(part.material));
  mesh.name=part.name;mesh.castShadow=true;mesh.receiveShadow=true;bag.add(mesh);
 }
 let bounds=new T.Box3().setFromObject(bag),size=bounds.getSize(new T.Vector3());
 // The source has its broad face along Z. Rotate geometry, not the camera, so
 // Front/Back/Left/Right/Top/Bottom all retain the same physical scale.
 if(size.z>size.x)for(const part of bag.children)part.geometry.rotateY(Math.PI/2);
 bounds=new T.Box3().setFromObject(bag);size=bounds.getSize(new T.Vector3());
 const center=bounds.getCenter(new T.Vector3()),scale=3.25/size.y;
 for(const part of bag.children){part.geometry.translate(-center.x,-center.y,-center.z);part.geometry.scale(scale,scale,scale);part.geometry.translate(0,.06,0);part.geometry.computeBoundingBox();part.geometry.computeBoundingSphere();}
 bag.updateMatrixWorld(true);
 return {bag};
}
