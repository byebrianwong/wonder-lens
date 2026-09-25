import * as THREE from 'three';
import { toon, glow, sphere, ellipsoid, cyl, cone, capsule, box, mesh, textTexture } from '../../engine/Builders';
import { clamp, damp, lerp, Rng, TAU } from '../../engine/math';

/** Characters face +z in local space. Every builder returns a group plus update(dt, t) and its pose methods. */
export interface Character {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------- shared figure builder ----------------
// A simple articulated person. Arms and legs are pivot groups so poses only need rotations.
// arm.rotation.x negative = raise forward; straight up is about -3.0.
export interface FigureOpts {
  h?: number;
  skin: number; hair: number; top: number; bottom: number; shoes?: number;
  hairStyle?: 'short' | 'slick' | 'bob' | 'braids' | 'none';
  hat?: { kind: 'cap' | 'beanie' | 'pillbox' | 'coonskin' | 'brim'; color: number; band?: number };
  glasses?: boolean; beard?: number; moustache?: number | 'pencil';
  collar?: number; buttons?: number; skirt?: number; socks?: number;
  eyes?: number;
}
export interface Figure {
  group: THREE.Group; body: THREE.Group; head: THREE.Group; torso: THREE.Mesh;
  armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  handL: THREE.Group; handR: THREE.Group;
  h: number; hipY: number; armLen: number;
}
export function makeFigure(o: FigureOpts): Figure {
  const h = o.h ?? 1.7;
  const g = new THREE.Group();
  const skin = toon(o.skin), hair = toon(o.hair), top = toon(o.top), bottom = toon(o.bottom), shoes = toon(o.shoes ?? 0x2a2420);
  const headR = h * 0.105;
  const legLen = h * 0.42, torsoH = h * 0.32, armLen = h * 0.34;
  const hipY = legLen;
  const hipX = h * 0.07, shoulderX = h * 0.13;
  // legs
  const leg = (s: number) => {
    const p = new THREE.Group();
    p.position.set(s * hipX, hipY, 0);
    p.add(capsule(h * 0.045, legLen - h * 0.09, o.skirt !== undefined && o.socks !== undefined ? toon(o.socks) : bottom, 0, -legLen / 2, 0));
    p.add(box(h * 0.075, h * 0.05, h * 0.13, shoes, 0, -legLen + h * 0.02, h * 0.02));
    g.add(p);
    return p;
  };
  const legL = leg(-1), legR = leg(1);
  // body pivot at the hips
  const body = new THREE.Group();
  body.position.set(0, hipY, 0);
  const torso = capsule(h * 0.105, torsoH - h * 0.2, top, 0, torsoH * 0.5, 0);
  torso.scale.set(1.25, 1, 0.85);
  body.add(torso);
  if (o.skirt !== undefined) {
    const sk = cone(h * 0.17, h * 0.3, toon(o.skirt), 0, h * 0.06, 0, 14);
    body.add(sk);
  }
  if (o.buttons !== undefined) for (let i = 0; i < 3; i++) body.add(sphere(h * 0.014, toon(o.buttons), 0, torsoH * 0.35 + i * h * 0.075, h * 0.095, 6, 5));
  if (o.collar !== undefined) {
    const c = cone(h * 0.09, h * 0.09, toon(o.collar), 0, torsoH * 0.9, h * 0.02, 3);
    c.rotation.x = Math.PI; c.rotation.y = Math.PI;
    body.add(c);
  }
  // arms
  const arm = (s: number) => {
    const p = new THREE.Group();
    p.position.set(s * shoulderX, torsoH * 0.92, 0);
    p.add(capsule(h * 0.036, armLen - h * 0.07, top, 0, -armLen / 2, 0));
    const hand = new THREE.Group();
    hand.position.set(0, -armLen, 0);
    hand.add(sphere(h * 0.04, skin, 0, 0, 0, 8, 6));
    p.add(hand);
    p.rotation.z = s * 0.08;
    body.add(p);
    return { p, hand };
  };
  const aL = arm(-1), aR = arm(1);
  // head
  const head = new THREE.Group();
  head.position.set(0, torsoH + headR * 0.95, 0);
  head.add(sphere(headR, skin, 0, 0, 0, 16, 12));
  const eyeMat = toon(o.eyes ?? 0x1c1a1e);
  for (const s of [-1, 1]) head.add(sphere(headR * 0.13, eyeMat, s * headR * 0.38, headR * 0.1, headR * 0.86, 6, 5));
  // hair
  const style = o.hairStyle ?? 'short';
  if (style === 'short' || style === 'slick') {
    const cap = sphere(headR * 1.06, hair, 0, headR * 0.12, -headR * 0.1, 16, 12);
    cap.scale.set(1, style === 'slick' ? 0.75 : 0.85, 1);
    head.add(cap);
  } else if (style === 'bob') {
    const cap = sphere(headR * 1.12, hair, 0, headR * 0.05, -headR * 0.08, 16, 12);
    cap.scale.set(1, 1.05, 1);
    head.add(cap);
    head.add(box(headR * 1.6, headR * 0.5, headR * 0.5, hair, 0, headR * 0.75, headR * 0.75)); // fringe
  } else if (style === 'braids') {
    const cap = sphere(headR * 1.06, hair, 0, headR * 0.12, -headR * 0.1, 16, 12);
    cap.scale.set(1, 0.85, 1);
    head.add(cap);
    for (const s of [-1, 1]) {
      const b = capsule(headR * 0.22, headR * 1.6, hair, s * headR * 0.95, -headR * 0.9, headR * 0.1);
      b.rotation.z = -s * 0.15;
      head.add(b);
      head.add(sphere(headR * 0.16, toon(0xd23c5a), s * headR * 1.05, -headR * 1.75, headR * 0.15, 6, 5));
    }
  }
  if (o.glasses) {
    const ring = new THREE.TorusGeometry(headR * 0.3, headR * 0.035, 6, 14);
    const gm = toon(0x2a2420);
    for (const s of [-1, 1]) head.add(mesh(ring, gm, s * headR * 0.38, headR * 0.1, headR * 0.95));
    head.add(box(headR * 0.2, headR * 0.05, headR * 0.05, gm, 0, headR * 0.12, headR * 0.95));
  }
  if (o.beard !== undefined) {
    const bd = ellipsoid(headR * 0.75, headR * 0.6, headR * 0.5, toon(o.beard), 0, -headR * 0.45, headR * 0.6);
    head.add(bd);
  }
  if (o.moustache === 'pencil') head.add(box(headR * 0.55, headR * 0.05, headR * 0.05, toon(0x2a2420), 0, -headR * 0.22, headR * 0.98));
  else if (o.moustache !== undefined) head.add(ellipsoid(headR * 0.42, headR * 0.12, headR * 0.1, toon(o.moustache), 0, -headR * 0.2, headR * 0.95));
  if (o.hat) {
    const hm = toon(o.hat.color);
    if (o.hat.kind === 'cap') {
      head.add(cyl(headR * 1.05, headR * 1.05, headR * 0.6, hm, 0, headR * 0.85, 0, 14));
      head.add(box(headR * 1.2, headR * 0.08, headR * 0.7, hm, 0, headR * 0.6, headR * 1.1));
    } else if (o.hat.kind === 'beanie') {
      const b = sphere(headR * 1.08, hm, 0, headR * 0.3, -headR * 0.05, 16, 12);
      b.scale.set(1, 0.95, 1);
      head.add(b);
      head.add(cyl(headR * 1.1, headR * 1.1, headR * 0.35, hm, 0, headR * 0.35, -headR * 0.05, 16));
    } else if (o.hat.kind === 'pillbox') {
      head.add(cyl(headR * 0.7, headR * 0.7, headR * 0.7, hm, 0, headR * 1.15, 0, 14));
      if (o.hat.band !== undefined) head.add(cyl(headR * 0.72, headR * 0.72, headR * 0.16, toon(o.hat.band), 0, headR * 1.05, 0, 14));
    } else if (o.hat.kind === 'coonskin') {
      const c = sphere(headR * 1.15, hm, 0, headR * 0.35, -headR * 0.05, 14, 10);
      c.scale.set(1, 0.7, 1);
      head.add(c);
      const tail = capsule(headR * 0.2, headR * 1.3, hm, 0, -headR * 0.4, -headR * 1.2);
      tail.rotation.x = 0.5;
      head.add(tail);
      for (let i = 0; i < 3; i++) head.add(cyl(headR * 0.21, headR * 0.21, headR * 0.16, toon(0x2a2420), 0, -headR * (0.2 + i * 0.45), -headR * (1.1 + i * 0.2), 8));
    } else if (o.hat.kind === 'brim') {
      head.add(cyl(headR * 0.75, headR * 0.8, headR * 0.75, hm, 0, headR * 1.1, 0, 14));
      head.add(cyl(headR * 1.5, headR * 1.5, headR * 0.06, hm, 0, headR * 0.78, 0, 16));
      if (o.hat.band !== undefined) head.add(cyl(headR * 0.77, headR * 0.82, headR * 0.15, toon(o.hat.band), 0, headR * 0.85, 0, 14));
    }
  }
  body.add(head);
  g.add(body);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, body, head, torso, armL: aL.p, armR: aR.p, legL, legR, handL: aL.hand, handR: aR.hand, h, hipY, armLen };
}

/** Breathing and a little weight shift. */
function figureIdle(f: Figure, t: number, phase = 0) {
  f.torso.scale.y = 1 + Math.sin(t * 1.3 + phase) * 0.012;
  f.body.position.y = f.hipY + Math.sin(t * 1.3 + phase) * 0.004;
  f.head.rotation.y = damp(f.head.rotation.y, Math.sin(t * 0.4 + phase) * 0.08, 2, 0.016);
}
/** Marching / walking cycle. */
function figureWalk(f: Figure, t: number, rate = 7, amp = 0.55, phase = 0) {
  const ph = t * rate + phase;
  f.legL.rotation.x = Math.sin(ph) * amp; f.legR.rotation.x = -Math.sin(ph) * amp;
  f.armL.rotation.x = -Math.sin(ph) * amp * 0.7; f.armR.rotation.x = Math.sin(ph) * amp * 0.7;
  f.body.position.y = f.hipY + Math.abs(Math.cos(ph)) * 0.03;
}
function relaxArms(f: Figure, dt: number, k = 6) {
  f.armL.rotation.x = damp(f.armL.rotation.x, 0, k, dt); f.armR.rotation.x = damp(f.armR.rotation.x, 0, k, dt);
  f.armL.rotation.z = damp(f.armL.rotation.z, -0.08, k, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.08, k, dt);
  f.armL.rotation.y = damp(f.armL.rotation.y, 0, k, dt); f.armR.rotation.y = damp(f.armR.rotation.y, 0, k, dt);
}
function relaxLegs(f: Figure, dt: number, k = 6) {
  f.legL.rotation.x = damp(f.legL.rotation.x, 0, k, dt); f.legR.rotation.x = damp(f.legR.rotation.x, 0, k, dt);
}

/** A little pink Mendl's box with a white ribbon. Used as a prop and for the projectile. */
export function makeMendlsBox(s = 1) {
  const g = new THREE.Group();
  g.add(box(0.34 * s, 0.26 * s, 0.34 * s, toon(0xf2b8c6), 0, 0.13 * s, 0));
  const white = toon(0xfbf7f2);
  g.add(box(0.36 * s, 0.28 * s, 0.05 * s, white, 0, 0.13 * s, 0));
  g.add(box(0.05 * s, 0.28 * s, 0.36 * s, white, 0, 0.13 * s, 0));
  const bow = new THREE.Group();
  bow.add(ellipsoid(0.07 * s, 0.035 * s, 0.03 * s, white, -0.06 * s, 0, 0), ellipsoid(0.07 * s, 0.035 * s, 0.03 * s, white, 0.06 * s, 0, 0), sphere(0.025 * s, white, 0, 0, 0, 6, 5));
  bow.position.set(0, 0.28 * s, 0);
  g.add(bow);
  return g;
}

// ---------------- M. Gustave & Zero ----------------
export function makeGustaveZero() {
  const g = new THREE.Group();
  const purple = 0x5d3a8a;
  const gustave = makeFigure({ h: 1.88, skin: 0xf1cfb4, hair: 0x9a9aa2, hairStyle: 'slick', top: purple, bottom: 0x24222a, shoes: 0x1a1a1a, moustache: 0x8a8a90, buttons: 0xd8b25a });
  const zero = makeFigure({ h: 1.58, skin: 0xa86a48, hair: 0x1a1414, hairStyle: 'short', top: purple, bottom: purple, shoes: 0x1a1a1a, moustache: 'pencil', buttons: 0xd8b25a, hat: { kind: 'pillbox', color: 0xc8323c, band: 0xd8b25a } });
  gustave.group.position.set(-0.75, 0, 0);
  zero.group.position.set(0.75, 0, 0);
  // the Society of the Crossed Keys pin on Gustave's lapel
  gustave.body.add(box(0.05, 0.16, 0.02, toon(0xd8b25a), 0.13, 0.42, 0.2), box(0.16, 0.05, 0.02, toon(0xd8b25a), 0.13, 0.42, 0.2));
  // hands behind the back
  for (const f of [gustave, zero]) { f.armL.rotation.x = 0.55; f.armR.rotation.x = 0.55; f.armL.rotation.y = 0.4; f.armR.rotation.y = -0.4; }
  // Gustave's pointing finger (hidden until he raises it)
  const finger = cyl(0.014, 0.014, 0.12, toon(0xf1cfb4), 0, 0.08, 0, 5);
  finger.visible = false;
  gustave.handR.add(finger);
  g.add(gustave.group, zero.group);
  let bowT = 0, fingerT = 0;
  const lookTarget = new THREE.Vector3();
  let hasLook = false;
  const tmp = new THREE.Vector3();
  const ch: Character & { bow(): void; finger(): void; setLook(p: THREE.Vector3 | null): void } = {
    group: g,
    bow() { bowT = 2.6; },
    finger() { fingerT = 2.8; },
    setLook(p) { if (p) { lookTarget.copy(p); hasLook = true; } else hasLook = false; },
    update(dt, t) {
      figureIdle(gustave, t, 0); figureIdle(zero, t, 1.7);
      // both turn as one to follow the train
      if (hasLook) {
        tmp.copy(lookTarget); g.worldToLocal(tmp);
        const a = Math.atan2(tmp.x, tmp.z);
        g.rotation.y += clamp(a, -0.6, 0.6) * (1 - Math.exp(-dt * 1.5));
      } else g.rotation.y = damp(g.rotation.y, 0, 1.5, dt);
      if (bowT > 0) {
        bowT -= dt;
        const p = clamp(1 - bowT / 2.6, 0, 1);
        const k = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        for (const f of [gustave, zero]) {
          f.body.rotation.x = damp(f.body.rotation.x, 0.62 * k, 9, dt);
          f.head.rotation.x = damp(f.head.rotation.x, 0.25 * k, 9, dt);
        }
      } else {
        for (const f of [gustave, zero]) { f.body.rotation.x = damp(f.body.rotation.x, 0, 5, dt); f.head.rotation.x = damp(f.head.rotation.x, 0, 5, dt); }
      }
      if (fingerT > 0) {
        fingerT -= dt;
        gustave.armR.rotation.x = damp(gustave.armR.rotation.x, -2.75, 9, dt);
        gustave.armR.rotation.y = damp(gustave.armR.rotation.y, 0, 9, dt);
        gustave.armR.rotation.z = damp(gustave.armR.rotation.z, 0.35, 9, dt);
        finger.visible = gustave.armR.rotation.x < -2.0;
        gustave.head.rotation.z = damp(gustave.head.rotation.z, -0.12, 6, dt);
        zero.head.rotation.y = damp(zero.head.rotation.y, -0.5, 6, dt);
      } else {
        finger.visible = false;
        gustave.armR.rotation.x = damp(gustave.armR.rotation.x, 0.55, 5, dt);
        gustave.armR.rotation.y = damp(gustave.armR.rotation.y, -0.4, 5, dt);
        gustave.armR.rotation.z = damp(gustave.armR.rotation.z, 0.08, 5, dt);
        gustave.head.rotation.z = damp(gustave.head.rotation.z, 0, 4, dt);
      }
    },
  };
  return ch;
}

// ---------------- Agatha ----------------
export function makeAgatha() {
  const f = makeFigure({ h: 1.66, skin: 0xf4d6c0, hair: 0xe9c96a, hairStyle: 'braids', top: 0x9fb8cf, bottom: 0x9fb8cf, skirt: 0x9fb8cf, socks: 0xf7f2ea, shoes: 0x3a2a24, eyes: 0x2a3a5a });
  const g = f.group;
  // apron
  f.body.add(box(0.26, 0.34, 0.02, toon(0xfbf7f2), 0, 0.2, 0.15));
  // the birthmark shaped like Mexico on her right cheek
  const mark = ellipsoid(0.028, 0.038, 0.012, toon(0x8a5a4a), 0.075, -0.03, 0.155);
  mark.rotation.z = -0.4;
  f.head.add(mark);
  // she holds a Mendl's box with both hands
  const boxProp = makeMendlsBox(1.1);
  boxProp.position.set(0, 0.12, 0.34);
  boxProp.rotation.x = 0;
  f.body.add(boxProp);
  f.armL.rotation.x = -1.15; f.armR.rotation.x = -1.15; f.armL.rotation.z = -0.32; f.armR.rotation.z = 0.32;
  let catchT = 0, liftT = 0;
  const ch: Character & { catchBox(): void; lift(): void } = {
    group: g,
    catchBox() { catchT = 2.4; },
    lift() { liftT = 2.2; },
    update(dt, t) {
      figureIdle(f, t, 0.6);
      f.legL.rotation.x = 0; f.legR.rotation.x = 0;
      if (catchT > 0) {
        catchT -= dt;
        const p = clamp(1 - catchT / 2.4, 0, 1);
        const up = p < 0.25 ? p / 0.25 : p > 0.8 ? (1 - p) / 0.2 : 1;
        f.armL.rotation.x = damp(f.armL.rotation.x, lerp(-1.15, -2.9, up), 12, dt);
        f.armR.rotation.x = damp(f.armR.rotation.x, lerp(-1.15, -2.9, up), 12, dt);
        boxProp.position.set(0, lerp(0.12, 0.98, up), lerp(0.34, 0.1, up));
        f.head.rotation.x = damp(f.head.rotation.x, -0.35 * up, 8, dt);
        f.body.position.y = f.hipY + (p < 0.3 ? Math.sin(p / 0.3 * Math.PI) * 0.12 : 0);
      } else if (liftT > 0) {
        liftT -= dt;
        f.armL.rotation.x = damp(f.armL.rotation.x, -1.55, 8, dt); f.armR.rotation.x = damp(f.armR.rotation.x, -1.55, 8, dt);
        boxProp.position.set(0, damp(boxProp.position.y, 0.4, 8, dt), damp(boxProp.position.z, 0.5, 8, dt));
        f.head.rotation.x = damp(f.head.rotation.x, 0.08, 6, dt);
      } else {
        f.armL.rotation.x = damp(f.armL.rotation.x, -1.15, 5, dt); f.armR.rotation.x = damp(f.armR.rotation.x, -1.15, 5, dt);
        boxProp.position.set(0, damp(boxProp.position.y, 0.12, 5, dt), damp(boxProp.position.z, 0.34, 5, dt));
        f.head.rotation.x = damp(f.head.rotation.x, 0, 4, dt);
      }
    },
  };
  return ch;
}

// ---------------- Mr. Fox with his bicycle ----------------
export function makeMrFox() {
  const g = new THREE.Group();
  const corduroy = 0xb8843a;
  const f = makeFigure({ h: 1.72, skin: 0xd9782f, hair: 0xd9782f, hairStyle: 'none', top: corduroy, bottom: corduroy, shoes: 0x3a2a20, eyes: 0x1a1410 });
  // replace the round human head with a fox head: keep the sphere, add snout, ears, cheeks
  const orange = toon(0xd9782f), cream = toon(0xf4e6d2), dark = toon(0x1a1410);
  const hr = 1.72 * 0.105;
  const snout = ellipsoid(hr * 0.5, hr * 0.42, hr * 0.7, orange, 0, -hr * 0.15, hr * 0.85);
  f.head.add(snout);
  f.head.add(sphere(hr * 0.16, dark, 0, -hr * 0.12, hr * 1.5, 8, 6));
  for (const s of [-1, 1]) {
    f.head.add(sphere(hr * 0.3, cream, s * hr * 0.42, -hr * 0.28, hr * 0.85, 8, 6));
    const ear = cone(hr * 0.28, hr * 0.8, orange, s * hr * 0.55, hr * 1.05, -hr * 0.1, 8);
    ear.rotation.z = -s * 0.25;
    f.head.add(ear);
    f.head.add(cone(hr * 0.12, hr * 0.3, dark, s * hr * 0.66, hr * 1.42, -hr * 0.16, 6));
  }
  // tie and shirt collar
  f.body.add(box(0.07, 0.3, 0.02, toon(0x7a3a2a), 0, 0.38, 0.19));
  f.body.add(box(0.2, 0.06, 0.03, toon(0xf4e6d2), 0, 0.52, 0.18));
  // bushy tail
  const tail = capsule(0.11, 0.55, orange, 0, 0.05, -0.2);
  tail.rotation.x = 1.2;
  f.body.add(tail);
  f.body.add(sphere(0.11, cream, 0, -0.1, -0.68, 8, 6));
  g.add(f.group);
  // bicycle beside him
  const bike = new THREE.Group();
  const frame = toon(0x2f5d4f), tyre = toon(0x2a2a2a);
  const wheelGeo = new THREE.TorusGeometry(0.42, 0.045, 6, 20);
  for (const z of [-0.65, 0.65]) {
    const w = mesh(wheelGeo, tyre, 0, 0.42, z);
    w.rotation.y = Math.PI / 2;
    bike.add(w);
    for (let i = 0; i < 6; i++) { const sp = cyl(0.008, 0.008, 0.8, toon(0xcfcfcf), 0, 0.42, z, 4); sp.rotation.x = (i / 6) * Math.PI; bike.add(sp); }
  }
  const bar = (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a); const len = d.length();
    const c = cyl(0.025, 0.025, len, frame, 0, 0, 0, 6);
    c.position.copy(a).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    bike.add(c);
  };
  bar(V(0, 0.42, -0.65), V(0, 0.95, -0.25)); bar(V(0, 0.42, -0.65), V(0, 0.45, 0.1)); bar(V(0, 0.95, -0.25), V(0, 0.45, 0.1));
  bar(V(0, 0.95, -0.25), V(0, 0.98, 0.5)); bar(V(0, 0.98, 0.5), V(0, 0.42, 0.65)); bar(V(0, 0.45, 0.1), V(0, 0.42, 0.65));
  bike.add(box(0.5, 0.03, 0.03, frame, 0, 1.05, 0.5)); // handlebar
  bike.add(box(0.22, 0.04, 0.16, toon(0x5a3a2a), 0, 1.02, -0.3)); // saddle
  bike.add(box(0.36, 0.22, 0.3, toon(0xc9a86a), 0, 1.05, 0.72)); // basket
  bike.position.set(0.95, 0, 0.1);
  bike.rotation.y = Math.PI / 2;
  bike.rotation.z = 0.12;
  g.add(bike);
  // idle: left hand on the handlebar
  f.armL.rotation.x = -0.6; f.armL.rotation.z = -0.5;
  let whistleT = 0, catchT = 0;
  const ch: Character & { whistleClick(): void; catchBox(): void } = {
    group: g,
    whistleClick() { whistleT = 3.2; },
    catchBox() { catchT = 2.0; },
    update(dt, t) {
      figureIdle(f, t, 2.1);
      tail.rotation.z = Math.sin(t * 1.8) * 0.18;
      if (whistleT > 0) {
        whistleT -= dt;
        const p = 1 - whistleT / 3.2;
        // hand up by the head, then two quick clicks of the wrist
        f.armR.rotation.x = damp(f.armR.rotation.x, -2.4, 10, dt);
        f.armR.rotation.z = damp(f.armR.rotation.z, 0.55, 10, dt);
        const click = p > 0.35 && p < 0.7 ? Math.max(0, Math.sin((p - 0.35) / 0.35 * TAU * 2)) : 0;
        f.handR.rotation.x = -click * 0.9;
        f.head.rotation.z = damp(f.head.rotation.z, -0.28, 8, dt);
        f.head.rotation.x = damp(f.head.rotation.x, -0.12, 8, dt);
        snout.scale.z = 1 + click * 0.15;
      } else if (catchT > 0) {
        catchT -= dt;
        const p = 1 - catchT / 2.0;
        const up = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
        f.armR.rotation.x = damp(f.armR.rotation.x, -1.9 * up, 12, dt); f.armL.rotation.x = damp(f.armL.rotation.x, -1.9 * up, 12, dt);
        f.armR.rotation.z = damp(f.armR.rotation.z, 0.25, 12, dt); f.armL.rotation.z = damp(f.armL.rotation.z, -0.25, 12, dt);
        f.head.rotation.x = damp(f.head.rotation.x, -0.3 * up, 8, dt);
        f.body.position.y = f.hipY + (p < 0.25 ? Math.sin(p / 0.25 * Math.PI) * 0.15 : 0);
      } else {
        f.armR.rotation.x = damp(f.armR.rotation.x, 0, 5, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.08, 5, dt);
        f.armL.rotation.x = damp(f.armL.rotation.x, -0.6, 5, dt); f.armL.rotation.z = damp(f.armL.rotation.z, -0.5, 5, dt);
        f.handR.rotation.x = damp(f.handR.rotation.x, 0, 8, dt);
        f.head.rotation.z = damp(f.head.rotation.z, 0, 4, dt); f.head.rotation.x = damp(f.head.rotation.x, 0, 4, dt);
        snout.scale.z = damp(snout.scale.z, 1, 8, dt);
      }
    },
  };
  return ch;
}

// ---------------- Sam & Suzy ----------------
export function makeSamSuzy() {
  const g = new THREE.Group();
  const sam = makeFigure({ h: 1.36, skin: 0xf1cfb4, hair: 0x5a3a24, hairStyle: 'short', top: 0xc9b47a, bottom: 0xc9b47a, shoes: 0x3a2a20, glasses: true, collar: 0xf2d23a, hat: { kind: 'coonskin', color: 0x6a4a30 } });
  const suzy = makeFigure({ h: 1.44, skin: 0xf4d6c0, hair: 0x2a2320, hairStyle: 'bob', top: 0xf2a8bc, bottom: 0xf2a8bc, skirt: 0xf2a8bc, socks: 0xfbf7f2, shoes: 0x2a2420, eyes: 0x3a5a8a });
  // Suzy's white collar
  suzy.body.add(cyl(0.1, 0.1, 0.03, toon(0xfbf7f2), 0, 0.44, 0.02, 12));
  // Sam's backpack and canteen
  sam.body.add(box(0.22, 0.28, 0.12, toon(0x6a7a4a), 0, 0.3, -0.16));
  sam.body.add(cyl(0.05, 0.05, 0.08, toon(0x8a8a8a), 0.14, 0.12, -0.05, 8));
  // Suzy's suitcase in the left hand and binoculars in the right
  const suitcase = box(0.42, 0.3, 0.13, toon(0x4f8a8a), 0, -0.16, 0);
  suitcase.add(box(0.1, 0.03, 0.03, toon(0x2a2420), 0, 0.17, 0));
  suzy.handL.add(suitcase);
  const binoc = new THREE.Group();
  binoc.add(cyl(0.035, 0.03, 0.12, toon(0x1a1a1a), -0.04, 0, 0, 8), cyl(0.035, 0.03, 0.12, toon(0x1a1a1a), 0.04, 0, 0, 8));
  binoc.rotation.x = Math.PI / 2;
  binoc.position.set(0, -0.02, 0.05);
  suzy.handR.add(binoc);
  sam.group.position.set(-0.42, 0, 0);
  suzy.group.position.set(0.42, 0, 0);
  g.add(sam.group, suzy.group);
  let moonT = 0, binocT = 0;
  const targetYaw = { v: Math.PI }; // idle: they look out over the lake (away from the track)
  const ch: Character & { moonrise(): void; binoculars(): void } = {
    group: g,
    moonrise() { moonT = 4.5; },
    binoculars() { binocT = 2.8; },
    update(dt, t) {
      figureIdle(sam, t, 0.3); figureIdle(suzy, t, 2.4);
      if (moonT > 0) {
        moonT -= dt;
        targetYaw.v = 0;
        // inner hands join
        sam.armR.rotation.z = damp(sam.armR.rotation.z, 0.55, 6, dt); sam.armR.rotation.x = damp(sam.armR.rotation.x, -0.25, 6, dt);
        suzy.armL.rotation.z = damp(suzy.armL.rotation.z, -0.55, 6, dt); suzy.armL.rotation.x = damp(suzy.armL.rotation.x, -0.25, 6, dt);
        sam.head.rotation.x = damp(sam.head.rotation.x, -0.08, 5, dt); suzy.head.rotation.x = damp(suzy.head.rotation.x, -0.08, 5, dt);
      } else {
        targetYaw.v = Math.PI;
        sam.armR.rotation.z = damp(sam.armR.rotation.z, 0.08, 4, dt); sam.armR.rotation.x = damp(sam.armR.rotation.x, 0, 4, dt);
        suzy.armL.rotation.z = damp(suzy.armL.rotation.z, -0.08, 4, dt); suzy.armL.rotation.x = damp(suzy.armL.rotation.x, 0, 4, dt);
        sam.head.rotation.x = damp(sam.head.rotation.x, 0, 4, dt); suzy.head.rotation.x = damp(suzy.head.rotation.x, 0, 4, dt);
      }
      if (binocT > 0) {
        binocT -= dt;
        suzy.armR.rotation.x = damp(suzy.armR.rotation.x, -2.55, 10, dt);
        suzy.armR.rotation.z = damp(suzy.armR.rotation.z, 0.3, 10, dt);
        suzy.armR.rotation.y = damp(suzy.armR.rotation.y, -0.6, 10, dt);
      } else {
        suzy.armR.rotation.x = damp(suzy.armR.rotation.x, 0, 5, dt);
        suzy.armR.rotation.z = damp(suzy.armR.rotation.z, 0.08, 5, dt);
        suzy.armR.rotation.y = damp(suzy.armR.rotation.y, 0, 5, dt);
      }
      // turn as a pair
      g.rotation.y = damp(g.rotation.y, targetYaw.v, 3, dt);
      suzy.legL.rotation.x = 0; suzy.legR.rotation.x = 0; sam.legL.rotation.x = 0; sam.legR.rotation.x = 0;
    },
  };
  return ch;
}

// ---------------- Khaki Scouts ----------------
export function makeScouts(count: number, rng: Rng) {
  const g = new THREE.Group();
  const scouts: Figure[] = [];
  const spacing = 1.15;
  for (let i = 0; i < count; i++) {
    const leader = i === 0;
    const f = makeFigure({
      h: leader ? 1.8 : 1.32 + rng.range(-0.04, 0.04), skin: rng.pick([0xf1cfb4, 0xe9c4a6, 0xc98a62, 0xa86a48]), hair: rng.pick([0x5a3a24, 0x2a2320, 0xd9a860]),
      hairStyle: 'short', top: 0xc9b47a, bottom: 0xc9b47a, shoes: 0x3a2a20, collar: 0xf2d23a, socks: 0xf7f2ea, skirt: undefined,
      hat: leader ? { kind: 'brim', color: 0xc9b47a, band: 0x7a5a3a } : { kind: 'cap', color: 0xc9b47a },
      glasses: !leader && rng.chance(0.25),
    });
    // knee socks and shorts: shorten the trouser look with a socks band
    f.group.position.set(0, 0, -i * spacing);
    if (leader) {
      // the scoutmaster carries a flag on a pole
      const pole = cyl(0.015, 0.015, 1.6, toon(0x8a6a4a), 0, 0.6, 0, 5);
      f.handR.add(pole);
      const flag = mesh(new THREE.PlaneGeometry(0.5, 0.32), toon(0xf2d23a, { side: THREE.DoubleSide }), 0.26, 1.2, 0);
      f.handR.add(flag);
      f.armR.rotation.x = -0.4;
    }
    g.add(f.group);
    scouts.push(f);
  }
  let saluteT = 0, haltT = 0;
  const ch: Character & { salute(): void; halt(): void; marching: boolean } = {
    group: g, marching: true,
    salute() { saluteT = 2.8; haltT = Math.max(haltT, 2.8); },
    halt() { haltT = 2.4; },
    update(dt, t) {
      if (saluteT > 0) saluteT -= dt;
      if (haltT > 0) haltT -= dt;
      ch.marching = haltT <= 0;
      scouts.forEach((f, i) => {
        if (ch.marching) {
          figureWalk(f, t, 7.5, 0.5, 0); // in perfect step: no phase offset
          if (i === 0) f.armR.rotation.x = -0.4;
        } else {
          relaxLegs(f, dt, 8);
          f.body.position.y = damp(f.body.position.y, f.hipY, 8, dt);
          if (i === 0) f.armR.rotation.x = damp(f.armR.rotation.x, -0.4, 8, dt);
        }
        if (saluteT > 0) {
          // right hand to the brow; left arm straight
          f.armR.rotation.x = damp(f.armR.rotation.x, -2.35, 12, dt);
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.75, 12, dt);
          f.armR.rotation.y = damp(f.armR.rotation.y, -0.9, 12, dt);
          f.armL.rotation.x = damp(f.armL.rotation.x, 0, 12, dt);
          f.head.rotation.x = damp(f.head.rotation.x, -0.05, 8, dt);
        } else if (!ch.marching) {
          relaxArms(f, dt, 6);
          if (i === 0) f.armR.rotation.x = damp(f.armR.rotation.x, -0.4, 6, dt);
          f.head.rotation.y = damp(f.head.rotation.y, -0.5, 4, dt); // all look at the box
        } else {
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.08, 6, dt); f.armR.rotation.y = damp(f.armR.rotation.y, 0, 6, dt);
          f.head.rotation.y = damp(f.head.rotation.y, 0, 4, dt);
          f.head.rotation.x = damp(f.head.rotation.x, 0, 4, dt);
        }
      });
    },
  };
  return ch;
}

// ---------------- The Alien ----------------
export function makeAlien() {
  const g = new THREE.Group();
  const grey = toon(0x7d8290, { emissive: 0x1c1e26 });
  const dark = new THREE.MeshToonMaterial({ color: 0x0b0c10 });
  const H = 3.2;
  const f = makeFigure({ h: H, skin: 0xb9bcc4, hair: 0xb9bcc4, hairStyle: 'none', top: 0xb9bcc4, bottom: 0xb9bcc4, shoes: 0xb9bcc4 });
  // thin it down: scale the limbs and torso narrower
  f.torso.scale.set(0.8, 1.05, 0.6);
  for (const p of [f.armL, f.armR]) { p.scale.set(0.7, 1.15, 0.7); }
  for (const p of [f.legL, f.legR]) { p.scale.set(0.7, 1.0, 0.7); }
  // big head with huge black eyes
  const hr = H * 0.105;
  const bigHead = ellipsoid(hr * 1.35, hr * 1.55, hr * 1.25, grey, 0, hr * 0.35, -hr * 0.1);
  f.head.add(bigHead);
  for (const s of [-1, 1]) {
    const e = ellipsoid(hr * 0.42, hr * 0.62, hr * 0.15, dark, s * hr * 0.6, hr * 0.25, hr * 1.1);
    e.rotation.z = -s * 0.5;
    f.head.add(e);
  }
  // the meteorite it takes
  const rock = mesh(new THREE.DodecahedronGeometry(0.34, 0), toon(0x3a3238));
  rock.visible = false;
  f.handL.add(rock);
  g.add(f.group);
  // timeline: 0 hidden, 1 descending, 2 posing, 3 ascending
  const st = { phase: 0, t: 0, top: 22, bottom: 0 };
  const ch: Character & { state: typeof st; start(top: number, bottom: number): void; rock: THREE.Mesh; visible: boolean } = {
    group: g, state: st, rock, visible: false,
    start(top, bottom) { st.phase = 1; st.t = 0; st.top = top; st.bottom = bottom; g.visible = true; ch.visible = true; rock.visible = false; },
    update(dt, t) {
      if (st.phase === 0) { g.visible = false; ch.visible = false; return; }
      st.t += dt;
      if (st.phase === 1) {
        const p = clamp(st.t / 4.5, 0, 1);
        const e = 1 - Math.pow(1 - p, 2);
        g.position.y = lerp(st.top, st.bottom, e);
        g.rotation.y = t * 0.6;
        // arms out slightly while it floats
        f.armL.rotation.z = damp(f.armL.rotation.z, -0.5, 4, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.5, 4, dt);
        f.legL.rotation.x = 0; f.legR.rotation.x = 0;
        if (p >= 1) { st.phase = 2; st.t = 0; }
      } else if (st.phase === 2) {
        // freeze in an awkward pose, grabbing the meteorite
        g.rotation.y = damp(g.rotation.y, 0, 6, dt);
        f.armR.rotation.x = damp(f.armR.rotation.x, -2.9, 8, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.45, 8, dt);
        f.armL.rotation.x = damp(f.armL.rotation.x, -1.0, 8, dt); f.armL.rotation.z = damp(f.armL.rotation.z, -0.9, 8, dt);
        f.legL.rotation.x = damp(f.legL.rotation.x, -1.05, 8, dt);
        f.head.rotation.z = damp(f.head.rotation.z, 0.32, 8, dt);
        f.body.rotation.y = damp(f.body.rotation.y, 0.28, 8, dt);
        rock.visible = st.t > 1.2;
        if (st.t >= 8) { st.phase = 3; st.t = 0; }
      } else if (st.phase === 3) {
        const p = clamp(st.t / 3.2, 0, 1);
        g.position.y = lerp(st.bottom, st.top, p * p);
        g.rotation.y += dt * 1.2;
        f.legL.rotation.x = damp(f.legL.rotation.x, 0, 4, dt);
        f.armR.rotation.x = damp(f.armR.rotation.x, -0.4, 4, dt); f.armL.rotation.x = damp(f.armL.rotation.x, -0.9, 4, dt);
        if (p >= 1) { st.phase = 0; g.visible = false; ch.visible = false; }
      }
    },
  };
  g.visible = false;
  return ch;
}

// ---------------- The UFO ----------------
export function makeUfo() {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -0.75), new THREE.Vector2(1.8, -0.65), new THREE.Vector2(3.4, -0.3), new THREE.Vector2(4.4, 0), new THREE.Vector2(3.4, 0.28), new THREE.Vector2(1.4, 0.55), new THREE.Vector2(0.01, 0.6)];
  const hull = mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 0.55, roughness: 0.4 }), 0, 0, 0);
  g.add(hull);
  g.add(mesh(new THREE.TorusGeometry(4.35, 0.12, 6, 36), toon(0x4a4f58), 0, 0, 0).rotateX(Math.PI / 2));
  const dome = mesh(new THREE.SphereGeometry(1.35, 18, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xaee3f2, transparent: true, opacity: 0.55 }), 0, 0.55, 0);
  g.add(dome);
  const lights: THREE.Mesh[] = [];
  const lightMat = () => glow(0xfff0a0, 1.2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const l = sphere(0.16, lightMat(), Math.cos(a) * 3.6, -0.32, Math.sin(a) * 3.6, 8, 6);
    g.add(l); lights.push(l);
  }
  g.add(cyl(0.9, 1.4, 0.4, toon(0x6a6f78), 0, -0.85, 0, 16));
  // beam of light below (scaled to the hover height when shown)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
  beamGeo.translate(0, -0.5, 0); // apex at origin, opens downward
  const beam = mesh(beamGeo, beamMat, 0, -0.9, 0);
  beam.rotation.x = Math.PI; // cone apex points up at the saucer
  beam.visible = false;
  g.add(beam);
  let beamOn = false, beamAmt = 0;
  const ch: Character & { setBeam(on: boolean, length: number): void; hover: number } = {
    group: g, hover: 0,
    setBeam(on, length) { beamOn = on; beam.scale.set(3.2, length, 3.2); beam.visible = true; },
    update(dt, t) {
      g.position.y = ch.hover + Math.sin(t * 0.9) * 0.45;
      g.rotation.y += dt * 0.35;
      g.rotation.z = Math.sin(t * 0.7) * 0.04; g.rotation.x = Math.cos(t * 0.55) * 0.04;
      lights.forEach((l, i) => {
        const on = ((Math.floor(t * 6) + i) % 14) < 5;
        (l.material as THREE.MeshBasicMaterial).color.setHex(0xfff0a0).multiplyScalar(on ? 1.6 : 0.45);
      });
      beamAmt = damp(beamAmt, beamOn ? 1 : 0, 3, dt);
      beamMat.opacity = beamAmt * (0.22 + Math.sin(t * 5) * 0.05);
      beam.rotation.y = -g.rotation.y;
      if (beamAmt < 0.01 && !beamOn) beam.visible = false;
    },
  };
  return ch;
}

// ---------------- The Belafonte ----------------
export function makeBelafonte() {
  const g = new THREE.Group();
  const hullBlue = toon(0x9cc8e4), white = toon(0xf6f6f2), yellow = toon(0xf2d23a), dark = toon(0x3a4048);
  const L = 42, W = 9, H = 4.2;
  const hull = box(W, H, L, hullBlue, 0, H / 2 - 1.2, 0);
  g.add(hull);
  g.add(box(W + 0.1, 0.5, L + 0.1, white, 0, H - 1.5, 0)); // white band
  const bow = cone(W / 2, 9, hullBlue, 0, H / 2 - 1.2, L / 2 + 4.5, 4);
  bow.rotation.x = Math.PI / 2; bow.rotation.y = 0; bow.scale.y = 1;
  bow.geometry.rotateY(Math.PI / 4);
  bow.scale.set(1, 1, H / W);
  g.add(bow);
  g.add(box(W, 0.3, L, toon(0xe8e2d2), 0, H - 1.05, 0)); // deck
  // superstructure: white blocks with pale blue window strips
  const winMat = glow(0xcfe9f4, 1.0);
  const block = (w: number, h: number, d: number, x: number, y: number, z: number) => { g.add(box(w, h, d, white, x, y, z)); g.add(box(w + 0.05, 0.6, d + 0.05, winMat, x, y + h * 0.18, z)); };
  block(7, 2.6, 12, 0, H - 0.9 + 1.3, 2);
  block(5.5, 2.4, 7, 0, H - 0.9 + 2.6 + 1.2, 4);
  block(4, 2.2, 4, 0, H - 0.9 + 5 + 1.1, 5.5); // bridge
  g.add(cyl(0.9, 1.0, 3.2, white, 0, H - 0.9 + 5 + 1.6, -1.5, 12));
  g.add(cyl(0.95, 0.95, 0.5, toon(0xd23c3c), 0, H - 0.9 + 5 + 3.0, -1.5, 12));
  // mast with a radar dish and a Team Zissou pennant
  const mast = cyl(0.08, 0.1, 7, dark, 0, H - 0.9 + 6 + 3, 6, 6);
  g.add(mast);
  const radar = box(1.4, 0.3, 0.2, white, 0, H - 0.9 + 6 + 5.5, 6);
  g.add(radar);
  const flag = mesh(new THREE.PlaneGeometry(1.6, 0.9), toon(0x8ec3e6, { side: THREE.DoubleSide }), 0.8, H - 0.9 + 6 + 6.2, 6);
  g.add(flag);
  // aft helipad with a yellow helicopter
  const padTex = textTexture('H', { font: 'bold 96px Georgia, serif', color: '#ffffff', bg: '#2f6f8a', w: 128, h: 128 });
  const pad = mesh(new THREE.CircleGeometry(3.6, 24), new THREE.MeshLambertMaterial({ map: padTex }), 0, H - 0.88, -14);
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);
  const heli = new THREE.Group();
  heli.add(ellipsoid(0.9, 0.8, 1.6, yellow, 0, 0.9, 0));
  heli.add(ellipsoid(0.7, 0.6, 0.6, new THREE.MeshLambertMaterial({ color: 0xbfe4f4, transparent: true, opacity: 0.7 }), 0, 1.0, 1.25));
  const boom = cyl(0.14, 0.24, 3.2, yellow, 0, 1.05, -2.4, 8); boom.rotation.x = Math.PI / 2; heli.add(boom);
  heli.add(box(0.1, 0.9, 0.6, yellow, 0, 1.5, -3.9));
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = box(6.2, 0.05, 0.22, dark, 0, 0, 0); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  rotor.position.set(0, 1.85, 0);
  heli.add(cyl(0.08, 0.08, 0.3, dark, 0, 1.75, 0, 6), rotor);
  const tailRotor = new THREE.Group();
  tailRotor.add(box(0.9, 0.04, 0.12, dark, 0, 0, 0));
  tailRotor.position.set(0.15, 1.6, -3.95);
  tailRotor.rotation.y = Math.PI / 2;
  heli.add(tailRotor);
  for (const s of [-1, 1]) { const sk = cyl(0.04, 0.04, 2.4, dark, s * 0.6, 0.12, 0, 5); sk.rotation.x = Math.PI / 2; heli.add(sk); }
  heli.position.set(0, H - 0.85, -14);
  g.add(heli);
  // observation bubble on the starboard bow, below the deck line
  g.add(sphere(1.15, new THREE.MeshLambertMaterial({ color: 0xbfe8f4, transparent: true, opacity: 0.55 }), -W / 2 - 0.4, 0.5, 12, 16, 12));
  g.add(mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 20), white, -W / 2 - 0.1, 0.5, 12).rotateY(Math.PI / 2));
  // crane, railings, a couple of vents
  g.add(cyl(0.1, 0.12, 5, dark, -2.6, H - 0.9 + 2.5, -7, 6));
  { const arm = cyl(0.07, 0.09, 6, dark, -2.6, H - 0.9 + 4.6, -9.6, 6); arm.rotation.x = 1.0; g.add(arm); }
  const railMat = toon(0xf6f6f2);
  for (const s of [-1, 1]) {
    const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, L - 2, 5), railMat, s * (W / 2 - 0.2), H - 0.9 + 1.0, 0); r.rotation.x = Math.PI / 2; g.add(r);
    for (let z = -L / 2 + 2; z <= L / 2 - 2; z += 4) g.add(cyl(0.03, 0.03, 1.0, railMat, s * (W / 2 - 0.2), H - 0.9 + 0.5, z, 5));
  }
  for (const z of [-4, -6]) g.add(cyl(0.3, 0.3, 1.2, white, 2.4, H - 0.9 + 0.6, z, 8));
  // name on both sides
  const nameTex = textTexture('BELAFONTE', { font: 'bold 60px Georgia, serif', color: '#2f4a5e', w: 512, h: 96 });
  for (const s of [-1, 1]) {
    const n = mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }), s * (W / 2 + 0.06), H - 1.0, 12);
    n.rotation.y = s * Math.PI / 2;
    g.add(n);
  }
  // lifeboat and a small zodiac
  g.add(ellipsoid(0.6, 0.4, 1.6, toon(0xf07a3a), 3.8, H - 0.9 + 1.4, -3));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  let hornT = 0, rotorSpeed = 0;
  const ch: Character & { horn(): void; deckY: number; hull: THREE.Mesh } = {
    group: g, deckY: H - 0.9, hull,
    horn() { hornT = 4; },
    update(dt, t) {
      g.position.y = Math.sin(t * 0.6) * 0.12;
      g.rotation.z = Math.sin(t * 0.5) * 0.012;
      g.rotation.x = Math.cos(t * 0.42) * 0.006;
      radar.rotation.y = t * 1.2;
      flag.rotation.y = Math.sin(t * 2.5) * 0.25;
      if (hornT > 0) hornT -= dt;
      rotorSpeed = damp(rotorSpeed, hornT > 0 ? 28 : 0, 2.5, dt);
      rotor.rotation.y += rotorSpeed * dt;
      tailRotor.rotation.z += rotorSpeed * 2 * dt;
    },
  };
  return ch;
}

// ---------------- Team Zissou ----------------
export function makeTeamZissou(count: number, rng: Rng) {
  const g = new THREE.Group();
  const crew: Figure[] = [];
  const spacing = 1.25;
  for (let i = 0; i < count; i++) {
    const centre = i === Math.floor(count / 2);
    const f = makeFigure({
      h: centre ? 1.8 : 1.68 + rng.range(-0.06, 0.06), skin: rng.pick([0xf1cfb4, 0xe9c4a6, 0xc98a62, 0xa86a48]), hair: centre ? 0xcfcfcf : rng.pick([0x5a3a24, 0x2a2320, 0x8a5a3a]),
      hairStyle: 'short', top: 0x8ec3e6, bottom: 0x8ec3e6, shoes: 0xf6f6f2, hat: { kind: 'beanie', color: 0xd23c3c },
      beard: centre ? 0xdedede : undefined, glasses: !centre && rng.chance(0.4), buttons: 0xf6f6f2,
    });
    f.group.position.set((i - (count - 1) / 2) * spacing, 0, 0);
    g.add(f.group);
    crew.push(f);
  }
  let pointT = 0, saluteT = 0;
  const ch: Character & { point(): void; salute(): void } = {
    group: g,
    point() { pointT = 3.6; },
    salute() { saluteT = 2.4; },
    update(dt, t) {
      crew.forEach((f, i) => {
        figureIdle(f, t, i * 1.3);
        if (pointT > 0) {
          f.armR.rotation.x = damp(f.armR.rotation.x, -1.5, 10, dt);
          f.armR.rotation.y = damp(f.armR.rotation.y, 0.75, 10, dt);
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.1, 10, dt);
          f.head.rotation.y = damp(f.head.rotation.y, -0.7, 8, dt);
        } else if (saluteT > 0) {
          f.armR.rotation.x = damp(f.armR.rotation.x, -2.35, 12, dt);
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.75, 12, dt);
          f.armR.rotation.y = damp(f.armR.rotation.y, -0.9, 12, dt);
          f.head.rotation.y = damp(f.head.rotation.y, 0, 8, dt);
        } else {
          relaxArms(f, dt, 5);
          f.head.rotation.y = damp(f.head.rotation.y, Math.sin(t * 0.4 + i) * 0.08, 3, dt);
        }
      });
      if (pointT > 0) pointT -= dt;
      if (saluteT > 0) saluteT -= dt;
    },
  };
  return ch;
}

// ---------------- The jaguar shark ----------------
export function makeJaguarShark(rng: Rng) {
  const g = new THREE.Group();
  const skin = toon(0x3d4d63), belly = toon(0x9fb3c4);
  const RX = 1.7, RY = 1.35, RZ = 6.8;
  const body = ellipsoid(RX, RY, RZ, skin, 0, 0, 0, 22, 14);
  g.add(body);
  const bellyM = ellipsoid(RX * 0.85, RY * 0.75, RZ * 0.9, belly, 0, -0.35, 0.2, 18, 12);
  g.add(bellyM);
  // fins and tail
  const dorsal = cone(0.9, 1.9, skin, 0, RY + 0.4, -0.5, 4); dorsal.scale.x = 0.35; dorsal.rotation.y = Math.PI / 4; g.add(dorsal);
  for (const s of [-1, 1]) { const p = cone(0.7, 2.2, skin, s * (RX + 0.6), -0.3, 1.2, 4); p.rotation.z = s * Math.PI / 2 - s * 0.3; p.rotation.x = 0.5; p.scale.z = 0.35; g.add(p); }
  const tail = new THREE.Group();
  const up = cone(0.6, 2.6, skin, 0, 1.0, -0.6, 4); up.rotation.x = -0.9; up.scale.x = 0.4; tail.add(up);
  const lo = cone(0.5, 1.8, skin, 0, -0.7, -0.5, 4); lo.rotation.x = Math.PI + 0.9; lo.scale.x = 0.4; tail.add(lo);
  tail.position.set(0, 0, -RZ - 0.4);
  g.add(tail);
  // eyes and gills
  const dark = toon(0x0b0c10);
  for (const s of [-1, 1]) {
    g.add(sphere(0.16, dark, s * RX * 0.72, 0.35, RZ * 0.62, 8, 6));
    for (let i = 0; i < 4; i++) g.add(box(0.05, 0.7, 0.08, dark, s * RX * 0.95, 0.05, RZ * 0.35 - i * 0.28));
  }
  // faintly glowing spots on the back
  const spotMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 48; i++) {
    const u = rng.range(-0.88, 0.85);
    const a = rng.range(-1.35, 1.35);
    const r = Math.sqrt(1 - u * u);
    const x = RX * Math.sin(a) * r, y = RY * Math.cos(a) * r, z = RZ * u;
    const m = glow(0x9ff0ff, 0.6 + rng.range(0, 0.4));
    spotMats.push(m);
    g.add(sphere(rng.range(0.1, 0.22), m, x, y, z, 7, 5));
  }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  // 0 hidden, 1 rising, 2 cruising at the surface, 3 diving
  const st = { phase: 0, t: 0, hidden: -10, surface: -0.5 };
  g.position.y = st.hidden;
  g.visible = false;
  const ch: Character & { state: typeof st; surface(): void; visible: boolean } = {
    group: g, state: st, visible: false,
    surface() { if (st.phase === 0) { st.phase = 1; st.t = 0; g.visible = true; ch.visible = true; } },
    update(dt, t) {
      if (st.phase === 0) return;
      st.t += dt;
      const pulse = 0.75 + 0.45 * Math.sin(t * 2.2) + 0.15 * Math.sin(t * 7.1);
      for (const m of spotMats) m.color.setHex(0x9ff0ff).multiplyScalar(0.7 * pulse);
      tail.rotation.y = Math.sin(t * 2.2) * 0.35;
      body.rotation.y = Math.sin(t * 2.2 + 0.4) * 0.03;
      if (st.phase === 1) {
        const p = clamp(st.t / 5, 0, 1);
        g.position.y = lerp(st.hidden, st.surface, 1 - Math.pow(1 - p, 2));
        g.rotation.x = -0.18 * Math.sin(p * Math.PI);
        if (p >= 1) { st.phase = 2; st.t = 0; }
      } else if (st.phase === 2) {
        g.position.y = st.surface + Math.sin(t * 1.1) * 0.15;
        g.position.z -= dt * 1.4;
        g.rotation.x = damp(g.rotation.x, 0, 3, dt);
        if (st.t >= 7) { st.phase = 3; st.t = 0; }
      } else if (st.phase === 3) {
        const p = clamp(st.t / 5, 0, 1);
        g.position.y = lerp(st.surface, st.hidden, p * p);
        g.position.z -= dt * 2.0;
        g.rotation.x = 0.22 * Math.sin(p * Math.PI);
        if (p >= 1) { st.phase = 0; g.visible = false; ch.visible = false; }
      }
    },
  };
  return ch;
}

// ---------------- Deep Search (the yellow submarine) ----------------
export function makeDeepSearch() {
  const g = new THREE.Group();
  const yellow = toon(0xf2c832), dark = toon(0x2a2c30);
  const hull = capsule(1.0, 4.2, yellow, 0, 0, 0);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  g.add(box(1.1, 1.0, 1.7, yellow, 0, 1.1, 0.3)); // conning tower
  const periscope = cyl(0.06, 0.06, 1.4, dark, 0, 1.9, 0.3, 6);
  g.add(periscope);
  g.add(box(0.3, 0.1, 0.1, dark, 0.1, 2.6, 0.3));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CircleGeometry(0.16, 10), toon(0x2f4a5e), s * 1.01, 0.15, -1.2 + i * 1.1).rotateY(s * Math.PI / 2));
  for (const s of [-1, 1]) g.add(box(1.2, 0.06, 0.5, yellow, s * 1.2, 0.2, 0.8)); // dive planes
  const prop = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = box(0.9, 0.05, 0.2, dark, 0, 0, 0); b.rotation.z = (i / 3) * Math.PI; prop.add(b); }
  prop.position.set(0, 0, -3.3);
  g.add(prop);
  g.add(cone(0.35, 0.8, yellow, 0, 0.9, -2.4, 4).rotateY(Math.PI / 4)); // rudder fin
  const nameTex = textTexture('DEEP SEARCH', { font: 'bold 44px Georgia, serif', color: '#2a2c30', w: 512, h: 64 });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(2.2, 0.28), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }), s * 0.56, 1.35, 0.3); n.rotation.y = s * Math.PI / 2; g.add(n); }
  let surfaceT = 0;
  const ch: Character & { surface(): void } = {
    group: g,
    surface() { surfaceT = 6; },
    update(dt, t) {
      prop.rotation.z += dt * 6;
      if (surfaceT > 0) surfaceT -= dt;
      // usually half-submerged, rolling in the swell; fully up when called
      const natural = -1.1 + Math.sin(t * 0.22) * 0.9;
      const target = surfaceT > 0 ? 0.35 : natural;
      g.position.y = damp(g.position.y, target, surfaceT > 0 ? 1.2 : 0.8, dt);
      g.rotation.x = damp(g.rotation.x, surfaceT > 0 ? -0.08 : Math.sin(t * 0.5) * 0.06, 2, dt);
      g.rotation.z = Math.sin(t * 0.8) * 0.04;
      periscope.position.y = damp(periscope.position.y, surfaceT > 0 ? 2.4 : 1.9, 3, dt);
      periscope.rotation.y = surfaceT > 0 ? t * 1.5 : 0;
    },
  };
  return ch;
}

// ---------------- Funicular ----------------
/** Two counterbalanced cars on a slanted rail from `bottom` to `top`. Local: bottom at origin, rails run up local +z. */
export function makeFunicular(bottom: THREE.Vector3, top: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.copy(bottom);
  const d = top.clone().sub(bottom);
  const horiz = Math.hypot(d.x, d.z);
  const angle = Math.atan2(d.y, horiz);
  const L = d.length();
  g.rotation.y = Math.atan2(d.x, d.z);
  const slope = new THREE.Group();
  slope.rotation.x = -angle;
  g.add(slope);
  const stone = toon(0xc9c1b6), iron = toon(0x4a4f58), cream = toon(0xf5efe2), burgundy = toon(0x7a2a36), pink = toon(0xf2b8c6);
  slope.add(box(4.2, 0.35, L, stone, 0, -0.18, L / 2));
  for (const x of [-1.5, -0.5, 0.5, 1.5]) slope.add(box(0.08, 0.1, L, iron, x, 0.05, L / 2));
  for (let z = 0.6; z < L; z += 1.4) slope.add(box(4.0, 0.08, 0.3, toon(0x6a5a4a), 0, -0.02, z));
  slope.add(cyl(0.02, 0.02, L, iron, -1.0, 0.25, L / 2, 4).rotateX(Math.PI / 2));
  slope.add(cyl(0.02, 0.02, L, iron, 1.0, 0.25, L / 2, 4).rotateX(Math.PI / 2));
  // the two cars, each kept level with a counter-rotation
  const makeCar = (x: number) => {
    const c = new THREE.Group();
    c.position.set(x, 0.1, 0);
    c.rotation.x = angle;
    const body = new THREE.Group();
    body.add(box(1.7, 1.7, 2.4, cream, 0, 1.15, 0));
    body.add(box(1.75, 0.35, 2.45, pink, 0, 0.5, 0));
    body.add(box(1.8, 0.25, 2.6, burgundy, 0, 2.08, 0));
    const winMat = new THREE.MeshLambertMaterial({ color: 0xd9ecf6, emissive: 0x88a8b8, emissiveIntensity: 0.15 });
    for (const s of [-1, 1]) for (const z of [-0.7, 0.1, 0.8]) body.add(box(0.05, 0.7, 0.55, winMat, s * 0.86, 1.35, z));
    body.add(box(1.3, 0.7, 0.05, winMat, 0, 1.35, 1.21), box(1.3, 0.7, 0.05, winMat, 0, 1.35, -1.21));
    const lamp = sphere(0.1, glow(0xfff0c0, 1.2), 0, 2.3, 1.1, 8, 6);
    body.add(lamp);
    body.add(box(1.6, 0.3, 0.4, iron, 0, 0.15, 1.2), box(1.6, 0.3, 0.4, iron, 0, 0.15, -1.2));
    body.add(box(1.7, 0.2, 0.9, iron, 0, 0.05, 0)); // wedge base (visually it sits on the slope)
    c.add(body);
    slope.add(c);
    return { c, lamp, body };
  };
  const carA = makeCar(-1.0), carB = makeCar(1.0);
  // top station wheelhouse
  slope.add(box(3.6, 1.2, 1.4, stone, 0, 0.5, L + 0.7));
  slope.add(cyl(0.5, 0.5, 0.6, iron, 0, 0.9, L + 0.4, 12).rotateX(Math.PI / 2));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  let u = 0.15, dir = 1, wait = 0, ringT = 0;
  const ch: Character & { ring(): void; carA: THREE.Group; carB: THREE.Group } = {
    group: g, carA: carA.c, carB: carB.c,
    ring() { ringT = 2.5; wait = Math.max(wait, 2.5); },
    update(dt, t) {
      if (ringT > 0) ringT -= dt;
      if (wait > 0) wait -= dt;
      else {
        u += dir * dt * 0.045;
        if (u >= 1) { u = 1; dir = -1; wait = 4; }
        if (u <= 0) { u = 0; dir = 1; wait = 4; }
      }
      const zA = 1.5 + u * (L - 3), zB = 1.5 + (1 - u) * (L - 3);
      carA.c.position.z = zA; carB.c.position.z = zB;
      const rock = Math.sin(t * 3) * 0.01 * (wait > 0 ? 0 : 1);
      carA.body.rotation.z = rock; carB.body.rotation.z = -rock;
      const flash = ringT > 0 ? (Math.sin(t * 18) > 0 ? 2.2 : 0.6) : 1.2;
      for (const c of [carA, carB]) (c.lamp.material as THREE.MeshBasicMaterial).color.setHex(0xfff0c0).multiplyScalar(flash);
      if (ringT > 0) { carA.body.position.y = Math.abs(Math.sin(t * 12)) * 0.04; carB.body.position.y = Math.abs(Math.sin(t * 12)) * 0.04; }
      else { carA.body.position.y = damp(carA.body.position.y, 0, 8, dt); carB.body.position.y = damp(carB.body.position.y, 0, 8, dt); }
    },
  };
  return ch;
}

// ---------------- Mendl's delivery van ----------------
export function makeMendlsVan() {
  const g = new THREE.Group();
  const pink = toon(0xf2b8c6), white = toon(0xfbf7f2), dark = toon(0x2a2c30);
  g.add(box(2.0, 1.5, 4.6, pink, 0, 1.25, 0));
  g.add(box(2.05, 0.2, 4.65, white, 0, 0.6, 0));
  g.add(box(2.1, 0.12, 4.7, white, 0, 2.05, 0));
  g.add(box(1.9, 0.9, 1.1, pink, 0, 0.95, 2.6)); // bonnet
  g.add(box(1.8, 0.7, 0.06, new THREE.MeshLambertMaterial({ color: 0xd9ecf6 }), 0, 1.5, 2.06)); // windscreen
  const lights = [sphere(0.16, glow(0xfff2c0, 1.0), -0.7, 0.95, 3.16, 8, 6), sphere(0.16, glow(0xfff2c0, 1.0), 0.7, 0.95, 3.16, 8, 6)];
  g.add(...lights);
  g.add(box(2.0, 0.2, 0.3, toon(0xd8b25a), 0, 0.5, 3.15)); // brass bumper
  for (const s of [-1, 1]) for (const z of [-1.5, 1.9]) { const w = cyl(0.38, 0.38, 0.3, dark, s * 1.0, 0.4, z, 12); w.rotation.z = Math.PI / 2; g.add(w); g.add(cyl(0.16, 0.16, 0.32, toon(0xd8b25a), s * 1.0, 0.4, z, 8).rotateZ(Math.PI / 2)); }
  const tex = textTexture("MENDL'S", { font: 'italic bold 72px Georgia, serif', color: '#7a2a36', w: 512, h: 128 });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), s * 1.01, 1.35, -0.2); n.rotation.y = s * Math.PI / 2; g.add(n); }
  // a little cake emblem on the back doors
  g.add(cyl(0.3, 0.3, 0.04, white, 0, 1.3, -2.31, 12).rotateX(Math.PI / 2));
  g.add(sphere(0.1, toon(0xd23c5a), 0, 1.3, -2.36, 8, 6));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  let flashT = 0;
  const ch: Character & { flash(): void } = {
    group: g,
    flash() { flashT = 1.6; },
    update(dt, t) {
      if (flashT > 0) flashT -= dt;
      const k = flashT > 0 ? (Math.sin(t * 16) > 0 ? 2.4 : 0.7) : 1.0;
      for (const l of lights) (l.material as THREE.MeshBasicMaterial).color.setHex(0xfff2c0).multiplyScalar(k);
      g.position.y = flashT > 0 ? Math.abs(Math.sin(t * 20)) * 0.03 : damp(g.position.y, 0, 8, dt);
    },
  };
  return ch;
}

// ---------------- Birds ----------------
/** Gulls circling a point. */
export function makeGulls(count: number, rng: Rng) {
  const g = new THREE.Group();
  const white = toon(0xffffff, { side: THREE.DoubleSide });
  const grey = toon(0xd8dde2, { side: THREE.DoubleSide });
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; phase: number; radius: number; speed: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const wing = new THREE.PlaneGeometry(1.0, 0.32);
    const l = mesh(wing, i % 3 ? white : grey, -0.5, 0, 0), r = mesh(wing, i % 3 ? white : grey, 0.5, 0, 0);
    b.add(l, r, ellipsoid(0.11, 0.09, 0.28, white));
    g.add(b);
    birds.push({ g: b, l, r, phase: rng.range(0, 10), radius: rng.range(7, 22), speed: rng.range(0.25, 0.5) * rng.sign(), h: rng.range(0, 7) });
  }
  let scatterT = 0;
  const ch: Character & { scatter(): void } = {
    group: g,
    scatter() { scatterT = 3; },
    update(dt, t) {
      if (scatterT > 0) scatterT -= dt;
      const boost = scatterT > 0 ? 2.2 : 1;
      for (const b of birds) {
        const a = t * b.speed * boost + b.phase;
        b.g.position.set(Math.cos(a) * b.radius, b.h + Math.sin(t * 0.7 + b.phase) * 1.5 + (scatterT > 0 ? 3 : 0), Math.sin(a) * b.radius);
        b.g.rotation.y = -a + (b.speed > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * (scatterT > 0 ? 11 : 6) + b.phase) * 0.6;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
    },
  };
  return ch;
}

/** A V of small dark birds drifting slowly across the sky. */
export function makeBirdFlock(count: number) {
  const g = new THREE.Group();
  const dark = toon(0x2a2a30, { side: THREE.DoubleSide });
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; i: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const wing = new THREE.PlaneGeometry(0.7, 0.2);
    const l = mesh(wing, dark, -0.35, 0, 0), r = mesh(wing, dark, 0.35, 0, 0);
    b.add(l, r, ellipsoid(0.08, 0.06, 0.2, dark));
    const side = i % 2 ? 1 : -1, k = Math.ceil(i / 2);
    b.position.set(side * k * 1.3, k * 0.1, -k * 1.5);
    g.add(b);
    birds.push({ g: b, l, r, i });
  }
  const ch: Character = {
    group: g,
    update(dt, t) {
      g.position.z += dt * 2.4;
      g.position.y += Math.sin(t * 0.5) * dt * 0.4;
      for (const b of birds) { const flap = Math.sin(t * 7 + b.i * 0.7) * 0.7; b.l.rotation.z = flap; b.r.rotation.z = -flap; }
    },
  };
  return ch;
}
