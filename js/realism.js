import * as THREE from 'three';

// ---------------------------------------------------------------- detail texture (tileable noise)
let detailTex = null;
export function getDetailTexture() {
  if (detailTex) return detailTex;
  const S = 256;
  const a = new Float32Array(S * S);
  for (let i = 0; i < a.length; i++) a[i] = Math.random();
  const blur = (src, r) => {
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += src[((y + dy + S) % S) * S + ((x + dx + S) % S)]; n++; }
      out[y * S + x] = s / n;
    }
    return out;
  };
  const b1 = blur(a, 1), b2 = blur(a, 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(1, 0.5 + (b1[i] - 0.5) * 1.6 + (b2[i] - 0.5) * 4));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  detailTex = new THREE.CanvasTexture(cv);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.anisotropy = 4;
  return detailTex;
}

// Dug holes: spheres of removed ground. Terrain (and grass) inside them is cut away in the shader,
// and every hole gets a dirt "bowl" mesh. The nearest MAX_HOLES are sent to the GPU.
export const MAX_HOLES = 24;
export const HOLES = { list: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, -1e5, 0, 0)) }, n: { value: 0 } };
const HOLE_GLSL = `uniform vec4 uHoles[${MAX_HOLES}]; uniform int uHoleN;`;
const holeTest = (p, k) => `for (int i = 0; i < ${MAX_HOLES}; i++) { if (i >= uHoleN) break; vec4 hh = uHoles[i]; if (${p}.y < hh.y + 0.02 && distance(${p}, hh.xyz) < hh.w * ${k}) discard; }`;

// Adds world-space surface detail to a vertex-coloured material:
//  - colour grain + speckle + strata
//  - matching bump (so light catches the grain: much more "real" than flat colour)
//  - optional procedural bricks / planks / roof shingles chosen by a per-vertex `surf` attribute
//  - optional cut-outs where the ground has been dug away
export function applyDetail(mat, strength = 0.45, o = {}) {
  const tex = getDetailTexture();
  const bump = o.bump ?? 1, bricks = !!o.bricks, holes = !!o.holes, holeK = o.holeK || 0.97;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: tex };
    if (holes) { sh.uniforms.uHoles = HOLES.list; sh.uniforms.uHoleN = HOLES.n; }
    sh.vertexShader = `varying vec3 vWPos; varying vec3 vWN;${bricks ? ' attribute float surf; varying float vSurf;' : ''}\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = normalize(mat3(modelMatrix) * objectNormal);${bricks ? '\n      vSurf = surf;' : ''}`);
    sh.fragmentShader = `uniform sampler2D uDetail; varying vec3 vWPos; varying vec3 vWN;${bricks ? ' varying float vSurf;' : ''}${holes ? HOLE_GLSL : ''}
      float dHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float gHeight = 0.0;\n` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      ${holes ? holeTest('vWPos', holeK.toFixed(3)) : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 an = abs(vWN);
        vec2 pq = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
        float d1 = texture2D(uDetail, pq * 0.11).r;
        float d2 = texture2D(uDetail, pq * 0.53).r;
        float d3 = texture2D(uDetail, vec2(vWPos.x + vWPos.z, vWPos.y * 2.5) * 0.05).r;
        float d = mix(d1 * 0.55 + d2 * 0.45, d3, 0.35);
        diffuseColor.rgb *= 1.0 + (d - 0.5) * ${strength.toFixed(2)} * 2.0;
        gHeight = d1 * 0.09 + d2 * 0.018;
        ${bricks ? `
        if (vSurf > 0.5) {
          float groove = 0.0;
          if (vSurf < 1.5) {            // stone blocks 1.0 x 0.5 m, every other row shifted
            vec2 b = pq / vec2(1.0, 0.5); b.x += 0.5 * floor(b.y);
            vec2 f = fract(b), e = min(f, 1.0 - f) * vec2(1.0, 0.5);
            groove = 1.0 - smoothstep(0.018, 0.04, min(e.x, e.y));
            diffuseColor.rgb *= 0.86 + 0.26 * dHash(floor(b));
          } else if (vSurf < 2.5) {     // planks, 0.28 m wide
            float y = (an.y > 0.6 ? pq.x : pq.y) / 0.28;
            float f = fract(y), e = min(f, 1.0 - f) * 0.28;
            groove = 1.0 - smoothstep(0.006, 0.018, e);
            float grain = texture2D(uDetail, vec2((an.y > 0.6 ? pq.y : pq.x) * 0.06, y * 0.9)).r;
            diffuseColor.rgb *= (0.82 + 0.3 * dHash(vec2(floor(y), 3.0))) * (0.9 + grain * 0.2);
          } else {                      // roof shingles, 0.45 m rows (no bump: it sparkles on slopes)
            gHeight = 0.0;
            float y = vWPos.y / 0.45; vec2 b = vec2((vWPos.x + vWPos.z) / 0.8 + 0.5 * floor(y), y);
            vec2 f = fract(b);
            groove = max(1.0 - smoothstep(0.0, 0.14, f.y), 1.0 - smoothstep(0.0, 0.06, min(f.x, 1.0 - f.x)));
            diffuseColor.rgb *= 1.0 + (dHash(floor(b)) - 0.5) * 0.2 * smoothstep(26.0, 8.0, length(vViewPosition));
          }
          // fine lines shimmer far away: fade them out with distance
          groove *= smoothstep(vSurf > 2.5 ? 40.0 : 90.0, vSurf > 2.5 ? 12.0 : 25.0, length(vViewPosition));
          diffuseColor.rgb *= 1.0 - groove * 0.42;
          if (vSurf < 2.5) gHeight -= groove * 0.02;
        }` : ''}
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float fade = ${bump.toFixed(2)} * smoothstep(38.0, 8.0, length(vViewPosition));
        if (fade > 0.001) {
          vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp);
          vec2 dh = vec2(dFdx(gHeight), dFdy(gHeight)) * fade;
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad);
        }
      }`);
  };
  mat.customProgramCacheKey = () => `detail-${strength}-${bump}-${bricks}-${holes}-${holeK}`;
  mat.needsUpdate = true;
  return mat;
}

// Wind sway for instanced foliage (uses each instance's world position as phase).
export function applyWind(mat, uTime, amount, heightOffset = 0) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      {
        vec4 ip = instanceMatrix[3];
        float h = max(position.y + ${heightOffset.toFixed(2)}, 0.0);
        float sw = sin(uTime * 1.6 + ip.x * 0.31 + ip.z * 0.23) * ${amount.toFixed(3)} + sin(uTime * 3.1 + ip.x * 0.7) * ${(amount * 0.35).toFixed(3)};
        transformed.x += sw * h;
        transformed.z += sw * 0.6 * h;
      }
      #endif`);
  };
  mat.needsUpdate = true;
  return mat;
}

// ---------------------------------------------------------------- grass
function bladeTexture() {
  const W = 64, H = 64;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 4 + Math.random() * (W - 8), w = 2 + Math.random() * 3, h = H * (0.45 + Math.random() * 0.55);
    const lean = (Math.random() - 0.5) * 14;
    const g = ctx.createLinearGradient(0, H, 0, H - h);
    const l = 30 + Math.random() * 18;
    g.addColorStop(0, `hsl(95, 45%, ${l - 14}%)`);
    g.addColorStop(1, `hsl(${80 + Math.random() * 20}, 55%, ${l + 10}%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, H);
    ctx.quadraticCurveTo(x + lean * 0.3, H - h * 0.5, x + lean, H - h);
    ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.3, H - h * 0.5, x + w, H);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Grass {
  constructor(scene, world, hi) {
    this.scene = scene; this.world = world;
    this.density = hi ? 0.2 : 0.09;
    this.cap = hi ? 7000 : 2500;
    this.built = new Map();
    this.uTime = { value: 0 };
    const planes = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.PlaneGeometry(1.1, 0.75);
      p.translate(0, 0.375, 0);
      p.rotateY((i / 3) * Math.PI);
      planes.push(p);
    }
    // merge the three crossed planes by hand (keeps the uv attribute)
    const pos = [], uv = [], idx = [];
    let off = 0;
    for (const p of planes) {
      pos.push(...p.attributes.position.array);
      uv.push(...p.attributes.uv.array);
      for (const k of p.index.array) idx.push(k + off);
      off += p.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const nrm = new Float32Array(off * 3);
    for (let i = 0; i < off; i++) nrm[i * 3 + 1] = 1; // lit like the ground below
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(idx);
    this.geo = g;
    const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    const uTime = this.uTime;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uHoles = HOLES.list; sh.uniforms.uHoleN = HOLES.n;
      sh.vertexShader = 'uniform float uTime;\n' + HOLE_GLSL + '\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix[3];
          for (int i = 0; i < ${MAX_HOLES}; i++) { if (i >= uHoleN) break; if (ip.y < uHoles[i].y + 0.5 && distance(ip.xyz, uHoles[i].xyz) < uHoles[i].w * 1.05) transformed *= 0.0; }
          float sw = sin(uTime * 2.2 + ip.x * 0.35 + ip.z * 0.27) * 0.16 + sin(uTime * 4.1 + ip.x * 0.9 + ip.z * 0.4) * 0.05;
          float k = uv.y;
          transformed.x += sw * k; transformed.z += sw * 0.5 * k;
          float dist = distance(ip.xz, cameraPosition.xz);
          transformed *= smoothstep(150.0, 105.0, dist);
        }`);
    };
    mat.customProgramCacheKey = () => 'grass-holes';
    this.mat = mat;
  }
  update(focus, dt) {
    this.uTime.value += dt;
    const C = 240;
    const cx = Math.round(focus.x / C), cz = Math.round(focus.z / C);
    const need = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) need.add((cx + dx) + ',' + (cz + dz));
    for (const [k, m] of this.built) if (!need.has(k)) { this.scene.remove(m); m.dispose(); this.built.delete(k); }
    for (const k of need) {
      if (this.built.has(k)) continue;
      const [a, b] = k.split(',').map(Number);
      this.built.set(k, this.build(a, b));
      break; // one chunk per frame
    }
  }
  build(cx, cz) {
    const data = this.world.getData(cx, cz);
    const pts = [];
    for (const I of data.islands) {
      if (I.kind === 'rock') continue;
      const n = Math.min(this.cap - pts.length, Math.floor(Math.PI * I.R * I.R * this.density));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, t = Math.sqrt(Math.random()) * 0.93;
        const p = I.pointAt(a, t);
        if (I.lake && p.y < I.lake.level + 0.5) continue;
        if (I.kind === 'spawn' && Math.abs(p.x - I.x) < 13.5 && Math.abs(p.z - I.z) < 13.5) continue;
        let inside = false;
        for (const bx of I.boxes) if (Math.abs(p.x - bx.x) < bx.sx / 2 && Math.abs(p.z - bx.z) < bx.sz / 2 && bx.y - bx.sy / 2 < p.y + 1) { inside = true; break; }
        if (!inside) pts.push(p);
      }
    }
    const m = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, pts.length));
    m.count = pts.length;
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    pts.forEach((p, i) => {
      q.setFromAxisAngle(up, Math.random() * Math.PI);
      const k = 0.7 + Math.random() * 0.8;
      mt.compose(p.setY(p.y - 0.05), q, s.set(k, k * (0.8 + Math.random() * 0.5), k));
      m.setMatrixAt(i, mt);
      m.setColorAt(i, c.setHSL(0.22 + Math.random() * 0.06, 0.5, 0.42 + Math.random() * 0.2, THREE.SRGBColorSpace));
    });
    m.frustumCulled = false;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
}

// ---------------------------------------------------------------- floating dust / pollen in the sunlight
export class Dust {
  constructor(scene, n = 350) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 60; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = Math.random() * 60; seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.u = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime; uniform vec3 uCam; varying float vA;
        void main(){
          vec3 p = position + vec3(sin(uTime*0.3+seed)*2.0 + uTime*0.6, sin(uTime*0.4+seed*1.7)*1.5, cos(uTime*0.25+seed)*2.0);
          p.xz = uCam.xz + mod(p.xz - uCam.xz + 30.0, 60.0) - 30.0;
          p.y = uCam.y + mod(p.y - uCam.y + 15.0, 30.0) - 15.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = smoothstep(30.0, 8.0, d) * smoothstep(0.5, 2.0, d) * (0.5 + 0.5*sin(uTime*2.0+seed*3.0));
          gl_PointSize = 70.0 / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA;
        void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(1.0, 0.95, 0.8, vA * (1.0 - r*2.0) * 0.55); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(cam, t) { this.u.uTime.value = t; this.u.uCam.value.copy(cam.position); }
}
