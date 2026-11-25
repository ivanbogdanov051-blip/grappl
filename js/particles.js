import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    this.max = 400;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), this.max);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
  }
  burst(pos, color, n = 12, speed = 8, size = 0.3) {
    for (let i = 0; i < n && this.items.length < this.max; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      const life = 0.6 + Math.random() * 0.7;
      this.items.push({ p: pos.clone(), v, life, max: life, s: size * (0.6 + Math.random() * 0.8), c: new THREE.Color(color) });
    }
  }
  update(dt) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const p = it[i];
      p.life -= dt;
      if (p.life <= 0) { it.splice(i, 1); continue; }
      p.v.y -= 18 * dt;
      p.p.addScaledVector(p.v, dt);
    }
    for (let i = 0; i < it.length; i++) {
      const p = it[i];
      const k = p.s * (p.life / p.max);
      _q.setFromAxisAngle(p.v, p.life * 6);
      _m.compose(p.p, _q.normalize(), _s.set(k, k, k));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, p.c);
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
