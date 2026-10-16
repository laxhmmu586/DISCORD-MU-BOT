const test=require('node:test'),assert=require('node:assert/strict');
test('one suitcase retains identical scale in front/back, left/right and top/bottom projections',async()=>{
 const T=await import('../public/public/vendor/three.module.js'),{createSuitcase}=await import('../public/public/suitcase-model.js');
 globalThis.window={innerWidth:800,innerHeight:600};const source=require('node:fs').readFileSync(require.resolve('../public/public/assets/Baggage.fbx'));const {bag}=await createSuitcase(T,source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength));delete globalThis.window;
 const size=(x,y)=>{bag.rotation.set(x,y,0,'YXZ');bag.updateMatrixWorld(true);return new T.Box3().setFromObject(bag).getSize(new T.Vector3());};
 const front=size(0,0),back=size(0,Math.PI),left=size(0,Math.PI/2),right=size(0,-Math.PI/2),top=size(Math.PI/2,0),bottom=size(-Math.PI/2,0);
 const equal=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
 equal(front.x,back.x);equal(front.y,back.y);equal(front.y,left.y);equal(left.x,right.x);equal(left.y,right.y);equal(top.x,bottom.x);equal(top.y,bottom.y);
 equal(front.y,3.25);assert(left.x/front.x>.5&&left.x/front.x<.9,'the supplied suitcase depth must be preserved');
 const materials=bag.children.flatMap(part=>Array.isArray(part.material)?part.material:[part.material]);
 assert(materials.some(material=>material.name==='Material.001'&&material.color.getHex()===0xbfc5cb));
 assert(materials.some(material=>material.name==='Material.003'&&material.color.getHex()===0x20262d));
 assert.equal(bag.name,'Baggage.fbx');assert(bag.children.some(part=>part.geometry.attributes.position.count>100000));assert(!bag.children.some(part=>part.name==='Plane'));for(const part of bag.children)for(const attribute of ['position','normal','uv'])assert([...part.geometry.attributes[attribute].array].every(Number.isFinite));
});
