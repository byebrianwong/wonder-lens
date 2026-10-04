import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { Rng, TAU, clamp, smoothstep } from '../../../engine/math';
import { envelope } from '../../../engine/Rig';

/*
 * Soot sprites (susuwatari): fuzzy black balls with big white eyes. A stream of them drifts out of the old
 * house's windows at midnight and away on the wind towards the moon (one instanced mesh per part, so the
 * whole swarm is three draw calls). One of them hops onto the Catbus as you board and rides behind you
 * for the rest of the night.
 */

/** A ball covered in thin spikes; every vertex uses the outward direction as its normal, so it shades as one soft ball. */
function fuzzBall(r: number, spikes: number, rng: Rng) {
  const core = new THREE.IcosahedronGeometry(r, 2);
  core.deleteAttribute('uv');
  const pos: number[] = [], nrm: number[] = [];
  const d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < spikes; i++) {
    d.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    if (d.lengthSq() < 0.01) continue;
    d.normalize();
    a.set(d.y, d.z, d.x).cross(d).normalize();
    b.crossVectors(d, a);
    const w = r * 0.14, L = r + rng.range(0.04, 0.14) * (r / 0.24);
    const base = [0, 1, 2].map((k) => { const t = (k / 3) * TAU; return d.clone().multiplyScalar(r * 0.9).addScaledVector(a, Math.cos(t) * w).addScaledVector(b, Math.sin(t) * w); });
    const tip = d.clone().multiplyScalar(L);
    for (let k = 0; k < 3; k++) for (const v of [base[k], base[(k + 1) % 3], tip]) { pos.push(v.x, v.y, v.z); nrm.push(d.x, d.y, d.z); }
  }
  const fuzz = new THREE.BufferGeometry();
  fuzz.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fuzz.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return mergeGeometries([core, fuzz])!;
}

export function sootMaterials() {
  return {
    black: charToon({ color: 0x17181f, rim: 0.5, shade: 0x8088a8, side: THREE.DoubleSide }),
    white: charToon({ color: 0xf6f4ec, rim: 0.1, emissive: 0x2a2a30 }),
    pupil: charToon({ color: 0x101014, rim: 0 }),
  };
}

const BODY = fuzzBall(0.26, 170, new Rng(17));
const EYE = new THREE.SphereGeometry(0.1, 10, 8).scale(1, 1, 0.6);
const PUPIL = new THREE.SphereGeometry(0.048, 8, 6).scale(1, 1, 0.5);
/** where the eyes sit on a sprite facing +z */
const EYES = [new THREE.Vector3(-0.1, 0.06, 0.21), new THREE.Vector3(0.1, 0.06, 0.21)];

export interface SootSwarm {
  group: THREE.Group;
  /** moves to the middle of the swarm each frame (the photo subject's group) */
  anchor: THREE.Object3D;
  update(t: number, dt: number, camPos: THREE.Vector3): void;
  /** they whirl round and jump (the ocarina) */
  swirl(): void;
  /** they scatter from a point (an acorn) */
  scatter(p: THREE.Vector3): void;
  /** 0..1: shrinks them all (they dwindle away) */
  fade: number;
}

/**
 * A stream of soot sprites leaving the house: each comes out of one of `windows` (world points just
 * inside), drifts out, rises and floats off along `wind`, getting smaller in the distance, then starts
 * again inside the house. They always turn their eyes to the camera.
 */
export function buildSootSwarm(windows: THREE.Vector3[], houseCentre: THREE.Vector3, wind: THREE.Vector3, count: number): SootSwarm {
  const group = new THREE.Group();
  const m = sootMaterials();
  const body = new THREE.InstancedMesh(BODY, m.black, count);
  const eyes = new THREE.InstancedMesh(EYE, m.white, count * 2);
  const pupils = new THREE.InstancedMesh(PUPIL, m.pupil, count * 2);
  for (const im of [body, eyes, pupils]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(im); }
  const anchor = new THREE.Object3D();
  group.add(anchor);
  const rng = new Rng(9090);
  const W = wind.clone().normalize();
  const sprites = Array.from({ length: count }, (_, i) => {
    const w = windows[i % windows.length];
    const out = w.clone().sub(houseCentre).setY(0).normalize();
    return { w, out, phase: rng.range(0, 1), size: rng.range(1.1, 1.8), wob: rng.range(0, TAU), spin: rng.range(-1, 1), dist: rng.range(130, 190) };
  });
  const PERIOD = 26;
  let swirlT = -1, scatterT = -1;
  const scatterP = new THREE.Vector3();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), mtx = new THREE.Matrix4(), e = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const sum = new THREE.Vector3();
  const swarm: SootSwarm = {
    group, anchor, fade: 1,
    swirl() { swirlT = 0; },
    scatter(pt) { scatterT = 0; scatterP.copy(pt); },
    update(t, dt, camPos) {
      if (swirlT >= 0) { swirlT += dt; if (swirlT > 3.2) swirlT = -1; }
      if (scatterT >= 0) { scatterT += dt; if (scatterT > 3) scatterT = -1; }
      const sw = swirlT >= 0 ? envelope(swirlT, 0, 0.4, 2.4, 3.2) : 0;
      const sc = scatterT >= 0 ? envelope(scatterT, 0, 0.25, 1.2, 3) : 0;
      sum.set(0, 0, 0);
      let n = 0;
      sprites.forEach((sp, i) => {
        const k = ((t / PERIOD + sp.phase) % 1 + 1) % 1;
        // out through the window, then up and away on the wind
        const outK = smoothstep(0, 0.08, k);
        const far = Math.pow(clamp((k - 0.04) / 0.96, 0, 1), 1.5) * sp.dist;
        p.copy(sp.w).addScaledVector(sp.out, outK * 2.5).addScaledVector(W, far);
        p.y += Math.sin(t * 1.3 + sp.wob) * 0.4 + far * 0.08;
        p.x += Math.sin(t * 0.9 + sp.wob * 2) * (0.5 + far * 0.03);
        p.z += Math.cos(t * 0.7 + sp.wob) * (0.5 + far * 0.03);
        if (sw > 0) { const a = t * 4 + i; p.x += Math.cos(a) * 1.6 * sw; p.z += Math.sin(a) * 1.6 * sw; p.y += Math.abs(Math.sin(t * 7 + i)) * 1.2 * sw; }
        if (sc > 0) { e.copy(p).sub(scatterP); const d = e.length(); if (d < 14) p.addScaledVector(e.normalize(), (14 - d) * 0.5 * sc); }
        const size = Math.max(0.001, sp.size * (1 - smoothstep(0.82, 1, k)) * (1 + Math.sin(t * 9 + sp.wob) * 0.04) * swarm.fade);
        q.setFromAxisAngle(yAxis, Math.atan2(camPos.x - p.x, camPos.z - p.z));
        s.setScalar(size);
        mtx.compose(p, q, s);
        body.setMatrixAt(i, mtx);
        for (let k2 = 0; k2 < 2; k2++) {
          e.copy(EYES[k2]).multiplyScalar(size).applyQuaternion(q).add(p);
          mtx.compose(e, q, s);
          eyes.setMatrixAt(i * 2 + k2, mtx);
          e.copy(EYES[k2]).setZ(EYES[k2].z + 0.035).multiplyScalar(size).applyQuaternion(q).add(p);
          mtx.compose(e, q, s);
          pupils.setMatrixAt(i * 2 + k2, mtx);
        }
        if (k > 0.05 && k < 0.6) { sum.add(p); n++; }
      });
      body.instanceMatrix.needsUpdate = true; eyes.instanceMatrix.needsUpdate = true; pupils.instanceMatrix.needsUpdate = true;
      if (n) anchor.position.copy(sum.multiplyScalar(1 / n));
    },
  };
  return swarm;
}

/** One soot sprite made of ordinary meshes (for the one that rides on the Catbus). Faces +z. */
export function makeSootSprite() {
  const g = new THREE.Group();
  const m = sootMaterials();
  const b = new THREE.Mesh(BODY, m.black);
  g.add(b);
  for (const e of EYES) {
    const w = new THREE.Mesh(EYE, m.white); w.position.copy(e); g.add(w);
    const p = new THREE.Mesh(PUPIL, m.pupil); p.position.copy(e).setZ(e.z + 0.035); g.add(p);
  }
  // two thin legs under it
  for (const x of [-0.08, 0.08]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4), m.black);
    leg.position.set(x, -0.3, 0);
    g.add(leg);
  }
  return g;
}

