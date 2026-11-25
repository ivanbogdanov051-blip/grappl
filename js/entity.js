import * as THREE from 'three';
import { G } from './world.js';

// Ballistic velocity that carries `from` to `to` (gravity G), plus an extra upward "climb boost".
export function launchVelocity(from, to, speed, extraUp, out = new THREE.Vector3()) {
  out.subVectors(to, from);
  const dist = out.length();
  const T = Math.min(3.2, Math.max(0.3, dist / speed));
  out.divideScalar(T);
  out.y += 0.5 * G * T + extraUp;
  return out;
}

// Launch an entity toward a point. With `brake`, it slows down hard when it arrives
// (so a pull lands you at the hook point instead of flinging you past it).
export function launchTo(e, from, to, speed, extraUp, brake) {
  launchVelocity(from, to, speed, extraUp, e.vel);
  e.onGround = false;
  e.pos.y += 0.05;
  if (brake) {
    e.brake = e.brake || { p: new THREE.Vector3(), dx: 0, dz: 0, t: 0 };
    e.brake.p.copy(to);
    e.brake.dx = to.x - from.x; e.brake.dz = to.z - from.z;
    e.brake.t = 4;
    e.braking = true;
  } else e.braking = false;
}

function checkBrake(e, dt) {
  const b = e.brake;
  b.t -= dt;
  const dx = b.p.x - e.pos.x, dy = b.p.y - e.pos.y, dz = b.p.z - e.pos.z;
  const passed = dx * b.dx + dz * b.dz < 0;
  if (dx * dx + dy * dy + dz * dz < 3.5 * 3.5 || passed || b.t <= 0) {
    e.braking = false;
    if (b.t > 0) {
      e.vel.x *= 0.22; e.vel.z *= 0.22;
      if (e.vel.y < 0) e.vel.y *= 0.4;
    }
  }
}

// Gravity + sub-stepped movement with world collision.
export function integrate(e, dt, world) {
  if (e.braking) checkBrake(e, dt);
  e.vel.y -= G * dt;
  if (e.inWater) {
    e.vel.y += G * 1.25 * dt;
    const k = Math.max(0, 1 - 2.2 * dt);
    e.vel.multiplyScalar(k);
  }
  if (e.vel.y < -70) e.vel.y = -70;
  e.hitWall = false;
  const sp = e.vel.length();
  const n = Math.min(10, Math.max(1, Math.ceil((sp * dt) / 0.35)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    e.pos.addScaledVector(e.vel, h);
    world.collide(e);
  }
}

// Wall-climb boost after a hook pull: when you slam into a wall, you scramble up it.
export function wallClimb(e, reach, speed) {
  if (e.hitWall && e.climbT > 0 && e.wallGap < reach) {
    e.vel.y = Math.max(e.vel.y, speed);
    e.vel.x -= e.wallN.x * 4;
    e.vel.z -= e.wallN.z * 4;
  }
}
