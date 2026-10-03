import * as THREE from 'three';
import { glow, sphere, cyl, cone, capsule, box, canvasTexture, mesh, mergeStatic } from '../../engine/Builders';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, Rng, TAU } from '../../engine/math';
import { charToon, repeatUV, boxUV } from '../../engine/Paint';
import { fluffyTree } from '../../engine/Foliage';
import { woodGrain, lampGlass, ironTexture, stoneWall, rockStrata, metalPlates, gullWing, airshipHull, shadowFade } from './characterTextures';

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

// ---------------- Hopping lamp post ----------------
export function makeHoppingLamp() {
  const g = new THREE.Group();
  const iron = charToon({ map: ironTexture(), rim: 0.4 });
  const pole = cyl(0.07, 0.1, 2.2, iron, 0, 1.1, 0);
  const head = new THREE.Group();
  head.add(box(0.5, 0.6, 0.5, iron, 0, 0, 0));
  head.add(box(0.52, 0.5, 0.52, new THREE.MeshBasicMaterial({ map: lampGlass(), color: new THREE.Color(1.9, 1.9, 1.9) }), 0, 0, 0));
  head.add(cone(0.42, 0.3, iron, 0, 0.45, 0, 4));
  head.add(sphere(0.07, iron, 0, 0.66, 0));
  head.position.y = 2.5;
  g.add(pole, head);
  let phase = 0;
  const ch: Character = {
    group: g,
    update(dt, t) {
      void dt;
      phase = t * 2.6;
      const hop = Math.max(0, Math.sin(phase));
      g.position.y = hop * 0.7;
      g.rotation.z = Math.cos(phase) * 0.18;
      g.rotation.x = Math.sin(phase * 0.5) * 0.08;
    },
  };
  return ch;
}

// ---------------- Laputa ----------------
export function makeLaputa() {
  const g = new THREE.Group();
  const rockTex = rockStrata(0x5a5f6b);
  rockTex.repeat.set(4, 2);
  const rock = charToon({ map: rockTex, emissive: 0xffffff, emissiveMap: rockTex, emissiveIntensity: 0.18, rim: 0.4 });
  // stone walls; a faint self-light through the texture keeps them readable against the night sky
  const wallMat = (arches: boolean, seed: number) => { const t = stoneWall(0xc4bcac, { arches, moss: true, seed }); return charToon({ map: t, emissive: 0x8a96c0, emissiveMap: t, emissiveIntensity: 0.4, rim: 0.4 }); };
  const tier = (rTop: number, rBot: number, h: number, y: number, arches: boolean, seed: number) => {
    const geo = repeatUV(new THREE.CylinderGeometry(rTop, rBot, h, 28), Math.round((Math.PI * 2 * rBot) / 8), h / 8);
    g.add(mesh(geo, wallMat(arches, seed), 0, y, 0));
  };
  const base = cone(28, 34, rock, 0, -17, 0, 18); base.rotation.x = Math.PI; g.add(base);
  tier(26, 28, 6, 3, false, 172);
  tier(18, 22, 8, 10, true, 173);
  tier(10, 14, 10, 19, true, 174);
  // roots hanging from the bottom of the island
  const rootMat = charToon({ color: 0x4a4038, emissive: 0x16141a, rim: 0.3 });
  const rr = new Rng(1986);
  for (let i = 0; i < 16; i++) {
    const a = rr.range(0, TAU), d = rr.range(4, 22), len = rr.range(10, 26) * (1 - d / 40);
    const root = cone(rr.range(0.5, 1.2), len, rootMat, Math.cos(a) * d, -34 * (1 - d / 28) + 8 - len / 2, Math.sin(a) * d, 5);
    root.rotation.x = Math.PI + rr.range(-0.15, 0.15); root.rotation.z = rr.range(-0.15, 0.15);
    g.add(root);
  }
  // the great tree
  g.add(cyl(2.2, 3, 14, charToon({ map: woodGrain(0x6a5040, 175), emissive: 0x1a1410, rim: 0.3 }), 0, 31, 0, 12));
  const crown = fluffyTree([
    { c: new THREE.Vector3(0, 44, 0), r: new THREE.Vector3(16, 11, 16) },
    { c: new THREE.Vector3(10, 40, 5), r: new THREE.Vector3(9, 7, 9) },
    { c: new THREE.Vector3(-10, 41, -4), r: new THREE.Vector3(10, 7, 10) },
    { c: new THREE.Vector3(3, 51, -3), r: new THREE.Vector3(9, 6, 9) },
    { c: new THREE.Vector3(-4, 39, 11), r: new THREE.Vector3(8, 6, 8) },
  ], 0x4f8f4a, new Rng(1987), { density: 0.12, cardScale: 1.1 });
  (crown.material as THREE.MeshToonMaterial).emissive.set(0x10281a);
  g.add(crown);
  const towerTop = charToon({ color: 0x5f7fa0, emissive: 0x1a2a40, rim: 0.4 });
  const towerWall = wallMat(false, 176);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const tgeo = repeatUV(new THREE.CylinderGeometry(1.4, 1.6, 6, 10), 1, 0.75);
    g.add(mesh(tgeo, towerWall, Math.cos(a) * 21, 9, Math.sin(a) * 21));
    g.add(cone(2, 3, towerTop, Math.cos(a) * 21, 13.5, Math.sin(a) * 21, 8));
  }
  // faint glow ring beneath
  { const ring = mesh(new THREE.TorusGeometry(24, 1.2, 8, 32), glow(0x9fd7ff, 1.1), 0, -8, 0); ring.rotation.x = Math.PI / 2; g.add(ring); }
  // the island only moves as a whole, so its parts can be baked into one mesh per material
  mergeStatic(g);
  const ch: Character = {
    group: g,
    update(dt, t) { void dt; g.position.y += Math.sin(t * 0.3) * 0.01; g.rotation.y += 0.004 * dt; },
  };
  return ch;
}

// ---------------- Howl's moving castle (distant silhouette) ----------------
export function makeHowlsCastle() {
  const g = new THREE.Group();
  const ironTex = metalPlates(0x55545c, 0x8a5a3a, 192), rustTex = metalPlates(0x6e5a4c, 0x9a6a40, 193);
  const iron = charToon({ map: ironTex, rim: 0.3 });
  const rust = charToon({ map: rustTex, rim: 0.3 });
  const B = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), 7), mat, x, y, z);
  const C = (rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 10) => mesh(repeatUV(new THREE.CylinderGeometry(rt, rb, h, seg), Math.max(1, Math.round((TAU * rb) / 7)), h / 7), mat, x, y, z);
  const body = new THREE.Group();
  body.add(B(14, 10, 12, iron, 0, 14, 0));
  body.add(C(4, 5, 9, rust, -5, 22, 2));
  body.add(cone(5, 5, iron, -5, 29, 2, 10));
  body.add(C(2.5, 3, 7, iron, 6, 21, -3));
  body.add(B(6, 5, 6, rust, 5, 11, 7));
  body.add(B(9, 4, 5, iron, -3, 8, 8));
  body.add(C(1.2, 1.2, 8, iron, 2, 24, 4, 8));
  body.add(C(1.0, 1.0, 6, iron, -8, 21, -4, 8));
  // glowing windows
  const winMat = glow(0xffc070, 1.5);
  body.add(box(1.4, 1.6, 0.4, winMat, -3, 15, 6.1), box(1.4, 1.6, 0.4, winMat, 1, 13, 6.1), box(1.0, 1.4, 0.4, winMat, 5, 11.5, 10.1), box(1.0, 1.2, 0.4, winMat, -5, 24, 6.2));
  // mouth plate
  body.add(B(8, 3, 1, rust, 0, 7, 6.3));
  g.add(body);
  mergeStatic(body);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Group();
    const upper = C(0.7, 0.9, 8, iron, 0, -4, 0, 8); l.add(upper);
    const lower = C(0.6, 0.7, 7, iron, 0, -10, 1.2, 8); l.add(lower);
    l.add(B(3, 1, 4.5, iron, 0, -13.5, 1.5));
    l.position.set(i % 2 ? 4.5 : -4.5, 9.5, i < 2 ? 3 : -3);
    g.add(l); legs.push(l);
    mergeStatic(l);
  }
  let walk = 0;
  const ch: Character = {
    group: g,
    update(dt, t) {
      walk = t * 1.6;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(walk + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : 0.5)) * 0.35; });
      body.position.y = Math.abs(Math.sin(walk)) * 0.6;
      body.rotation.z = Math.sin(walk) * 0.03;
      g.position.z += 1.2 * dt; // walks slowly across the ridge
    },
  };
  return ch;
}

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

// ---------------- Seagulls ----------------
export function makeSeagulls(count: number, rng: Rng) {
  const g = new THREE.Group();
  const white = charToon({ color: 0xf6f6f2, rim: 0.3 });
  const wingMat = charToon({ map: gullWing(), side: THREE.DoubleSide, alphaTest: 0.5, rim: 0.2 });
  // body and head as one geometry, so each gull stays at three draw calls
  const bodyGeo = mergeGeometries([new THREE.SphereGeometry(1, 14, 10).scale(0.12, 0.1, 0.3), new THREE.SphereGeometry(0.08, 10, 8).translate(0, 0.05, 0.28)])!;
  // a horizontal wing with its root at x = 0 and its leading edge towards +z
  const wingGeo = new THREE.PlaneGeometry(1.1, 0.4).rotateX(Math.PI / 2).translate(0.55, 0, 0);
  const birds: { g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; phase: number; radius: number; speed: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const r = new THREE.Mesh(wingGeo, wingMat);
    const l = new THREE.Mesh(wingGeo, wingMat); l.scale.x = -1;
    b.add(l, r, new THREE.Mesh(bodyGeo, white));
    g.add(b);
    birds.push({ g: b, l, r, phase: rng.range(0, 10), radius: rng.range(8, 26), speed: rng.range(0.25, 0.5) * rng.sign(), h: rng.range(0, 8) });
  }
  const ch: Character = {
    group: g,
    update(dt, t) {
      void dt;
      for (const b of birds) {
        const a = t * b.speed + b.phase;
        b.g.position.set(Math.cos(a) * b.radius, b.h + Math.sin(t * 0.7 + b.phase) * 1.5, Math.sin(a) * b.radius);
        b.g.rotation.y = -a + (b.speed > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * 6 + b.phase) * 0.6;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
    },
  };
  return ch;
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
