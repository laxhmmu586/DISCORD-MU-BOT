const test=require('node:test'),assert=require('node:assert/strict');
test('one suitcase retains identical scale in front/back, left/right and top/bottom projections',async()=>{
 const T=await import('../public/public/vendor/three.module.js'),{createSuitcase}=await import('../public/public/suitcase-model.js');
 const {bag,skinGeometries}=createSuitcase(T);
 const size=(x,y)=>{bag.rotation.set(x,y,0,'YXZ');bag.updateMatrixWorld(true);return new T.Box3().setFromObject(bag).getSize(new T.Vector3());};
 const front=size(0,0),back=size(0,Math.PI),left=size(0,Math.PI/2),right=size(0,-Math.PI/2),top=size(Math.PI/2,0),bottom=size(-Math.PI/2,0);
 const equal=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
 equal(front.x,back.x);equal(front.y,back.y);equal(front.y,left.y);equal(left.x,right.x);equal(left.y,right.y);equal(top.x,bottom.x);equal(top.y,bottom.y);
 for(const geometry of skinGeometries.values())for(const attribute of ['position','normal','uv'])assert([...geometry.attributes[attribute].array].every(Number.isFinite));
});
