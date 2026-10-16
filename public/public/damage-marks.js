import * as T from './vendor/three.module.js';

// Strokes live in suitcase coordinates, including the part of a circle outside
// the silhouette. They rotate with the bag instead of being clipped to six UV maps.
export function createDamageMarks({bag,canvas,getCamera}){
 const root=new T.Group();root.name='Damage annotations';
 const targets=[];bag.traverse(object=>{if(object.isMesh)targets.push(object);});
 bag.add(root);
 const material=new T.MeshBasicMaterial({color:0xef3439,depthTest:false,depthWrite:false});
 const ray=new T.Raycaster(),pointer=new T.Vector2();
 const strokes=[];let current=null,plane=null;
 const clone=stroke=>({normal:[...stroke.normal],points:stroke.points.map(point=>[...point])});
 const vector=point=>new T.Vector3(...point);
 function prepareRay(event){
  const rect=canvas.getBoundingClientRect();
  pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(pointer,getCamera());
 }
 function facing(){return getCamera().getWorldDirection(new T.Vector3()).negate().transformDirection(new T.Matrix4().copy(bag.matrixWorld).invert());}
 function face(normal){
  const [x,y,z]=normal,a=[Math.abs(x),Math.abs(y),Math.abs(z)],axis=a.indexOf(Math.max(...a));
  return axis===0?(x>0?'right':'left'):axis===1?(y>0?'top':'bottom'):(z>0?'front':'back');
 }
 function disposeMesh(mesh){mesh.geometry.dispose();root.remove(mesh);}
 function rebuild(stroke){
  if(stroke.mesh)disposeMesh(stroke.mesh);
  const points=stroke.points.map(vector);
  const geometry=points.length<2?new T.SphereGeometry(.013,8,6):new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),Math.max(8,points.length*2),.013,6,false);
  const mesh=new T.Mesh(geometry,material);mesh.renderOrder=100;
  if(points.length===1)mesh.position.copy(points[0]);
  stroke.mesh=mesh;root.add(mesh);
 }
 function begin(event){
  bag.updateMatrixWorld(true);prepareRay(event);
  const hit=ray.intersectObjects(targets,false)[0];
  let anchor=hit?.point.clone();
  if(!anchor){
   const center=bag.localToWorld(new T.Vector3()).project(getCamera());
   ray.setFromCamera(new T.Vector2(center.x,center.y),getCamera());
   anchor=ray.intersectObjects(targets,false)[0]?.point.clone()||bag.localToWorld(new T.Vector3());
  }
  const normal=getCamera().getWorldDirection(new T.Vector3()).negate();
  plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,anchor);
  current={normal:facing().toArray(),points:[]};strokes.push(current);
 }
 function paint(event){
  if(!current)begin(event);
  prepareRay(event);
  // Keep one circle on its anchored drawing plane. Switching between shell,
  // handle and background depths mid-stroke would kink the loop in side views.
  const position=ray.ray.intersectPlane(plane,new T.Vector3());
  if(!position)return;
  const point=bag.worldToLocal(position);
  const last=current.points.at(-1);
  if(last&&vector(last).distanceToSquared(point)<.000005)return;
  current.points.push(point.toArray());rebuild(current);
 }
 function end(){if(current&&!current.points.length)strokes.splice(strokes.indexOf(current),1);current=null;plane=null;}
 function visible(stroke){return vector(stroke.normal).dot(facing())>.05;}
 function updateVisibility(){for(const stroke of strokes)if(stroke.mesh)stroke.mesh.visible=visible(stroke);}
 function snapshot(){
  const result=new Map();
  for(const stroke of strokes)if(stroke.points.length){const key=face(stroke.normal);if(!result.has(key))result.set(key,[]);result.get(key).push(clone(stroke));}
  return result;
 }
 function load(data=new Map()){
  end();for(const stroke of strokes)if(stroke.mesh)disposeMesh(stroke.mesh);strokes.length=0;
  for(const entries of data.values())for(const entry of entries){const stroke=clone(entry);strokes.push(stroke);rebuild(stroke);}
  updateVisibility();
 }
 function extent(){
  let result=1.95;
  for(const stroke of strokes)for(const point of stroke.points)for(const value of point)result=Math.max(result,Math.abs(value)+.15);
  return result;
 }
 return {paint,end,snapshot,load,updateVisibility,extent};
}
