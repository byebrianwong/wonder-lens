import * as THREE from 'three';
import { box, cyl, sphere, mesh, canvasTexture } from '../../../engine/Builders';
import { charToon } from '../../../engine/Paint';
import { envelope, Spring } from '../../../engine/Rig';
import { clamp, damp, lerp, Rng } from '../../../engine/math';
import { HEAD_R, hold, makeAdult, pillboxCap, peakedCap, poseArm, relax, sit, wear, type Adult } from '../people';
import { mendlsBox } from '../kit';
import { whitmanLuggage } from '../textures';
import { bake, dressTorso, instancedInk, keepApart, uniformTexture } from './figures';
import { GBH } from './textures';

/*
 * The people of Part One. M. Gustave and Zero (also used in the finale's curtain call: makeGustave() and
 * makeZero() work on their own), a row of lobby boys who bow one after another like dominoes, the lift's
 * operator, Madame D., and the folk on the platform at Nebelsbad: the conductor with his flag, a porter
 * with the Whitman luggage, travellers. Every figure is the shared Amélie/Ghibli grown-up (people.ts) in
 * its 1932 uniform, baked down to a few meshes per moving joint.
 */

/** A timed reaction: start() restarts it, `t` is the time since, -1 when idle. */
class Beat {
  t = -1;
  readonly len: number;
  constructor(len: number) { this.len = len; }
  start() { this.t = 0; }
  step(dt: number) { if (this.t >= 0) { this.t += dt; if (this.t > this.len) this.t = -1; } return this.t; }
  get on() { return this.t >= 0; }
}

export interface Person {
  group: THREE.Group;
  /** where the person looks (usually the camera), or null */
  lookTarget: THREE.Vector3 | null;
  update(dt: number, t: number): void;
  bow(): void;
}

const PURPLE = GBH.purple, PURPLE_DARK = 0x3a1c48, GOLD = 0xd8a840;

/** A pencil moustache drawn on with a pencil (Zero's): two thin dark strokes under the nose. */
function pencilMoustache(a: Adult) {
  const mat = charToon({ color: 0x1a1210, rim: 0 });
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.BoxGeometry(0.052, 0.006, 0.01), mat, s * 0.03, -0.068, HEAD_R.adult * 0.945);
    m.rotation.z = s * 0.12; m.rotation.y = s * 0.18;
    a.head.add(m);
  }
}

/** A trim little moustache (Gustave's). */
function trimMoustache(a: Adult, color: number) {
  const mat = charToon({ color, rim: 0.2 });
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.SphereGeometry(1, 8, 6), mat, s * 0.032, -0.062, HEAD_R.adult * 0.94);
    m.scale.set(0.034, 0.009, 0.012); m.rotation.z = s * 0.18;
    a.head.add(m);
  }
}

// ---------------- M. Gustave ----------------

/**
 * M. Gustave H., concierge of the Grand Budapest: purple tailcoat with lapels over a white shirt and a dark
 * tie, the gold Crossed Keys on his lapel, slicked dark hair, a trim moustache. bow(): a perfect bow, hand
 * on heart; catchBox(): he plucks a Mendl's box out of the air and holds it up with a flourish.
 */
export function makeGustave() {
  const a = makeAdult({ skin: 0xf0d0bc, hair: 0x33241e, style: 'none', top: PURPLE, coat: PURPLE, bottom: { kind: 'trousers', color: PURPLE_DARK }, shoes: 0x161214, face: { mouth: 'small', blush: 0.25, fringe: 'none' }, hiRes: true, seed: 101, scale: 1.08 });
  // slicked back: a smooth cap of dark hair with a sheen, close to the head
  {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R.adult * 1.04, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), charToon({ color: 0x33241e, rim: 0.6 }));
    cap.rotation.x = -0.32; cap.position.set(0, 0.012, -0.012); a.head.add(cap);
  }
  dressTorso(a, uniformTexture({ color: PURPLE, lapel: 0x6e3c86, shirt: 0xfaf6f0, tie: 0x2a1830, buttons: GOLD, double: true, keys: true, braid: GOLD, seed: 7 }));
  trimMoustache(a, 0x3a2a24);
  // the box he catches, in his right hand, hidden until then
  const caught = keepApart(mendlsBox(1.5));
  caught.visible = false;
  hold(a, 0, caught, 0, -0.08, 0.1);
  bake(a.group, [a.spine, a.neck, a.head, a.shoulder[0], a.shoulder[1], a.elbow[0], a.elbow[1]]);
  const bowB = new Beat(2.8), catchB = new Beat(3.6);
  const sway = new Spring(0, 1.8, 0.5);
  const c: Person & { catchBox(): void; adult: Adult; busy(): boolean } = {
    group: a.group, lookTarget: null, adult: a,
    bow() { if (!bowB.on) { bowB.start(); a.setFace('smile'); } },
    catchBox() { catchB.start(); bowB.t = -1; a.setFace('open'); },
    busy: () => bowB.on || catchB.on,
    update(dt, t) {
      const b = bowB.step(dt), k = catchB.step(dt);
      relax(a, dt, 7);
      // idle: hands resting on the desk's edge, a slight lean, the odd gesture
      const idle = 1 - (b >= 0 ? envelope(b, 0, 0.3, 2.3, 2.8) : 0) - (k >= 0 ? envelope(k, 0, 0.15, 3.0, 3.6) : 0);
      poseArm(a, 0, -0.55 * idle, -0.05, -0.75 * idle);
      poseArm(a, 1, -0.55 * idle, -0.05, -0.75 * idle);
      a.spine.rotation.x = 0.06 * idle + Math.sin(t * 0.7) * 0.012;
      if (b >= 0) {
        // wind up (straighten, chin up), bow from the waist with the right hand on the heart, hold, rise
        const up = envelope(b, 0, 0.25, 0.3, 0.55), down = envelope(b, 0.35, 0.95, 1.55, 2.4);
        a.spine.rotation.x = -0.08 * up + 0.62 * down;
        a.head.rotation.x = -0.12 * up + 0.2 * down;
        poseArm(a, 0, -0.85 * down - 0.2 * up, -0.38 * down, -1.85 * down);
        poseArm(a, 1, 0.45 * down, 0.12 * down, -0.4 * down);
      }
      if (k >= 0) {
        // up goes the right arm, the box appears in his hand, then he presents it
        const reach = envelope(k, 0, 0.18, 0.9, 1.4), present = envelope(k, 0.9, 1.4, 2.9, 3.5);
        poseArm(a, 0, -2.85 * reach - 1.35 * present, 0.32 * reach + 0.05 * present, -0.25 * reach - 0.9 * present);
        poseArm(a, 1, -0.3 * present, 0.6 * reach, -0.3);
        a.spine.rotation.x = -0.1 * reach + 0.12 * present;
        caught.visible = k > 0.12 && k < 3.3;
      } else caught.visible = false;
      a.group.rotation.z = sway.update(0, dt);
      if (!bowB.on && !catchB.on) a.setFace('normal');
      a.tick(dt, t, c.lookTarget, b >= 0 ? 0.3 : 0.9);
    },
  };
  return c;
}

// ---------------- Zero ----------------

/**
 * Zero Moustafa, lobby boy: purple uniform with gold braid and buttons, the pillbox cap with LOBBY BOY
 * across it, the moustache he draws on with a pencil. salute(): he snaps to attention and salutes.
 */
export function makeZero() {
  const a = makeAdult({ skin: 0xb27a56, hair: 0x15100e, style: 'short', top: PURPLE, coat: PURPLE, coatSkirt: false, bottom: { kind: 'trousers', color: PURPLE }, shoes: 0x161214, face: { mouth: 'small', blush: 0.2 }, hiRes: true, seed: 102, scale: 0.94, build: 0.9 });
  dressTorso(a, uniformTexture({ color: PURPLE, buttons: GOLD, braid: GOLD, seed: 8 }));
  wear(a, pillboxCap(HEAD_R.adult, PURPLE, GOLD, 'LOBBY BOY'));
  pencilMoustache(a);
  bake(a.group, [a.pelvis, a.spine, a.neck, a.head, a.shoulder[0], a.shoulder[1], a.elbow[0], a.elbow[1]]);
  const salute = new Beat(3.0), bowB = new Beat(2.4);
  const hop = new Spring(0, 3, 0.35);
  const c: Person & { salute(): void; adult: Adult } = {
    group: a.group, lookTarget: null, adult: a,
    salute() { if (!salute.on) { salute.start(); hop.v += 1.4; } },
    bow() { if (!bowB.on) bowB.start(); },
    update(dt, t) {
      const s = salute.step(dt), b = bowB.step(dt);
      relax(a, dt, 8);
      // idle: standing to attention, hands at his sides, breathing a little fast
      poseArm(a, 0, 0.02, 0.03, -0.05);
      poseArm(a, 1, 0.02, 0.03, -0.05);
      a.pelvis.position.y = 0.98 + Math.max(-0.04, hop.update(0, dt) * 0.05);
      if (s >= 0) {
        const k = envelope(s, 0.08, 0.3, 2.3, 2.75);
        a.spine.rotation.x = -0.07 * envelope(s, 0, 0.1, 2.6, 2.9);
        poseArm(a, 0, -0.32 * k, 1.38 * k, -0.15 * k);
        a.elbow[0].rotation.z = -2.25 * k;
        a.head.rotation.z = 0.04 * k;
      }
      if (b >= 0) {
        const k = envelope(b, 0, 0.45, 1.2, 2.0);
        a.spine.rotation.x = 0.55 * k;
        poseArm(a, 0, -0.75 * k, -0.35 * k, -1.7 * k);
      }
      a.tick(dt, t, c.lookTarget, s >= 0 ? 1 : 0.8);
    },
  };
  return c;
}

// ---------------- the lobby boys, in a row ----------------

/**
 * A row of lobby boys in purple, all one instanced figure (one draw call per material for the whole row).
 * bowAll(order) bows them one after another, like dominoes falling, in the order given.
 */
export function makeLobbyBoys(places: Array<{ pos: THREE.Vector3; yaw: number }>) {
  const a = makeAdult({ skin: 0xe2b896, hair: 0x2a1c16, style: 'short', top: PURPLE, coat: PURPLE, coatSkirt: false, bottom: { kind: 'trousers', color: PURPLE }, shoes: 0x161214, face: { mouth: 'small', blush: 0.35 }, seed: 103, scale: 0.92, build: 0.9 });
  dressTorso(a, uniformTexture({ color: PURPLE, buttons: GOLD, braid: GOLD, seed: 9 }));
  wear(a, pillboxCap(HEAD_R.adult, PURPLE, GOLD, 'LOBBY BOY'));
  poseArm(a, 0, 0.02, 0.04, -0.05); poseArm(a, 1, 0.02, 0.04, -0.05);
  bake(a.group, [a.spine]);
  a.group.updateMatrixWorld(true);
  const ink = instancedInk();
  const n = places.length;
  const group = new THREE.Group();
  const lower: THREE.InstancedMesh[] = [], upper: THREE.InstancedMesh[] = [];
  const skinTone = [1, 0.86, 0.94, 0.78, 1.02, 0.9];
  const toInstanced = (src: THREE.Mesh, list: THREE.InstancedMesh[]) => {
    const isInk = (src.material as THREE.Material).side === THREE.BackSide && (src.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    const im = new THREE.InstancedMesh(src.geometry, isInk ? ink : src.material as THREE.Material, n);
    const mat = src.material as THREE.MeshToonMaterial;
    // the skin and the face take each boy's own tone
    if (!isInk && mat.color && (mat.map === null || mat.map === undefined || (mat.map.image as HTMLCanvasElement)?.width === 512 && (mat.map.image as HTMLCanvasElement)?.height === 256 && mat.color.r > 0.9)) {
      const skinLike = mat.color.r > 0.6 && mat.color.g > 0.45 && mat.color.b > 0.3 && mat.color.r > mat.color.b + 0.15;
      if (skinLike || mat.map) for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color().setScalar(skinTone[i % skinTone.length]));
    }
    im.frustumCulled = false;
    list.push(im);
    group.add(im);
  };
  for (const c of a.group.children) if ((c as THREE.Mesh).isMesh) toInstanced(c as THREE.Mesh, lower);
  const pelvisM = a.pelvis.matrixWorld.clone();
  for (const c of a.spine.children) if ((c as THREE.Mesh).isMesh) toInstanced(c as THREE.Mesh, upper);
  // the spine's place relative to the figure's root (the figure is scaled)
  const spineRest = new THREE.Matrix4().copy(a.group.matrixWorld).invert().multiply(a.spine.matrixWorld);
  const rootScale = new THREE.Matrix4().makeScale(a.group.scale.x, a.group.scale.y, a.group.scale.z);
  void pelvisM;
  const bases = places.map((p) => new THREE.Matrix4().compose(p.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(1, 1, 1)));
  const bowT = places.map(() => -1), delay = places.map(() => 0);
  const springs = places.map(() => new Spring(0, 2.2, 0.55));
  const mL = new THREE.Matrix4(), mU = new THREE.Matrix4(), rot = new THREE.Matrix4();
  const write = () => {
    for (let i = 0; i < n; i++) {
      mL.multiplyMatrices(bases[i], rootScale);
      for (const im of lower) im.setMatrixAt(i, mL);
      const tilt = springs[i].x;
      rot.makeRotationX(tilt);
      mU.multiplyMatrices(bases[i], rootScale).multiply(spineRest).multiply(rot);
      for (const im of upper) im.setMatrixAt(i, mU);
    }
    for (const im of [...lower, ...upper]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  };
  write();
  let moving = true;
  return {
    group,
    /** bow one after another, in this order of indices, `gap` seconds apart */
    bowAll(order: number[], gap = 0.2) { order.forEach((idx, k) => { delay[idx] = k * gap; bowT[idx] = 0; }); moving = true; },
    get bowing() { return bowT.some((b) => b >= 0); },
    centre() { const c = new THREE.Vector3(); for (const p of places) c.add(p.pos); return c.divideScalar(Math.max(1, n)); },
    update(dt: number, t: number) {
      for (let i = 0; i < n; i++) {
        let target = Math.sin(t * 1.3 + i) * 0.01;
        if (bowT[i] >= 0) {
          bowT[i] += dt;
          const k = bowT[i] - delay[i];
          if (k > 0) target = 0.7 * envelope(k, 0, 0.3, 1.0, 1.6);
          if (k > 1.9) bowT[i] = -1;
          moving = true;
        }
        springs[i].update(target, dt);
      }
      if (moving) { write(); moving = bowT.some((b) => b >= 0) || springs.some((s) => Math.abs(s.v) > 0.01); }
      void clamp;
    },
  };
}

// ---------------- the lift's operator ----------------

/** The lift man in his purple livery and cap. nod(): a courteous nod and a hand to show you in. */
export function makeLiftOperator() {
  const a = makeAdult({ skin: 0xe8c0a0, hair: 0x8a8a90, style: 'bald', top: PURPLE, coat: PURPLE, coatSkirt: false, bottom: { kind: 'trousers', color: PURPLE_DARK }, shoes: 0x161214, moustache: 0x9a9aa2, face: { mouth: 'small' }, seed: 104, glow: 0x201010 });
  dressTorso(a, uniformTexture({ color: PURPLE, buttons: GOLD, braid: GOLD, seed: 10 }), 0x201010);
  wear(a, peakedCap(HEAD_R.adult, PURPLE, GOLD, GOLD));
  bake(a.group, [a.spine, a.neck, a.head, a.shoulder[1], a.elbow[1]]);
  const nodB = new Beat(2.6);
  const c: Person & { nod(): void } = {
    group: a.group, lookTarget: null,
    nod() { if (!nodB.on) nodB.start(); },
    bow() { c.nod(); },
    update(dt, t) {
      const k = nodB.step(dt);
      relax(a, dt, 6);
      poseArm(a, 1, -0.15, 0.05, -0.2);
      if (k >= 0) {
        const nd = envelope(k, 0.25, 0.55, 0.9, 1.3), show = envelope(k, 0.5, 0.9, 2.0, 2.6);
        a.head.rotation.x = 0.35 * nd;
        a.spine.rotation.x = 0.12 * nd;
        poseArm(a, 1, -0.95 * show, 0.65 * show, -0.35 * show);
      }
      a.tick(dt, t, c.lookTarget, 0.8);
    },
  };
  return c;
}

// ---------------- Madame D. ----------------

/** A lace handkerchief. */
function hanky() {
  const tex = canvasTexture(64, 64, (g) => { g.fillStyle = '#fbf8f4'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#d8d0e0'; g.lineWidth = 2; for (let i = 4; i < 64; i += 8) { g.beginPath(); g.arc(i, 2, 4, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(i, 62, 4, Math.PI, Math.PI * 2); g.stroke(); } });
  const m = mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  m.rotation.z = 0.7;
  return m;
}

/**
 * Madame Céline Villeneuve Desgoffe und Taxis, eighty-four, in a plum velvet coat with a fur collar and a
 * little hat, her hair set in curls, pearls. wave(): she flutters her handkerchief: au revoir.
 */
export function makeMadameD() {
  const a = makeAdult({ skin: 0xf0d8cc, hair: 0xdccfb4, style: 'curly', top: 0x6a2440, coat: 0x6a2440, bottom: { kind: 'dress', color: 0x5a1c34, length: 0.86 }, shoes: 0x2a1418, face: { mouth: 'small', blush: 0.5 }, hat: { kind: 'beret', color: 0x3a1424 }, seed: 105, scale: 0.98 });
  dressTorso(a, uniformTexture({ color: 0x6a2440, fur: 0xe8dcc8, buttons: 0xe8d8b0, seed: 11 }));
  // pearls and a fur collar
  const fur = mesh(new THREE.TorusGeometry(0.13, 0.05, 8, 18), charToon({ color: 0xe8dcc8, rim: 0.5 }));
  fur.rotation.x = Math.PI / 2; fur.position.y = 0.0; a.neck.add(fur);
  const pearls = mesh(new THREE.TorusGeometry(0.11, 0.014, 5, 22), charToon({ color: 0xfbf6ee, rim: 0.6 }));
  pearls.rotation.x = Math.PI / 2 - 0.5; pearls.position.set(0, -0.07, 0.04); a.neck.add(pearls);
  const h = keepApart(hanky());
  hold(a, 0, h, 0, -0.08, 0.05);
  bake(a.group, [a.spine, a.neck, a.head, a.shoulder[0], a.elbow[0]]);
  const waveB = new Beat(3.2);
  const c: Person & { wave(): void } = {
    group: a.group, lookTarget: null,
    wave() { if (!waveB.on) { waveB.start(); a.setFace('smile'); } },
    bow() { c.wave(); },
    update(dt, t) {
      const k = waveB.step(dt);
      relax(a, dt, 6);
      // idle: clutching her handbag at her waist, a slight tremble
      poseArm(a, 0, -0.65, -0.15, -1.2);
      a.spine.rotation.x = 0.1 + Math.sin(t * 9) * 0.004;
      if (k >= 0) {
        const up = envelope(k, 0, 0.45, 2.5, 3.2);
        poseArm(a, 0, lerp(-0.65, -2.5, up), lerp(-0.15, 0.4, up), lerp(-1.2, -0.5, up));
        a.elbow[0].rotation.z = Math.sin(k * 10) * 0.45 * up;
        a.head.rotation.z = 0.08 * up;
      } else a.setFace('normal');
      a.tick(dt, t, c.lookTarget, 0.9);
    },
  };
  return c;
}

// ---------------- Nebelsbad station ----------------

/** The conductor with his whistle and flag. flag(): he raises the flag and blows his whistle: all aboard! */
export function makeConductor() {
  const a = makeAdult({ skin: 0xecc4a6, hair: 0x9a9aa2, style: 'short', top: 0x2a3458, coat: 0x2a3458, bottom: { kind: 'trousers', color: 0x22283e }, shoes: 0x161214, moustache: 0xb0b0b8, face: { mouth: 'small' }, seed: 106, build: 1.15 });
  dressTorso(a, uniformTexture({ color: 0x2a3458, buttons: GOLD, double: true, braid: 0xc8a040, seed: 12 }));
  wear(a, peakedCap(HEAD_R.adult, 0x2a3458, 0x8a1c2a, GOLD));
  // a red flag on a short stick, and a brass whistle
  const flagG = new THREE.Group();
  flagG.add(cyl(0.012, 0.012, 0.75, charToon({ color: 0x6a4a30 }), 0, -0.2, 0, 5));
  const cloth = mesh(new THREE.PlaneGeometry(0.42, 0.3, 4, 1), charToon({ color: 0xc8202a, side: THREE.DoubleSide, rim: 0.3 }), 0.22, 0.02, 0);
  flagG.add(cloth);
  flagG.rotation.x = -Math.PI / 2;
  hold(a, 0, keepApart(flagG), 0, -0.06, 0.06);
  const whistle = keepApart(cyl(0.018, 0.022, 0.07, charToon({ color: 0xd8b25a, rim: 0.5 }), 0, 0, 0, 8));
  hold(a, 1, whistle, 0, -0.05, 0.05);
  bake(a.group, [a.spine, a.neck, a.head, a.shoulder[0], a.elbow[0], a.shoulder[1], a.elbow[1]]);
  const flagB = new Beat(3.4);
  let cue = 1.2;
  const c: Person & { flag(): void } = {
    group: a.group, lookTarget: null,
    flag() { if (!flagB.on) flagB.start(); },
    bow() { c.flag(); },
    update(dt, t) {
      // he sends the train off once on his own, just after the opening card
      if (cue > 0) { cue -= dt; if (cue <= 0) c.flag(); }
      const k = flagB.step(dt);
      relax(a, dt, 6);
      poseArm(a, 0, -0.3, 0.1, -0.5);
      poseArm(a, 1, -0.2, 0.05, -0.4);
      if (k >= 0) {
        const up = envelope(k, 0, 0.35, 2.6, 3.3), blow = envelope(k, 0.2, 0.45, 1.6, 2.0);
        poseArm(a, 0, lerp(-0.3, -2.75, up), lerp(0.1, 0.3, up), lerp(-0.5, -0.15, up));
        a.elbow[0].rotation.z = Math.sin(k * 7) * 0.3 * up;
        poseArm(a, 1, -1.25 * blow - 0.2 * (1 - blow), -0.42 * blow, -2.05 * blow - 0.4 * (1 - blow));
        a.head.rotation.x = -0.1 * blow;
        cloth.rotation.y = Math.sin(t * 9) * 0.3;
      }
      a.tick(dt, t, c.lookTarget, 0.7);
    },
  };
  return c;
}

/** The porter with his trolley of Whitman luggage (the animal-print cases with the monogram). */
export function makePorter() {
  const g = new THREE.Group();
  const a = makeAdult({ skin: 0xd8a888, hair: 0x2a1c16, style: 'short', top: 0x7a2236, coat: 0x7a2236, coatSkirt: false, bottom: { kind: 'trousers', color: 0x3a1a24 }, shoes: 0x161214, moustache: 0x2a1c16, face: { mouth: 'small' }, seed: 107 });
  dressTorso(a, uniformTexture({ color: 0x7a2236, buttons: GOLD, braid: GOLD, seed: 13 }));
  wear(a, pillboxCap(HEAD_R.adult, 0x7a2236, GOLD, 'PORTER'));
  poseArm(a, 0, -0.9, 0.05, -0.6); poseArm(a, 1, -0.9, -0.05, -0.6);
  a.spine.rotation.x = 0.12;
  bake(a.group, [a.neck, a.head]);
  g.add(a.group);
  // the trolley: an iron frame on two big wheels, the cases stacked on it
  const t = new THREE.Group();
  const iron = charToon({ color: 0x2a2a30, rim: 0.2 }), wood = charToon({ color: 0x8a5a3a, rim: 0.2 });
  t.add(box(0.9, 0.06, 1.6, wood, 0, 0.32, 0));
  for (const s of [-1, 1]) {
    const w = cyl(0.3, 0.3, 0.06, iron, s * 0.5, 0.3, 0.45, 14); w.rotation.z = Math.PI / 2; t.add(w);
    t.add(box(0.04, 1.3, 0.04, iron, s * 0.42, 0.95, -0.78));
  }
  t.add(box(0.88, 0.04, 0.04, iron, 0, 1.6, -0.78));
  const lug = new THREE.MeshLambertMaterial({ map: whitmanLuggage(71) });
  const rng = new Rng(7);
  let y = 0.35;
  for (const [w, h, d] of [[0.85, 0.32, 1.3], [0.75, 0.28, 1.1], [0.62, 0.3, 0.8], [0.5, 0.36, 0.5], [0.42, 0.26, 0.38]] as const) {
    const bx = box(w, h, d, lug, rng.range(-0.05, 0.05), y + h / 2, rng.range(-0.1, 0.1)); bx.rotation.y = rng.range(-0.12, 0.12); t.add(bx);
    y += h;
  }
  t.add(cyl(0.2, 0.2, 0.3, charToon({ color: 0xf2b8c6 }), 0, y + 0.15, 0.1, 14));
  t.position.set(0.4, 0, 0.95);
  t.rotation.y = 0.1;
  g.add(t);
  bake(t, []);
  return {
    group: g, lookTarget: null as THREE.Vector3 | null,
    update(dt: number, tt: number) { a.tick(dt, tt, this.lookTarget, 0.6); },
  };
}

/** Travellers on the platform: a lady with a striped hatbox, a gentleman with his newspaper. Static but for the head. */
export function makeTraveller(kind: 'lady' | 'gent' | 'reader' | 'sitter') {
  let a: Adult;
  if (kind === 'lady') {
    a = makeAdult({ skin: 0xf2d6c4, hair: 0x6a3a24, style: 'bob', top: 0xb8a6d8, coat: 0xb8a6d8, bottom: { kind: 'skirt', color: 0x8a76b0, length: 0.62 }, shoes: 0x3a2028, hat: { kind: 'beret', color: 0xe58fa8 }, face: { mouth: 'small', blush: 0.5 }, seed: 108 });
    const hb = cyl(0.24, 0.24, 0.32, charToon({ map: canvasTexture(128, 32, (g) => { for (let x = 0; x < 128; x += 16) { g.fillStyle = (x / 16) % 2 ? '#f6e6ea' : '#e58fa8'; g.fillRect(x, 0, 16, 32); } }) }), 0, 0, 0, 16);
    hold(a, 1, hb, 0.1, -0.12, 0.08);
    poseArm(a, 1, -0.4, 0.2, -0.3); poseArm(a, 0, -0.5, -0.1, -1.1);
  } else if (kind === 'gent') {
    a = makeAdult({ skin: 0xe8c0a4, hair: 0x4a3a2a, style: 'short', top: 0xb08a5a, coat: 0xb08a5a, bottom: { kind: 'trousers', color: 0x5a5a62 }, shoes: 0x2a1a14, hat: { kind: 'flat', color: 0x5a4a3a }, moustache: 0x4a3a2a, face: { mouth: 'small' }, seed: 109 });
    const paper = mesh(new THREE.PlaneGeometry(0.42, 0.55), new THREE.MeshLambertMaterial({ map: canvasTexture(64, 96, (g) => { g.fillStyle = '#efe8d8'; g.fillRect(0, 0, 64, 96); g.fillStyle = '#2a2a2a'; g.fillRect(6, 6, 52, 8); for (let y = 20; y < 92; y += 5) g.fillRect(6 + (y % 3), y, 24, 2), g.fillRect(34, y, 24, 2); }), side: THREE.DoubleSide }));
    paper.rotation.set(-0.3, 0, 0);
    hold(a, 0, paper, 0.14, -0.08, 0.12);
    poseArm(a, 0, -1.1, -0.3, -1.0); poseArm(a, 1, -1.1, -0.3, -1.0);
  } else if (kind === 'reader') {
    a = makeAdult({ skin: 0xf0ccb4, hair: 0x9a9aa2, style: 'bald', top: 0x5a6a7a, coat: 0x5a6a7a, bottom: { kind: 'trousers', color: 0x3a3a44 }, shoes: 0x2a1a14, moustache: 0xb0b0b8, glasses: true, face: { mouth: 'small' }, seed: 110 });
    sit(a);
    const paper = mesh(new THREE.PlaneGeometry(0.46, 0.6), new THREE.MeshLambertMaterial({ color: 0xefe8d8, side: THREE.DoubleSide }));
    hold(a, 0, paper, 0.15, -0.1, 0.12);
    poseArm(a, 0, -1.2, -0.3, -1.1); poseArm(a, 1, -1.2, -0.3, -1.1);
  } else {
    a = makeAdult({ skin: 0xf2d6c4, hair: 0xc89a5a, style: 'bob', top: 0xf2b8c6, coat: 0x9ad0c8, bottom: { kind: 'dress', color: 0xf2b8c6, length: 0.6 }, shoes: 0x3a2028, hat: { kind: 'beret', color: 0x9ad0c8 }, face: { mouth: 'smile', blush: 0.5 }, seed: 111 });
    sit(a);
    poseArm(a, 0, -0.5, -0.1, -1.0); poseArm(a, 1, -0.5, -0.1, -1.0);
  }
  bake(a.group, [a.neck, a.head]);
  return { group: a.group, lookTarget: null as THREE.Vector3 | null, update(dt: number, t: number) { a.tick(dt, t, this.lookTarget, 0.6); } };
}

export { damp };
void sphere;
