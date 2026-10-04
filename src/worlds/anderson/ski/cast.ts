import * as THREE from 'three';
import { box, cyl, sphere } from '../../../engine/Builders';
import { charToon } from '../../../engine/Paint';
import { envelope, outline } from '../../../engine/Rig';
import { clamp, damp, lerp } from '../../../engine/math';
import { HEAD_R, makeAdult, pillboxCap, poseArm, relax, wear, type Adult } from '../people';
import { buildToboggan } from './toboggan';

/*
 * The chase's people. Jopling, the killer, in his black leather coat (on skis for the chase, standing at the
 * cliff's edge at the end); M. Gustave in his plum overcoat and homburg and Zero in his lobby boy's uniform
 * and pillbox cap, on their own toboggan; and a ski instructor in a striped jumper.
 *
 * `makeJopling`, `makeGustave` and `makeZero` work on their own (no scene needed) for the curtain call:
 * each returns a group, update(dt, t) and bow().
 */

const INK = 0x2a1e24;
const matCache = new Map<string, THREE.Material>();
const mat = (k: string, make: () => THREE.Material) => { let m = matCache.get(k); if (!m) { m = make(); matCache.set(k, m); } return m; };
const flat = (c: number) => mat(`f${c}`, () => charToon({ color: c, rim: 0.35 }));
const lined = (m: THREE.Mesh) => { outline(m, INK, 1.3, 0.014); return m; };

/** A timed reaction: start() restarts it; `t` is the time since, -1 when idle. */
export class Beat {
  t = -1;
  len: number;
  constructor(len: number) { this.len = len; }
  start() { this.t = 0; }
  step(dt: number) { if (this.t >= 0) { this.t += dt; if (this.t > this.len) this.t = -1; } return this.t; }
  get on() { return this.t >= 0; }
}

/** Cast shadows from a figure's body (not its ink lines). */
function shade(g: THREE.Object3D) {
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = true; });
}

/** Pose the legs so the feet stay on the ground: hip bend `a` (negative swings the thigh forward), knee bend `k`. */
function crouch(f: Adult, a: number, k: number, spread = 0) {
  for (let i = 0; i < 2; i++) {
    f.hip[i].rotation.set(a, 0, (i ? 1 : -1) * spread);
    f.knee[i].rotation.set(k, 0, 0);
  }
  // the thigh is 0.47 long, the shin 0.46, the shoe sits 0.05 under the ankle
  f.pelvis.position.y = 0.47 * Math.cos(a) + 0.46 * Math.cos(a + k) + 0.06;
}

/** A pair of skis under the figure's feet (in the figure's own space, on the ground), and two poles. */
function skisFor(color: number) {
  const g = new THREE.Group();
  const m = mat(`ski${color}`, () => charToon({ color, rim: 0.3 }));
  for (const s of [-1, 1]) {
    const ski = new THREE.Group();
    ski.add(box(0.09, 0.03, 1.7, m, 0, 0.015, 0.05));
    const tip = box(0.09, 0.03, 0.26, m, 0, 0.07, 0.98); tip.rotation.x = -0.55; ski.add(tip);
    ski.add(box(0.11, 0.06, 0.2, flat(0x2a2c30), 0, 0.05, -0.02));
    ski.position.x = s * 0.13;
    g.add(ski);
  }
  return g;
}
function pole(color = 0x2a2c30) {
  const g = new THREE.Group();
  g.add(cyl(0.012, 0.012, 1.15, flat(color), 0, -0.5, 0, 5));
  const basket = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 4, 10), flat(color));
  basket.rotation.x = Math.PI / 2; basket.position.y = -0.95;
  g.add(basket);
  return g;
}

// ---------------- Jopling ----------------
export interface Jopling {
  group: THREE.Group;
  figure: Adult;
  /** the skis and poles (hidden when he stands at the cliff's edge) */
  skis: THREE.Group;
  /** 0 standing, 1 tucked down on his skis */
  crouch: number;
  lookTarget: THREE.Vector3 | null;
  /** turn round and glare at whoever whistled */
  glare(): void;
  /** raise the brass knuckles */
  menace(): void;
  bow(): void;
  update(dt: number, t: number): void;
}

/** Jopling: pale, black hair slicked back, a long black leather coat and gloves, brass knuckles on one fist. */
export function makeJopling(): Jopling {
  const f = makeAdult({
    skin: 0xece2de, hair: 0x141216, style: 'short', top: 0x1e1c22, coat: 0x18171c, bottom: { kind: 'trousers', color: 0x1c1b20 }, shoes: 0x0e0e10,
    face: { mouth: 'small', blush: 0 }, scale: 1.08, build: 1.12, hiRes: true, seed: 801,
  });
  const group = new THREE.Group();
  group.add(f.group);
  // black gloves over the hands, and the brass knuckles on the right fist
  for (const h of f.hand) { const gl = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), flat(0x141216)); gl.scale.set(0.85, 1.1, 0.7); gl.position.copy(h.position); h.parent!.add(gl); h.visible = false; }
  const knux = new THREE.Group();
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.007, 5, 10), flat(0xd8b25a)); r.position.set(-0.03 + i * 0.02, 0, 0.035); knux.add(r); }
  knux.position.copy(f.hand[0].position).add(new THREE.Vector3(0, -0.03, 0));
  f.hand[0].parent!.add(knux);
  // a widow's peak of black hair and a high collar turned up against the cold
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 14, 1, true), mat('jcollar', () => charToon({ color: 0x18171c, rim: 0.5, side: THREE.DoubleSide })));
  collar.position.y = 0.04; f.neck.add(collar); lined(collar);
  // the skis and poles are for the chase; standing (as at the curtain call) he has none
  const skis = skisFor(0x2a2a30);
  skis.visible = false;
  f.group.add(skis);
  const poles = [pole(), pole()];
  poles.forEach((p, i) => { p.position.copy(f.hand[i].position); p.rotation.x = 0.35; f.hand[i].parent!.add(p); });
  shade(group);
  const glare = new Beat(3.2), menace = new Beat(3.0), bow = new Beat(3.4);
  const j: Jopling = {
    group, figure: f, skis, crouch: 0, lookTarget: null,
    glare() { glare.start(); },
    menace() { menace.start(); },
    bow() { bow.start(); },
    update(dt, t) {
      const g = glare.step(dt), mn = menace.step(dt), b = bow.step(dt);
      relax(f, dt, 8);
      const c = j.crouch;
      poles.forEach((p) => { p.visible = skis.visible; });
      if (skis.visible) {
        // tucked on his skis, poles back under the arms, swaying a little through the turns
        crouch(f, lerp(0, -0.75, c), lerp(0, 1.35, c));
        f.spine.rotation.x = 0.5 * c;
        for (let i = 0; i < 2; i++) poseArm(f, i as 0 | 1, -0.55 * c, 0.25, -0.9 * c);
        f.pelvis.rotation.z = Math.sin(t * 2.1) * 0.06 * c;
      } else {
        // standing: fists closed, weight on one leg, coat hanging still
        crouch(f, 0, 0);
        poseArm(f, 0, -0.15, 0.18, -0.5);
        poseArm(f, 1, 0.05, 0.12, -0.25);
        f.spine.rotation.x = 0.06;
      }
      // glare: he turns his head and shoulders right round, lip curled
      const gk = g >= 0 ? envelope(g, 0, 0.35, 2.5, 3.2) : 0;
      f.spine.rotation.y = gk * 0.6;
      // menace: the knuckle fist comes up in front of his chest
      const mk = mn >= 0 ? envelope(mn, 0, 0.3, 2.3, 3.0) : 0;
      if (mk > 0) { poseArm(f, 0, lerp(f.shoulder[0].rotation.x, -1.5, mk), 0.1, lerp(f.elbow[0].rotation.x, -1.9, mk)); f.spine.rotation.x += 0.12 * mk; }
      // the bow: slow and too deep, never taking his eyes off you
      const bk = b >= 0 ? envelope(b, 0, 0.9, 1.9, 3.4) : 0;
      if (bk > 0) { f.spine.rotation.x += 0.75 * bk; f.head.rotation.x -= 0.4 * bk; poseArm(f, 1, -0.6 * bk, 0.1, -1.6 * bk); }
      f.setFace(gk > 0.3 || mk > 0.3 || bk > 0.3 ? 'open' : 'normal');
      f.tick(dt, t, j.lookTarget, gk > 0 || mk > 0 ? 1 : 0.5);
    },
  };
  return j;
}

// ---------------- M. Gustave ----------------
export interface Gustave {
  group: THREE.Group;
  figure: Adult;
  hat: THREE.Group;
  lookTarget: THREE.Vector3 | null;
  /** 'stand', 'sit' (on the toboggan, behind Zero) or 'hang' (by his fingertips from the cliff's edge) */
  mode: 'stand' | 'sit' | 'hang';
  waveHat(): void;
  bow(): void;
  update(dt: number, t: number): void;
}

/** A homburg: a dented crown with a band and a curled brim. */
function homburg(R: number) {
  const g = new THREE.Group();
  const felt = mat('homburg', () => charToon({ color: 0x2a1e30, rim: 0.4 }));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.98, R * 0.9, 18), felt);
  crown.position.y = R * 1.08; crown.scale.z = 0.92;
  const dent = new THREE.Mesh(new THREE.SphereGeometry(R * 0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), felt);
  dent.scale.set(1.3, 0.25, 0.8); dent.position.y = R * 1.5;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.99, R * 0.2, 18), flat(0x5d3a8a));
  band.position.y = R * 0.74; band.scale.z = 0.92;
  const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.28, R * 0.1, 6, 24), felt);
  brim.rotation.x = Math.PI / 2; brim.position.y = R * 0.66; brim.scale.set(1, 0.9, 1);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.3, R * 1.3, R * 0.05, 24), felt);
  disc.position.y = R * 0.64; disc.scale.z = 0.9;
  g.add(crown, dent, band, brim, disc);
  lined(crown); lined(disc);
  return g;
}

/** M. Gustave: silver hair, a fine moustache, the plum overcoat with its collar up, a black homburg. */
export function makeGustave(): Gustave {
  const f = makeAdult({
    skin: 0xf1d2bc, hair: 0x8a8278, style: 'short', top: 0x5d3a8a, coat: 0x4e2a6e, bottom: { kind: 'trousers', color: 0x2a2430 }, shoes: 0x1a1414,
    moustache: 0x6a6058, face: { mouth: 'small', blush: 0.35 }, scale: 1.04, hiRes: true, seed: 811,
  });
  const group = new THREE.Group();
  group.add(f.group);
  const hat = homburg(HEAD_R.adult);
  const hatHome = new THREE.Vector3(0, 0, -0.01);
  hat.position.copy(hatHome);
  wear(f, hat);
  // a lavender scarf round the neck
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 6, 14), flat(0xb8a0d8));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.0; f.neck.add(scarf);
  shade(group);
  const wave = new Beat(2.8), bow = new Beat(3.0);
  let inHand = false;
  const hand = f.hand[1];
  const gv: Gustave = {
    group, figure: f, hat, lookTarget: null, mode: 'stand',
    waveHat() { if (!wave.on) wave.start(); },
    bow() { bow.start(); },
    update(dt, t) {
      const w = wave.step(dt), b = bow.step(dt);
      relax(f, dt, 9);
      if (gv.mode === 'sit') {
        // sitting on the deck with his legs out straight, one hand holding the brass rail
        f.pelvis.position.y = 0.42;
        for (let i = 0; i < 2; i++) { f.hip[i].rotation.set(-1.42, 0, (i ? 1 : -1) * 0.12); f.knee[i].rotation.set(0.22, 0, 0); }
        poseArm(f, 0, -0.35, 0.5, -0.4);
        poseArm(f, 1, -0.6, 0.35, -0.9);
        f.spine.rotation.x = -0.12;
      } else if (gv.mode === 'hang') {
        // hanging by his fingertips: arms straight up, legs kicking, looking up at his hands
        crouch(f, 0, 0);
        for (let i = 0; i < 2; i++) { poseArm(f, i as 0 | 1, -3.0, -0.1, 0); }
        f.hip[0].rotation.x = Math.sin(t * 7) * 0.45; f.hip[1].rotation.x = -Math.sin(t * 7) * 0.45;
        f.knee[0].rotation.x = 0.4 + Math.sin(t * 7 + 1) * 0.3; f.knee[1].rotation.x = 0.4 - Math.sin(t * 7 + 1) * 0.3;
        f.spine.rotation.x = -0.05; f.pelvis.rotation.z = Math.sin(t * 2.3) * 0.05;
      } else {
        crouch(f, 0, 0);
        poseArm(f, 0, 0.35, 0.3, -0.5);
        poseArm(f, 1, 0.35, 0.3, -0.5);
      }
      // waving the homburg: up comes the arm, the hat in its hand, and it swings to and fro
      const k = w >= 0 ? envelope(w, 0, 0.4, 2.1, 2.8) : 0;
      if (k > 0) {
        poseArm(f, 1, lerp(f.shoulder[1].rotation.x, -2.7, k), 0.35 * k, -0.4 * k);
        f.elbow[1].rotation.z = Math.sin(w * 8) * 0.5 * k;
      }
      const want = k > 0.55;
      if (want !== inHand) {
        inHand = want;
        if (inHand) { hand.parent!.add(hat); hat.position.set(hand.position.x, hand.position.y - 0.32, hand.position.z + 0.04); hat.rotation.set(Math.PI, 0, 0); }
        else { f.head.add(hat); hat.position.copy(hatHome); hat.rotation.set(0, 0, 0); }
      }
      // the bow: hand on heart, a deep and courtly bow
      const bk = b >= 0 ? envelope(b, 0, 0.6, 1.7, 3.0) : 0;
      if (bk > 0) { f.spine.rotation.x += 0.8 * bk; poseArm(f, 0, -1.2 * bk, -0.4 * bk, -1.9 * bk); poseArm(f, 1, 0.5 * bk, 0.4 * bk, 0); }
      f.setFace(k > 0.3 || bk > 0.3 ? 'smile' : gv.mode === 'hang' ? 'open' : 'normal');
      f.tick(dt, t, gv.mode === 'hang' ? null : gv.lookTarget, k > 0 ? 1 : 0.6);
      if (gv.mode === 'hang') { f.head.rotation.x = -0.45; }
    },
  };
  return gv;
}

// ---------------- Zero ----------------
export interface Zero {
  group: THREE.Group;
  figure: Adult;
  lookTarget: THREE.Vector3 | null;
  /** 'stand', 'steer' (at the front of the toboggan) or 'reach' (kneeling at the edge, reaching down for Gustave) */
  mode: 'stand' | 'steer' | 'reach';
  /** -1..1: which way he is hauling the toboggan round */
  lean: number;
  bow(): void;
  update(dt: number, t: number): void;
}

/** Zero Moustafa: the purple lobby boy's uniform with gold buttons, the LOBBY BOY pillbox cap, a pencilled moustache. */
export function makeZero(): Zero {
  const f = makeAdult({
    skin: 0xa8704e, hair: 0x161214, style: 'short', top: 0x5d3a8a, coat: 0x5d3a8a, coatSkirt: false, bottom: { kind: 'trousers', color: 0x4e2e78 }, shoes: 0x141214,
    moustache: 0x161214, face: { mouth: 'small', blush: 0.2 }, scale: 0.9, build: 0.92, hiRes: true, seed: 821,
  });
  const group = new THREE.Group();
  group.add(f.group);
  wear(f, pillboxCap(HEAD_R.adult, 0x5d3a8a, 0xd8a840, 'LOBBY BOY'));
  // two rows of gold buttons down the jacket
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const b = sphere(0.016, flat(0xd8a840), s * 0.06, 0.18 + i * 0.085, 0.135, 6, 5); f.spine.add(b); }
  shade(group);
  const bow = new Beat(2.6);
  const z: Zero = {
    group, figure: f, lookTarget: null, mode: 'stand', lean: 0,
    bow() { bow.start(); },
    update(dt, t) {
      const b = bow.step(dt);
      relax(f, dt, 9);
      if (z.mode === 'steer') {
        // sitting forward, knees up, hauling on the rope
        f.pelvis.position.y = 0.44;
        for (let i = 0; i < 2; i++) { f.hip[i].rotation.set(-1.25, 0, (i ? 1 : -1) * 0.18); f.knee[i].rotation.set(0.9, 0, 0); }
        const L = z.lean;
        poseArm(f, 0, -1.25 + L * 0.35, 0.15, -0.5);
        poseArm(f, 1, -1.25 - L * 0.35, 0.15, -0.5);
        f.spine.rotation.x = 0.25;
        f.spine.rotation.z = -L * 0.25;
        f.spine.rotation.y = L * 0.2;
      } else if (z.mode === 'reach') {
        // kneeling at the edge, leaning out, both arms reaching down
        for (let i = 0; i < 2; i++) { f.hip[i].rotation.set(-0.2, 0, (i ? 1 : -1) * 0.15); f.knee[i].rotation.set(1.55, 0, 0); }
        f.pelvis.position.y = 0.5;
        f.spine.rotation.x = 0.95;
        for (let i = 0; i < 2; i++) poseArm(f, i as 0 | 1, -0.9 + Math.sin(t * 3 + i) * 0.1, 0.1, -0.15);
      } else {
        crouch(f, 0, 0);
        poseArm(f, 0, 0.05, 0.12, -0.3);
        poseArm(f, 1, 0.05, 0.12, -0.3);
      }
      const bk = b >= 0 ? envelope(b, 0, 0.4, 1.4, 2.6) : 0;
      if (bk > 0) { f.spine.rotation.x += 0.6 * bk; f.head.rotation.x += 0.2 * bk; poseArm(f, 1, -2.4 * bk, 0.3 * bk, -1.4 * bk); }
      f.tick(dt, t, z.mode === 'reach' ? null : z.lookTarget, 0.6);
    },
  };
  return z;
}

// ---------------- Gustave and Zero on their toboggan ----------------
export interface SledPair {
  group: THREE.Group;
  /** the toboggan and its riders, which lean into the curves and swerve */
  body: THREE.Group;
  sled: ReturnType<typeof buildToboggan>;
  gustave: Gustave;
  zero: Zero;
  /** Zero hauls the toboggan into a swerve */
  steer(): void;
  update(dt: number, t: number, speed: number): void;
}

export function makeSledPair(): SledPair {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const sled = buildToboggan({ scale: 1.08 });
  body.add(sled.group);
  const gustave = makeGustave(), zero = makeZero();
  gustave.mode = 'sit'; zero.mode = 'steer';
  gustave.group.position.set(0, 0, -0.55);
  zero.group.position.set(0, 0, 0.45);
  body.add(gustave.group, zero.group);
  const steer = new Beat(2.2);
  let swerve = 0;
  return {
    group, body, sled, gustave, zero,
    steer() { steer.start(); },
    update(dt, t, speed) {
      const s = steer.step(dt);
      const k = s >= 0 ? envelope(s, 0, 0.3, 1.4, 2.2) : 0;
      swerve = damp(swerve, Math.sin((s >= 0 ? s : 0) * 4.2) * k, 8, dt);
      zero.lean = clamp(swerve * 1.4 + Math.sin(t * 1.7) * 0.15, -1, 1);
      body.position.x = swerve * 0.9;
      body.rotation.z = -swerve * 0.18;
      body.rotation.y = swerve * 0.25;
      sled.update(dt, t, speed);
      gustave.update(dt, t);
      zero.update(dt, t);
    },
  };
}

// ---------------- the ski instructor ----------------
export interface Skier {
  group: THREE.Group;
  figure: Adult;
  lookTarget: THREE.Vector3 | null;
  wave(): void;
  tumble(): void;
  readonly tumbling: boolean;
  update(dt: number, t: number): void;
}

/** A ski instructor in a red-and-white striped jumper and a bobble hat, on long wooden skis. */
export function makeSkier(): Skier {
  const f = makeAdult({
    skin: 0xf0c8b0, hair: 0xd8b070, style: 'short', top: 0xf6efe2, stripes: { color: 0xc8323c, count: 7, width: 14 }, bottom: { kind: 'trousers', color: 0x2a3a6a }, shoes: 0x3a2a20,
    face: { mouth: 'smile', blush: 0.7 }, seed: 831,
  });
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(f.group);
  group.add(inner);
  // the bobble hat
  const knit = flat(0xc8323c);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R.adult * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), knit);
  cap.position.y = HEAD_R.adult * 0.15; lined(cap);
  const bob = sphere(HEAD_R.adult * 0.38, flat(0xfbf8f4), 0, HEAD_R.adult * 1.3, 0, 10, 8);
  const hatG = new THREE.Group(); hatG.add(cap, bob);
  wear(f, hatG);
  const skis = skisFor(0xb86a3a);
  f.group.add(skis);
  const poles = [pole(0x8a5a3a), pole(0x8a5a3a)];
  poles.forEach((p, i) => { p.position.copy(f.hand[i].position); p.rotation.x = 0.3; f.hand[i].parent!.add(p); });
  shade(group);
  const wave = new Beat(2.4), tumble = new Beat(3.4);
  const sk: Skier = {
    group, figure: f, lookTarget: null,
    wave() { if (!tumble.on) wave.start(); },
    tumble() { if (!tumble.on) { tumble.start(); wave.t = -1; } },
    get tumbling() { return tumble.on; },
    update(dt, t) {
      const w = wave.step(dt), tb = tumble.step(dt);
      relax(f, dt, 9);
      crouch(f, -0.45, 0.85, 0.05);
      f.spine.rotation.x = 0.3;
      for (let i = 0; i < 2; i++) poseArm(f, i as 0 | 1, -0.45, 0.3, -0.8);
      // swinging through easy turns
      f.pelvis.rotation.z = Math.sin(t * 1.6) * 0.12;
      const wk = w >= 0 ? envelope(w, 0, 0.3, 1.7, 2.4) : 0;
      if (wk > 0) { poseArm(f, 1, -2.7 * wk, 0.4 * wk, -0.3 * wk); f.elbow[1].rotation.z = Math.sin(w * 10) * 0.4 * wk; }
      // the tumble: a cartwheel into the snow and up again, a little shaken
      if (tb >= 0) {
        const roll = clamp(tb / 1.1, 0, 1);
        inner.rotation.z = roll * Math.PI * 2 * (tb < 1.1 ? 1 : 0);
        inner.position.y = Math.sin(roll * Math.PI) * 0.9;
        const sit = envelope(tb, 1.0, 1.3, 2.6, 3.4);
        inner.rotation.x = -sit * 1.2;
        inner.position.y -= sit * 0.5;
      } else { inner.rotation.set(0, 0, 0); inner.position.y = 0; }
      f.tick(dt, t, sk.lookTarget, wk > 0 ? 1 : 0.6);
    },
  };
  return sk;
}
