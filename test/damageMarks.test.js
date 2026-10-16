const test=require('node:test'),assert=require('node:assert/strict');
async function fixture(){
 const T=await import('../public/public/vendor/three.module.js');
 const {createSuitcase}=await import('../public/public/suitcase-model.js');
 const {createDamageMarks}=await import('../public/public/damage-marks.js');
 globalThis.window={innerWidth:800,innerHeight:600};const source=require('node:fs').readFileSync(require.resolve('../public/public/assets/Baggage.fbx'));const {bag}=await createSuitcase(T,source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength));delete globalThis.window;const camera=new T.PerspectiveCamera(33,4/3,.1,100);
 camera.position.set(0,0,7);camera.updateMatrixWorld();bag.updateMatrixWorld(true);
 const marks=createDamageMarks({bag,canvas:{getBoundingClientRect:()=>({left:0,top:0,width:400,height:300})},getCamera:()=>camera});
 return {T,bag,camera,marks};
}
test('a complete circle may cross the suitcase silhouette and still follows the bag',async()=>{
 const {T,bag,camera,marks}=await fixture(),expected=[];
 for(let i=0;i<=32;i++){
  const angle=i/32*Math.PI*2,point={clientX:260+Math.cos(angle)*40,clientY:130+Math.sin(angle)*40};expected.push(point);marks.paint(point);
 }
 marks.end();const saved=marks.snapshot(),stroke=saved.get('front')[0];assert.equal(stroke.points.length,33);
 for(let i=0;i<stroke.points.length;i++){
  const point=bag.localToWorld(new T.Vector3(...stroke.points[i])).project(camera);
  assert(Math.abs((point.x+1)*200-expected[i].clientX)<.0001);
  assert(Math.abs((1-point.y)*150-expected[i].clientY)<.0001);
 }
 assert(stroke.points.some(point=>point[0]>1),'the outer arc must extend beyond the side shell');
 assert(new T.Vector3(...stroke.points[0]).distanceTo(new T.Vector3(...stroke.points.at(-1)))<.0001,'the loop must close');
 bag.rotation.y=Math.PI;bag.updateMatrixWorld(true);marks.updateVisibility();assert.equal(bag.getObjectByName('Damage annotations').children[0].visible,false);
 assert.deepEqual(marks.snapshot(),saved);bag.rotation.y=0;bag.updateMatrixWorld(true);marks.updateVisibility();assert.equal(bag.getObjectByName('Damage annotations').children[0].visible,true);
 marks.load();assert.equal(marks.snapshot().size,0);marks.load(saved);assert.deepEqual(marks.snapshot(),saved);
});
test('clearing a bag leaves saved marks and other bags isolated',async()=>{
 const {bag,marks}=await fixture();marks.paint({clientX:200,clientY:150});marks.end();const front=marks.snapshot();
 bag.rotation.y=Math.PI;bag.updateMatrixWorld(true);marks.paint({clientX:200,clientY:150});marks.end();
 const both=marks.snapshot();assert.equal(both.size,2);marks.load();assert.equal(marks.snapshot().size,0);assert.equal(both.size,2);
 marks.load(front);marks.paint({clientX:220,clientY:150});marks.end();assert.deepEqual(front,both.has('front')?new Map([['front',both.get('front')]]):null,'saved maps must not share live point arrays');
});
