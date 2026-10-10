import * as THREE from 'three';
import { sphere, cyl, capsule, box, canvasTexture, mesh } from '../../engine/Builders';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, Rng, TAU } from '../../engine/math';
import { charToon } from '../../engine/Paint';
import { airshipHull, shadowFade } from './characterTextures';

export type { Character } from './character';
import type { Character } from './character';
export { makeTotoro, type Totoro, type TotoroOpts } from './totoro';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export { makeCatbus, type Catbus } from './catbus';

export { makeKiki, makeSatsukiMei, makeChihiroSeated, type Kiki, type Sisters, type Chihiro } from './people';

export { makeNoFace, makeRadishSpirit, makeKodama, makePonyoSchool, type NoFace, type RadishSpirit, type Kodama, type PonyoSchool } from './spirits';

// ---------------- Soot sprites ----------------
/**
 * A fuzzy ball: a sphere covered in thin spikes. Every vertex uses the radial direction as its normal,
 * so the fuzz shades like one soft round shape.
 */
function fuzzBallGeometry(r: number, spikes: number, len: [number, number], rng: Rng) {
  const core = new THREE.IcosahedronGeometry(r, 2);
  const pos: number[] = [], nrm: number[] = [];
  const d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < spikes; i++) {
    d.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    if (d.lengthSq() < 0.01) continue;
    d.normalize();
    a.set(d.y, d.z, d.x).cross(d).normalize();
    b.crossVectors(d, a);
    const w = r * 0.14, L = r + rng.range(len[0], len[1]);
    const base = [0, 1, 2].map((k) => { const t = (k / 3) * TAU; return new THREE.Vector3().copy(d).multiplyScalar(r * 0.9).addScaledVector(a, Math.cos(t) * w).addScaledVector(b, Math.sin(t) * w); });
    const tip = d.clone().multiplyScalar(L);
    for (let k = 0; k < 3; k++) {
      for (const v of [base[k], base[(k + 1) % 3], tip]) { pos.push(v.x, v.y, v.z); nrm.push(d.x, d.y, d.z); }
    }
  }
  const fuzz = new THREE.BufferGeometry();
  fuzz.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fuzz.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const coreNI = core.toNonIndexed();
  coreNI.deleteAttribute('uv');
  return mergeGeometries([coreNI, fuzz])!;
}

export function makeSootSprites(count: number, rng: Rng, area = 3.5) {
  const g = new THREE.Group();
  const black = charToon({ color: 0x17181f, rim: 0.45, shade: 0x8088a8, side: THREE.DoubleSide });
  const white = charToon({ color: 0xf2f0e8, rim: 0.2 });
  const pupil = charToon({ color: 0x101014, rim: 0 });
  const coalMat = charToon({ color: 0x34343c, rim: 0.2 });
  const bodyGeo = fuzzBallGeometry(0.24, 220, [0.04, 0.13], new Rng(17));
  // a private generator for looks only, so the shared one (and everything placed after) is unchanged
  const looks = new Rng(18);
  const sprites: { g: THREE.Group; home: THREE.Vector3; target: THREE.Vector3; phase: number; coal: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Group();
    const bodyM = mesh(bodyGeo, black);
    bodyM.position.y = 0.32;
    bodyM.rotation.set(looks.range(0, TAU), looks.range(0, TAU), 0);
    s.add(bodyM);
    for (const sx of [-1, 1]) {
      s.add(sphere(0.105, white, sx * 0.11, 0.39, 0.2));
      s.add(sphere(0.05, pupil, sx * 0.11, 0.39, 0.3));
    }
    for (let k = 0; k < 2; k++) {
      const leg = cyl(0.012, 0.012, 0.22, black, (k - 0.5) * 0.18, 0.1, 0);
      s.add(leg);
    }
    const coal = rng.chance(0.5);
    if (coal) {
      s.add(mesh(new THREE.DodecahedronGeometry(0.16, 0), coalMat, 0, 0.78, 0));
      for (const sx of [-1, 1]) { const arm = cyl(0.012, 0.012, 0.3, black, sx * 0.14, 0.62, 0); arm.rotation.z = sx * -0.6; s.add(arm); }
    }
    const home = V(rng.range(-area, area), 0, rng.range(-area, area));
    s.position.copy(home);
    g.add(s);
    sprites.push({ g: s, home, target: home.clone(), phase: rng.range(0, 10), coal });
  }
  let swarmT = 0, jumpT = 0;
  const local = new THREE.Vector3();
  const ch: Character & { swarmTo(worldPos: THREE.Vector3): void; jump(): void } = {
    group: g,
    swarmTo(worldPos) {
      g.updateWorldMatrix(true, false);
      local.copy(worldPos); g.worldToLocal(local); local.y = 0;
      for (const s of sprites) s.target.copy(local).add(V(rng.range(-0.9, 0.9), 0, rng.range(-0.9, 0.9)));
      swarmT = 5;
    },
    jump() { jumpT = 1.2; },
    update(dt, t) {
      if (swarmT > 0) { swarmT -= dt; if (swarmT <= 0) for (const s of sprites) s.target.copy(s.home); }
      if (jumpT > 0) jumpT -= dt;
      for (const s of sprites) {
        const sp = swarmT > 0 ? 3.5 : 1.2;
        s.g.position.x = damp(s.g.position.x, s.target.x, sp, dt);
        s.g.position.z = damp(s.g.position.z, s.target.z, sp, dt);
        const hop = Math.abs(Math.sin(t * (swarmT > 0 ? 9 : 4) + s.phase)) * (swarmT > 0 ? 0.35 : 0.14);
        const j = jumpT > 0 ? Math.sin(clamp(1.2 - jumpT, 0, 1) / 1.0 * Math.PI) * 0.6 : 0;
        s.g.position.y = hop + j;
        // turn towards where it is going, smoothly and the short way round; idle sprites keep their heading
        const dx = s.target.x - s.g.position.x, dz = s.target.z - s.g.position.z;
        if (dx * dx + dz * dz > 0.01) {
          const want = Math.atan2(dx, dz);
          s.g.rotation.y += Math.atan2(Math.sin(want - s.g.rotation.y), Math.cos(want - s.g.rotation.y)) * (1 - Math.exp(-6 * dt));
        }
      }
    },
  };
  return ch;
}

export { makeHaku, type Haku } from './haku';

// ---------------- Shadow passengers ----------------
export function makeShadowPassengers(count: number, rng: Rng, width = 10) {
  const g = new THREE.Group();
  // body fades out towards the feet, like the see-through passengers in the film
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.8, alphaMap: shadowFade(), depthWrite: false });
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.66, depthWrite: false });
  for (let i = 0; i < count; i++) {
    const p = new THREE.Group();
    const h = rng.range(1.5, 1.9);
    p.add(capsule(0.28, h - 0.6, bodyMat, 0, h / 2, 0));
    p.add(sphere(0.22, mat, 0, h + 0.15, 0));
    if (rng.chance(0.5)) p.add(cyl(0.35, 0.35, 0.08, mat, 0, h + 0.36, 0));
    p.position.set(rng.range(-width / 2, width / 2), 0, rng.range(-0.8, 0.8));
    g.add(p);
  }
  return g;
}

// ---------------- Dirigible ----------------
export function makeDirigible() {
  const g = new THREE.Group();
  // hull with its poles at the nose and tail, so the painted gores run lengthwise
  const hull = mesh(new THREE.SphereGeometry(1, 36, 18).rotateX(Math.PI / 2), charToon({ map: airshipHull(), rim: 0.4 }));
  hull.scale.set(4, 4, 14);
  g.add(hull);
  const gondolaTex = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#5f636e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8d8a8';
    for (let i = 0; i < 9; i++) c.fillRect(12 + i * 27, 18, 16, 20);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, h - 10, w, 10);
  });
  g.add(box(3.2, 1.4, 5, charToon({ map: gondolaTex, rim: 0.2 }), 0, -4.2, 1));
  const fin = charToon({ color: 0xb33a3a, rim: 0.3 });
  for (const s of [-1, 1]) { g.add(box(0.3, 3, 4, fin, s * 2.6, 0, -12)); }
  g.add(box(3, 0.3, 4, fin, 0, 2.8, -12));
  g.add(box(3, 0.3, 4, fin, 0, -2.8, -12));
  const ch: Character = { group: g, update(dt, t) { void dt; g.position.y += Math.sin(t * 0.4) * 0.004; } };
  return ch;
}
