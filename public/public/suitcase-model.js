// Original aluminum spinner suitcase. Shared shell geometry also carries UV ink.
export function createSuitcase(T){
 const bag=new T.Group(),skinGeometries=new Map();
 const aluminum=new T.MeshPhysicalMaterial({color:0xa4a9ae,metalness:1,roughness:.26,clearcoat:.04,clearcoatRoughness:.3,envMapIntensity:.7});
 const chrome=new T.MeshStandardMaterial({color:0xcdd1d5,metalness:1,roughness:.17});
 const rubber=new T.MeshStandardMaterial({color:0x151719,roughness:.88,metalness:0});
 const graphite=new T.MeshStandardMaterial({color:0x3b3e41,roughness:.55,metalness:.25});
 function mesh(geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;bag.add(m);return m;}
 function roundedBox(w,h,d,r,material,x=0,y=0,z=0){const shape=new T.Shape(),a=w/2,b=h/2;r=Math.min(r,a-.001,b-.001);shape.moveTo(-a+r,-b);shape.lineTo(a-r,-b);shape.quadraticCurveTo(a,-b,a,-b+r);shape.lineTo(a,b-r);shape.quadraticCurveTo(a,b,a-r,b);shape.lineTo(-a+r,b);shape.quadraticCurveTo(-a,b,-a,b-r);shape.lineTo(-a,-b+r);shape.quadraticCurveTo(-a,-b,-a+r,-b);const geo=new T.ExtrudeGeometry(shape,{depth:d,steps:1,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:4,curveSegments:12});geo.translate(0,0,-d/2);return mesh(geo,material,x,y,z);}
 function tube(points,r,material,closed=false){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed),closed?100:32,r,8,closed),material);}
 // A gently crowned shell with continuous, recessed flutes rather than flat ribs.
 roundedBox(1.68,2.46,.71,.18,aluminum);
 roundedBox(1.7,2.43,.055,.18,rubber);
 for(const sign of [1,-1]){
  const nx=192,ny=64,vertices=[],uv=[],indices=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
   const u=i/nx,v=j/ny,y=(v*2-1)*1.23,dy=Math.max(0,Math.abs(y)-1.05),half=.66+Math.sqrt(Math.max(0,.18*.18-dy*dy));
   const x=(u*2-1)*half,crown=Math.pow(Math.max(0,1-Math.pow(x/.86,4)),.5)*Math.max(0,1-Math.pow(y/1.25,6));
   const taper=Math.min(1,Math.max(0,(1.16-Math.abs(y))/.13))*Math.min(1,Math.max(0,(.78-Math.abs(x))/.12));
   const flute=Math.pow((Math.cos(x/.097*Math.PI*2)+1)/2,3);
   const z=sign*(.369+.055*crown-.027*flute*taper);
   vertices.push(sign===1?x:-x,y,z);uv.push(u,v);
   if(i<nx&&j<ny){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,b,d,a,d,c);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  mesh(geo,aluminum);const inkGeo=geo.clone(),p=inkGeo.attributes.position,n=inkGeo.attributes.normal;for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*.004,p.getY(i)+n.getY(i)*.004,p.getZ(i)+n.getZ(i)*.004);skinGeometries.set(sign===1?'front':'back',inkGeo);
  for(const x of [-.69,.69]){
   // Small metal corner caps and dark lower impact guards, with real fasteners.
   roundedBox(.2,.18,.028,.055,aluminum,x,1.12,sign*.385);
   roundedBox(.23,.19,.045,.055,rubber,x,-1.13,sign*.392);
   for(const y of [-1.13,1.12])mesh(new T.SphereGeometry(.014,12,8),chrome,x,y,sign*.425);
  }
 }
 // Separate rounded side-shell halves meet at the central frame and gasket.
 for(const sign of [-1,1]){
  for(const z of [-.195,.195]){
   const panel=roundedBox(.315,2.25,.026,.11,aluminum,sign*.852,0,z);
   panel.rotation.y=sign*Math.PI/2;
  }
  for(const y of [-1.08,1.08]){
   const cap=roundedBox(.68,.12,.035,.035,y<0?rubber:chrome,sign*.855,y,0);
   cap.rotation.y=sign*Math.PI/2;
  }
 }
 const lock=roundedBox(.22,.18,.055,.035,graphite,.89,.73,.12);lock.rotation.y=Math.PI/2;
 for(const z of [.055,.105,.155]){
  const dial=mesh(new T.CylinderGeometry(.02,.02,.014,12),chrome,.925,.74,z);
  dial.rotation.z=Math.PI/2;
 }
 // Telescoping rails, molded grip, top carry handle and flexible side handle.
 for(const x of [-.25,.25])roundedBox(.042,.49,.042,.015,chrome,x,1.43,-.05);
 roundedBox(.64,.092,.12,.04,rubber,0,1.68,-.05);
 tube([[-.24,1.27,.16],[-.22,1.34,.16],[.22,1.34,.16],[.24,1.27,.16]],.036,rubber);
 tube([[.86,-.27,0],[.94,-.23,0],[.955,.22,0],[.86,.28,0]],.034,rubber);
 for(const y of [-.58,.64])roundedBox(.067,.17,.16,.025,graphite,.865,y,.02);
 // Four twin-wheel swivel casters with metal yokes and inset hubs.
 for(const x of [-.64,.64])for(const z of [-.265,.265]){
  mesh(new T.CylinderGeometry(.052,.06,.14,16),chrome,x,-1.29,z);
  roundedBox(.13,.16,.12,.025,graphite,x,-1.36,z);
  for(const offset of [-.055,.055]){
   const wheel=mesh(new T.CylinderGeometry(.125,.125,.07,24),rubber,x,-1.445,z+offset);wheel.rotation.x=Math.PI/2;
   const hub=mesh(new T.CylinderGeometry(.045,.045,.074,20),graphite,x,-1.445,z+offset);hub.rotation.x=Math.PI/2;
  }
 }
 return {bag,skinGeometries};
}
