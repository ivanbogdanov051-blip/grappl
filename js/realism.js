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

// Adds world-space surface detail (grain, speckle, strata) to a vertex-coloured material.
export function applyDetail(mat, strength = 0.45) {
  const tex = getDetailTexture();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: tex };
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uDetail;\nvarying vec3 vWPos;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float d1 = texture2D(uDetail, vWPos.xz * 0.11).r;
        float d2 = texture2D(uDetail, vWPos.xz * 0.53).r;
        float d3 = texture2D(uDetail, vec2(vWPos.x + vWPos.z, vWPos.y * 2.5) * 0.05).r;
        float d = mix(d1 * 0.55 + d2 * 0.45, d3, 0.35);
        diffuseColor.rgb *= 1.0 + (d - 0.5) * ${strength.toFixed(2)} * 2.0;
      }`);
  };
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
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix[3];
          float sw = sin(uTime * 2.2 + ip.x * 0.35 + ip.z * 0.27) * 0.16 + sin(uTime * 4.1 + ip.x * 0.9 + ip.z * 0.4) * 0.05;
          float k = uv.y;
          transformed.x += sw * k; transformed.z += sw * 0.5 * k;
          float dist = distance(ip.xz, cameraPosition.xz);
          transformed *= smoothstep(150.0, 105.0, dist);
        }`);
    };
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
