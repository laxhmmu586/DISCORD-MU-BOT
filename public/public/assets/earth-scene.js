import * as THREE from './vendor/three.module.min.js';

// Self-hosted Three.js and textures: no runtime dependency on a public CDN.
const canvas = document.createElement('canvas');
canvas.className = 'earth-scene';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let renderer, frame, lastFrame = 0, elapsed = 0;
try {
  renderer = new THREE.WebGLRenderer({canvas, alpha:false, antialias:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  camera.position.z = 5.7;
  const loader = new THREE.TextureLoader();
  const [day, night, clouds] = await Promise.all(['earth_atmos_2048.jpg','earth_lights_2048.png','earth_clouds_1024.png'].map(name => loader.loadAsync(new URL(`earth/${name}`,import.meta.url).href)));
  [day,night,clouds].forEach(texture => { texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy()); });
  const sun = new THREE.Vector3(-1,.3,.08).normalize();
  const vertex = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
    void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
  const earthMaterial = new THREE.ShaderMaterial({uniforms:{dayMap:{value:day},nightMap:{value:night},sun:{value:sun}},vertexShader:vertex,fragmentShader:`
    uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sun;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
    void main(){vec3 n=normalize(vNormal);float light=dot(n,sun);float daylight=smoothstep(-.14,.23,light);
      vec3 surface=texture2D(dayMap,vUv).rgb;
      vec3 cities=texture2D(nightMap,vUv).rgb;
      vec3 color=surface*(.045+daylight*(.35+.7*max(light,0.)));
      color+=cities*vec3(1.75,1.15,.62)*(1.-smoothstep(-.18,.12,light))*2.;
      float rim=pow(1.-max(dot(n,normalize(cameraPosition-vWorld)),0.),3.5);
      color+=vec3(.015,.23,.8)*rim*(.3+daylight*.65);
      gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
    }`});
  const globe = new THREE.Group(); scene.add(globe);
  const sphere = new THREE.SphereGeometry(1,96,64);
  const earth = new THREE.Mesh(sphere,earthMaterial); globe.add(earth);
  earth.rotation.set(-.65,-1.25,-.14);
  const cloudMaterial = new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{cloudMap:{value:clouds},sun:{value:sun}},vertexShader:vertex,fragmentShader:`
    uniform sampler2D cloudMap;uniform vec3 sun;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
    void main(){vec4 cloud=texture2D(cloudMap,vUv);float light=smoothstep(-.25,.55,dot(normalize(vNormal),sun));gl_FragColor=vec4(mix(vec3(.025,.055,.13),vec3(.6,.72,.88),light),cloud.r*cloud.a*.42);
    #include <colorspace_fragment>
    }`});
  const cloudMesh = new THREE.Mesh(sphere,cloudMaterial);cloudMesh.scale.setScalar(1.007);cloudMesh.rotation.copy(earth.rotation);globe.add(cloudMesh);
  const atmosphere=new THREE.Mesh(sphere,new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:vertex,fragmentShader:`varying vec3 vNormal;varying vec3 vWorld;void main(){float facing=abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld)));float edge=sin(3.14159*clamp(facing/.25,0.,1.));gl_FragColor=vec4(.035,.34,1.,pow(edge,2.)*.6);}`}));atmosphere.scale.setScalar(1.018);globe.add(atmosphere);
  const skyMaterial=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,uniforms:{aspect:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.999,1.);}`,fragmentShader:`
    varying vec2 vUv;uniform float aspect;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.1+8.;a*=.5;}return n;}
    void main(){vec2 p=vec2(vUv.x*aspect,vUv.y);float band=exp(-pow((p.x/aspect-.68)+(p.y-.55)*.7,2.)*25.);float dust=fbm(p*7.);float wisps=pow(fbm(p*32.+dust*4.),3.);vec3 c=vec3(.0003,.001,.005)+vec3(.002,.025,.18)*band*dust*dust+vec3(.05,.22,.85)*band*wisps;
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`});
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(2,2),skyMaterial);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
  let seed=927;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const starsGeometry=new THREE.BufferGeometry(),positions=[],sizes=[],phases=[];
  for(let i=0;i<3800;i++){positions.push(random()*2-1,random()*2-1,0);sizes.push(random()<.018?7:random()*1.8+.5);phases.push(random()*6.28);}
  starsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));starsGeometry.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));starsGeometry.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  const starsMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},pixelRatio:{value:renderer.getPixelRatio()}},vertexShader:`attribute float size;attribute float phase;uniform float time;uniform float pixelRatio;varying float alpha;void main(){alpha=.45+.35*sin(time*.45+phase);gl_PointSize=size*pixelRatio;gl_Position=vec4(position.xy,.998,1.);}`,fragmentShader:`varying float alpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.5,.73,1.,smoothstep(.5,0.,d)*alpha);}`});
  const stars=new THREE.Points(starsGeometry,starsMaterial);stars.frustumCulled=false;stars.renderOrder=-9;scene.add(stars);
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();skyMaterial.uniforms.aspect.value=w/h;
    const login=document.body.classList.contains('login-orbit');
    globe.scale.setScalar(login&&w>760?2.6:5.4);globe.position.set(login&&w>760?1.55:0,login&&w>760?-.45:-4.45,login&&w>760?0:-3);
  }
  resize();addEventListener('resize',resize);
  function render(now){frame=requestAnimationFrame(render);if(document.hidden||now-lastFrame<33)return;const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;if(!reducedMotion.matches){elapsed+=dt;earth.rotation.y+=dt*.024;cloudMesh.rotation.y+=dt*.027;}starsMaterial.uniforms.time.value=elapsed;renderer.render(scene,camera);canvas.dataset.frames=String(renderer.info.render.frame);canvas.dataset.rotation=earth.rotation.y.toFixed(4);}
  renderer.render(scene,camera);document.body.classList.add('has-earth-scene');canvas.dataset.engine='Three.js WebGL';
  frame=requestAnimationFrame(render);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);document.body.classList.remove('has-earth-scene');});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  addEventListener('pageshow',event=>{if(event.persisted){lastFrame=performance.now();frame=requestAnimationFrame(render);}});
} catch(error) { canvas.remove();renderer?.dispose();console.warn('3D Earth unavailable; using the static fallback.',error); }
