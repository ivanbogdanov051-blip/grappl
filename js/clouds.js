import * as THREE from 'three';

const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
`;

const seaVert = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;

function seaFrag(alpha) {
  return NOISE + /* glsl */ `
uniform float uTime; uniform vec3 uCam; uniform vec3 uFog; uniform float uScale; uniform float uOff;
varying vec3 vW;
void main(){
  vec2 p = vW.xz*uScale + vec2(uTime*0.006 + uOff, uTime*0.002);
  float n = fbm(p);
  float n2 = fbm(p*3.1 - uTime*0.01);
  float c = smoothstep(0.25, 0.85, n*0.75 + n2*0.35);
  vec3 col = mix(vec3(0.60,0.68,0.80), vec3(1.0), c);
  float dist = length(vW.xz - uCam.xz);
  col = mix(col, uFog, smoothstep(500., 3300., dist));
  float a = ${alpha ? 'smoothstep(0.48, 0.78, n*0.8 + n2*0.3) * 0.9 * (1.0 - smoothstep(1800., 3300., dist))' : '1.0'};
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
}

const puffVert = /* glsl */ `
attribute vec3 iOffset; attribute float iScale;
uniform vec3 uCam; uniform float uWrap; uniform float uTime;
varying vec2 vUv; varying float vA; varying float vDist; varying float vY;
void main(){
  vec3 p = iOffset; p.x += uTime * 2.0;
  p.xz = uCam.xz + mod(p.xz - uCam.xz + 0.5*uWrap, uWrap) - 0.5*uWrap;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * vec2(iScale * 1.6, iScale);
  float d = -mv.z;
  float horiz = length(p.xz - uCam.xz);
  vA = smoothstep(iScale*0.35, iScale*1.4, d) * (1.0 - smoothstep(uWrap*0.3, uWrap*0.48, horiz));
  vUv = uv; vDist = horiz; vY = position.y;
  gl_Position = projectionMatrix * mv;
}`;
const puffFrag = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uFog; uniform float uFogFar;
varying vec2 vUv; varying float vA; varying float vDist; varying float vY;
void main(){
  float a = texture2D(uTex, vUv).a * vA;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.72,0.77,0.87), vec3(1.0), smoothstep(-0.5, 0.35, vY));
  col = mix(col, uFog, smoothstep(uFogFar*0.35, uFogFar*1.1, vDist) * 0.85);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function puffTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.45, y = S / 2 + (Math.random() - 0.5) * S * 0.28;
    const r = S * (0.12 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(cv);
}

export class Clouds {
  constructor(scene, hi, fogColor, fogFar) {
    const fog = new THREE.Color(fogColor);
    this.u = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFog: { value: fog }, uScale: { value: 0.0035 }, uOff: { value: 0 } };
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: seaVert, fragmentShader: seaFrag(false), side: THREE.DoubleSide }));
    this.sea.position.y = -178;
    this.sea.frustumCulled = false;
    scene.add(this.sea);
    const u2 = { ...this.u, uScale: { value: 0.006 }, uOff: { value: 37.0 } };
    this.layer = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u2, vertexShader: seaVert, fragmentShader: seaFrag(true), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.layer.position.y = -150;
    this.layer.frustumCulled = false;
    this.layer.renderOrder = 3;
    scene.add(this.layer);

    // billboard puffs (wrapped around the camera in the vertex shader -> infinite)
    const N = hi ? 520 : 260, wrap = 3600;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const off = new Float32Array(N * 3), sc = new Float32Array(N);
    let i = 0;
    while (i < N) {
      const cx = Math.random() * wrap, cz = Math.random() * wrap;
      const low = Math.random() < 0.6;
      const cy = low ? -150 + Math.random() * 55 : -60 + Math.random() * 260;
      const k = 3 + Math.floor(Math.random() * 6);
      const big = low ? 1.4 : 1;
      for (let j = 0; j < k && i < N; j++, i++) {
        off[i * 3] = cx + (Math.random() - 0.5) * 120 * big;
        off[i * 3 + 1] = cy + (Math.random() - 0.5) * 18;
        off[i * 3 + 2] = cz + (Math.random() - 0.5) * 120 * big;
        sc[i] = (30 + Math.random() * 60) * big;
      }
    }
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute('iScale', new THREE.InstancedBufferAttribute(sc, 1));
    g.instanceCount = N;
    this.pu = { uTime: this.u.uTime, uCam: this.u.uCam, uWrap: { value: wrap }, uTex: { value: puffTexture() }, uFog: { value: fog }, uFogFar: { value: fogFar } };
    this.puffs = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.pu, vertexShader: puffVert, fragmentShader: puffFrag, transparent: true, depthWrite: false }));
    this.puffs.frustumCulled = false;
    this.puffs.renderOrder = 4;
    scene.add(this.puffs);
  }
  update(cam, time) {
    this.u.uTime.value = time;
    this.u.uCam.value.copy(cam.position);
    this.sea.position.x = this.layer.position.x = cam.position.x;
    this.sea.position.z = this.layer.position.z = cam.position.z;
  }
}
