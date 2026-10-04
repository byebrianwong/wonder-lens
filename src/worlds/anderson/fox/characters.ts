import * as THREE from 'three';
import { charToon, Painter } from '../../../engine/Paint';
import { envelope, limbGeometry, LookAt, profileShape, sculpt } from '../../../engine/Rig';
import { clamp, lerp, TAU } from '../../../engine/math';
import { mendlsBox } from '../kit';
import { StopMotion } from '../stopmotion';
import { makeHead, makePuppet } from './puppet';
import { badgerColors, capeTexture, foxColors, jacketTexture, limbCloth, moleColors, plainFur, possumColors, rabbitColors, ratColors, skirtTexture, wolfColors } from './paint';

/*
 * The cast of "Underneath the Hill": Mr. and Mrs. Fox, Ash and Kristofferson, Kylie, Badger, the Rat, Rabbit
 * the chef, the moles, and the black wolf. Each is a stop-motion puppet (see puppet.ts) with a little idle
 * life and a reaction or two; everything is posed on the puppet's stepped clock, so they move on twos.
 *
 * Every character faces +z with its origin at its feet. `update(dt, t, cam)` takes the camera position for
 * the head to follow (or null).
 */

export interface Character {
  group: THREE.Group;
  update(dt: number, t: number, cam: THREE.Vector3 | null): void;
  bow(): void;
}

const flat = (color: number, rim = 0.3) => charToon({ color, rim, shade: 0xa89490 });

/** An eased 0..1..0 bump over a reaction's time: rise by b, hold to c, fall by d. */
const env = envelope;

// ---------------- the foxes ----------------
const FOX_CREAM = 0xf4ead8;

export interface MrFox extends Character { whistle(): void; catchBox(): void; busy(): boolean }

/**
 * Mr. Fox in his corduroy suit: a camel double-breasted jacket, a white shirt and a rust tie with mustard
 * dots, an orange pocket square, his bushy tail out the back. Idle, he stands with a hand in his pocket and
 * smooths his whiskers now and then. Whistle: his whistle-and-click (a cock of the head, a wink, a finger
 * pointed at you with a click of the tongue). A thrown box: he crouches, springs, catches it overhead.
 */
export function makeMrFox(): MrFox {
  const cloth = 0xc4955a;
  const p = makePuppet({
    seed: 101,
    head: { R: 0.215, snout: 1.0, cheeks: 0.2, squash: [1, 0.92, 0.95], colors: foxColors({ base: 0xc8642a, cream: FOX_CREAM, dark: 0x6a2a14 }), ears: 'fox', earOuter: 0xb85a26, earInner: 0xf2e2cc, earTip: 0x1a1210, eyeSpread: 0.4, eyeUp: 0.22, eyeR: 0.12, whiskers: 0.17, hiRes: true, seed: 103 },
    body: { legLen: 0.74, torsoLen: 0.58, hips: 0.18, waist: 0.165, chest: 0.215, depth: 0.78, skirt: 0.11, armLen: [0.29, 0.27], armR: 0.062, legR: 0.076, neckLen: 0.06 },
    outfit: {
      torso: jacketTexture({ cloth, cord: true, shirt: 0xf6f1e4, tie: 0x9a3a1e, tieDots: 0xe8c04a, buttons: 0x5a3a24, pocketSquare: 0xe8743a, seed: 105 }),
      sleeve: limbCloth(cloth, { cord: true, cuff: 0xf6f1e4, seed: 106 }), trousers: limbCloth(cloth, { cord: true, seed: 107 }),
    },
    limbFur: 0xc8642a, paw: 0x2c1c14,
    tail: { len: 0.82, r: 0.14, color: 0xc8642a, tip: FOX_CREAM, lift: 0.15, curl: 0.9 },
  });
  const box = mendlsBox(1.15);
  box.visible = false;
  box.position.set(0, -0.12, 0.08);
  p.wr[1].add(box);
  let whistleT = -1, catchT = -1, bowT = -1;
  return {
    group: p.group,
    whistle() { if (catchT < 0) whistleT = 0; },
    catchBox() { whistleT = -1; catchT = 0; },
    bow() { bowT = 0; },
    busy: () => whistleT >= 0 || catchT >= 0,
    update(dt, _t, cam) {
      if (!p.step(dt)) return;
      const t = p.sm.t, sd = p.stepDt;
      if (whistleT >= 0) { whistleT += sd; if (whistleT > 2.8) whistleT = -1; }
      if (catchT >= 0) { catchT += sd; if (catchT > 2.6) catchT = -1; }
      if (bowT >= 0) { bowT += sd; if (bowT > 2.4) bowT = -1; }
      p.idle(t, cam, { lookWeight: 1 });
      // idle: left hand in the trouser pocket, the right loose; every eight seconds he smooths a whisker
      const smooth = env(t % 8, 5.2, 5.6, 6.4, 6.9);
      p.arm(0, 0.12 + smooth * 1.5, 0.05, 0.25 + smooth * 1.9);
      p.arm(1, -0.12, 0.22, 0.85);
      p.wr[0].rotation.set(0, 0, smooth * 0.4);
      p.leg(0, 0.02, 0.04, 0.04); p.leg(1, -0.04, 0.06, 0.06);
      p.spine.rotation.set(0.02, 0, Math.sin(t * 0.5) * 0.02);
      p.root.position.y = 0;
      box.visible = false;
      if (whistleT >= 0) {
        // cock the head, raise a paw to the mouth, then point at you with a click and a wink
        const w = whistleT;
        const up = env(w, 0, 0.3, 2.2, 2.7), point = env(w, 0.7, 0.9, 2.0, 2.4);
        const click = w > 0.9 && w < 1.9 ? Math.max(0, Math.sin((w - 0.9) * TAU * 2)) : 0;
        p.arm(0, lerp(0.12, 1.25, up) + point * 0.2, lerp(0.05, 0.15, up), lerp(0.25, 2.1, up) - point * 1.5);
        p.wr[0].rotation.set(-click * 0.6, 0, 0);
        p.head.rotation.z += up * -0.22;
        p.head.rotation.x += click * 0.06;
        p.eyes[1].scale.y = lerp(1, 0.1, point);
        for (const e of p.ears) e.rotation.x -= up * 0.25;
        p.spine.rotation.z += up * 0.05;
      }
      if (catchT >= 0) {
        // crouch, spring up with both paws high, the box lands in the left paw, bring it down to the chest
        const c = catchT;
        const crouch = env(c, 0, 0.25, 0.3, 0.5), reach = env(c, 0.3, 0.55, 0.9, 1.4), hold = env(c, 1.1, 1.5, 2.2, 2.6);
        p.root.position.y = -crouch * 0.12 + Math.max(0, Math.sin(clamp((c - 0.35) / 0.5, 0, 1) * Math.PI)) * 0.18;
        p.leg(0, crouch * 0.5, 0.06, crouch * 0.9); p.leg(1, crouch * 0.5, 0.08, crouch * 0.9);
        p.arm(0, lerp(0.12, 2.8, reach), 0.15, 0.2);
        p.arm(1, lerp(-0.12, 2.8, reach) + hold * -1.5, 0.15 * reach, lerp(0.85, 0.3, reach) + hold * 1.2);
        p.head.rotation.x -= reach * 0.4;
        box.visible = c > 0.62 && c < 2.5;
      }
      if (bowT >= 0) {
        const k = env(bowT, 0, 0.5, 1.4, 2.2);
        p.spine.rotation.x = k * 0.7;
        p.arm(0, k * 0.9, 0.1, k * 1.6);
        p.arm(1, -0.2 * k, 0.15, 0.2);
        p.leg(0, 0.08 * k, 0.04, 0); p.leg(1, -0.08 * k, 0.06, 0);
      }
    },
  };
}

export interface MrsFox extends Character { greet(): void }

/**
 * Mrs. Fox at her easel: a golden coat, a mustard dress under a cream apron splashed with paint, a brush in
 * her right paw and the palette in her left. She paints in short strokes, steps back to look, and goes on.
 * Whistle: she turns to you and lifts her brush.
 */
export function makeMrsFox(): MrsFox {
  const p = makePuppet({
    seed: 201,
    head: { R: 0.2, snout: 0.95, cheeks: 0.17, squash: [0.98, 0.94, 0.95], colors: foxColors({ base: 0xd9883a, cream: FOX_CREAM, dark: 0x7a3a1a }), ears: 'fox', earOuter: 0xc06a2c, earInner: 0xf4e6d0, earTip: 0x2a1a12, eyeSpread: 0.4, eyeUp: 0.22, eyeR: 0.12, whiskers: 0.15, seed: 203 },
    body: { legLen: 0.72, torsoLen: 0.56, hips: 0.17, waist: 0.145, chest: 0.19, depth: 0.78, armLen: [0.28, 0.26], armR: 0.056, legR: 0.066, neckLen: 0.07 },
    outfit: {
      torso: jacketTexture({ cloth: 0xe0b85a, sweater: true, shirt: FOX_CREAM, seed: 205 }),
      sleeve: limbCloth(0xe0b85a, { seed: 206 }), trousers: null,
      skirt: { tex: skirtTexture(0xe0b85a, { seed: 207, apron: 0xf2ead8, splashes: true }), len: 0.62, flare: 0.14 },
    },
    limbFur: 0xd9883a, paw: 0x3a2418,
    tail: { len: 0.74, r: 0.13, color: 0xd9883a, tip: FOX_CREAM, lift: 0.3, curl: 0.8 },
  });
  // brush and palette
  const brush = new THREE.Group();
  brush.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 6).translate(0, 0.08, 0), flat(0x8a5a2a)));
  brush.add(new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 6).rotateX(Math.PI).translate(0, -0.09, 0), flat(0xc83a2a)));
  brush.rotation.x = 1.4; brush.position.set(0, -0.1, 0.05);
  p.wr[0].add(brush);
  const palTex = (() => {
    const pp = new Painter(128, 128, 9).fill('#c89a62');
    for (const [x, y, c] of [[30, 40, '#d84a2a'], [60, 28, '#e8c04a'], [92, 40, '#2a6ab8'], [96, 72, '#3a8a5a'], [70, 96, '#f4f0e8'], [40, 84, '#8a3ab0']] as const) { pp.g.fillStyle = c; pp.g.beginPath(); pp.g.arc(x, y, 9, 0, TAU); pp.g.fill(); }
    return pp.texture({ wrap: false });
  })();
  const palette = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 16).scale(1.2, 1, 0.9), charToon({ map: palTex, rim: 0.2 }));
  palette.rotation.set(Math.PI / 2 - 0.4, 0, 0.3); palette.position.set(0.06, -0.14, 0.08);
  p.wr[1].add(palette);
  let greetT = -1, bowT = -1;
  return {
    group: p.group,
    greet() { greetT = 0; },
    bow() { bowT = 0; },
    update(dt, _t, cam) {
      if (!p.step(dt)) return;
      const t = p.sm.t, sd = p.stepDt;
      if (greetT >= 0) { greetT += sd; if (greetT > 3.2) greetT = -1; }
      if (bowT >= 0) { bowT += sd; if (bowT > 2.4) bowT = -1; }
      const g = greetT >= 0 ? env(greetT, 0, 0.4, 2.4, 3.2) : 0;
      // she paints towards her right (the easel), stepping back every ten seconds to look
      const back = env(t % 10, 6, 6.6, 8, 8.6);
      p.idle(t, g > 0.2 ? cam : null, { lookWeight: g });
      p.head.rotation.y += lerp(-0.55, 0, g);
      p.head.rotation.z += back * 0.12;
      const stroke = Math.sin(t * 5.5) * (1 - back) * (1 - g);
      p.arm(0, 1.1 - back * 0.6 + g * 0.6, -0.25 + stroke * 0.06, 0.6 + stroke * 0.25 - g * 0.3);
      p.arm(1, 0.7, 0.2, 1.3);
      p.spine.rotation.set(0.04 - back * 0.08, -0.25 * (1 - g), 0);
      p.root.position.z = -back * 0.25;
      p.leg(0, 0.05, 0.04, 0.05); p.leg(1, -0.05, 0.05, 0.05);
      if (bowT >= 0) { const k = env(bowT, 0, 0.5, 1.4, 2.2); p.spine.rotation.x = k * 0.6; p.leg(0, -0.3 * k, 0.04, 0.4 * k); }
    },
  };
}

export interface Boys extends Character { kata(): void; catchBox(): void }

/**
 * Ash and Kristofferson. Kristofferson, taller and paler, in a white karate gi with a black belt, practises
 * slow kata; Ash, small and yellow, in his white cape and red bandana, watches with his arms folded and
 * tries a move or two. Whistle: Kristofferson's flying kick, Ash copying and wobbling. A thrown box:
 * Kristofferson catches it with a karate block.
 */
export function makeAshAndKristofferson(): Boys {
  const group = new THREE.Group();
  const kris = makePuppet({
    seed: 301,
    head: { R: 0.18, snout: 0.95, cheeks: 0.15, colors: foxColors({ base: 0xd4a47a, cream: 0xf6efe4, dark: 0x8a5a3a }), ears: 'fox', earOuter: 0xc0906a, earInner: 0xf6ecdc, earTip: 0x3a2a20, eyeSpread: 0.4, eyeR: 0.12, whiskers: 0.14, seed: 303 },
    body: { legLen: 0.64, torsoLen: 0.5, hips: 0.155, waist: 0.145, chest: 0.175, depth: 0.78, skirt: 0.08, armLen: [0.26, 0.24], armR: 0.056, legR: 0.066, neckLen: 0.06 },
    outfit: { torso: jacketTexture({ cloth: 0xf4f0e6, wrap: true, belt: 0x1a1a1c, shirt: 0xd4a47a, seed: 305 }), sleeve: limbCloth(0xf4f0e6, { seed: 306 }), trousers: limbCloth(0xf4f0e6, { seed: 307 }) },
    limbFur: 0xd4a47a, paw: 0x4a3428,
    tail: { len: 0.66, r: 0.12, color: 0xd4a47a, tip: 0xf6efe4, lift: 0.25, curl: 0.8 },
  });
  const ash = makePuppet({
    seed: 401,
    head: { R: 0.19, snout: 0.85, cheeks: 0.12, squash: [1, 0.95, 0.95], colors: foxColors({ base: 0xd8a040, cream: 0xf6ecd4, dark: 0x8a5a1a }), ears: 'fox', earOuter: 0xc08a34, earInner: 0xf4e6cc, earTip: 0x3a2a14, eyeSpread: 0.42, eyeR: 0.13, whiskers: 0.12, seed: 403 },
    body: { legLen: 0.48, torsoLen: 0.42, hips: 0.135, waist: 0.125, chest: 0.145, depth: 0.8, armLen: [0.21, 0.2], armR: 0.05, legR: 0.058, neckLen: 0.05 },
    outfit: {
      torso: jacketTexture({ cloth: 0xe8e0c8, sweater: true, seed: 405 }), sleeve: limbCloth(0xe8e0c8, { stripes: 0xb8584a, seed: 406 }), trousers: limbCloth(0x8a5a3a, { seed: 407 }), shorts: true,
      cape: { tex: capeTexture(0xf6f2ea, 409, 0xd8c8a8), len: 0.62 }, bandana: 0xc8302a,
    },
    limbFur: 0xf2eee6, paw: 0x4a3420,
    tail: { len: 0.58, r: 0.11, color: 0xd8a040, tip: 0xf6ecd4, lift: 0.35, curl: 1.0 },
  });
  kris.group.position.set(0.6, 0, 0);
  ash.group.position.set(-0.7, 0, 0.3);
  ash.group.rotation.y = 0.35;
  kris.group.rotation.y = -0.25;
  group.add(kris.group, ash.group);
  const box = mendlsBox(1.1);
  box.visible = false; box.position.set(0, -0.12, 0.06);
  kris.wr[0].add(box);
  let kickT = -1, catchT = -1, bowT = -1;
  const kTime = { v: 0 };
  return {
    group,
    kata() { if (catchT < 0) kickT = 0; },
    catchBox() { kickT = -1; catchT = 0; },
    bow() { bowT = 0; },
    update(dt, _t, cam) {
      // the two puppets keep their own steps
      if (kris.step(dt)) {
        const t = kris.sm.t, sd = kris.stepDt;
        kTime.v = t;
        if (kickT >= 0) { kickT += sd; if (kickT > 2.6) kickT = -1; }
        if (catchT >= 0) { catchT += sd; if (catchT > 2.4) catchT = -1; }
        if (bowT >= 0) { bowT += sd; if (bowT > 2.4) bowT = -1; }
        kris.idle(t, cam, { lookWeight: kickT >= 0 || catchT >= 0 ? 0.3 : 0.7, breathe: 0.6 });
        // slow kata: a block and a punch, alternating sides, on a four-second count
        const ph = (t % 8) / 8, side = ph < 0.5 ? 0 : 1;
        const a = Math.sin((ph % 0.5) * 2 * Math.PI);
        kris.arm(side, 1.3 * Math.max(0, a), 0.1, 1.6 - 1.5 * Math.max(0, a));
        kris.arm(side === 0 ? 1 : 0, 0.5, 0.15, 2.3);
        kris.leg(0, 0.25, 0.18, 0.35); kris.leg(1, -0.2, 0.18, 0.2);
        kris.root.position.y = -0.06; kris.root.position.x = 0; kris.root.rotation.z = 0;
        kris.spine.rotation.set(0.05, Math.sin(ph * TAU) * 0.15, 0);
        box.visible = false;
        if (kickT >= 0) {
          // the flying kick: a leap, one leg out straight, a fist forward
          const k = env(kickT, 0, 0.3, 1.4, 2.0), air = Math.max(0, Math.sin(clamp((kickT - 0.2) / 1.2, 0, 1) * Math.PI));
          kris.root.position.y = air * 0.45;
          kris.leg(0, 1.5 * k, 0.1, 0.1); kris.leg(1, -0.4 * k, 0.15, 1.2 * k);
          kris.arm(1, 1.6 * k, 0.1, 0.1); kris.arm(0, -0.3, 0.6 * k, 1.4);
          kris.spine.rotation.x = -0.2 * k;
        }
        if (catchT >= 0) {
          const k = env(catchT, 0, 0.25, 1.6, 2.4);
          kris.arm(0, 2.2 * k, 0.1, 0.6 * k); kris.arm(1, 1.3 * k, 0.1, 1.8 * k);
          kris.root.position.y = -0.1 * k;
          box.visible = catchT > 0.25 && catchT < 2.3;
        }
        if (bowT >= 0) { const k = env(bowT, 0, 0.5, 1.4, 2.2); kris.spine.rotation.x = k * 0.75; kris.arm(0, 0.1, 0.05, 0.1); kris.arm(1, 0.1, 0.05, 0.1); }
      }
      if (ash.step(dt)) {
        const t = ash.sm.t;
        ash.idle(t, cam, { lookWeight: 0.8 });
        // arms folded, weight shifting; copies the kick late and wobbles
        const fold = 1;
        ash.arm(0, 1.0 * fold, -0.35, 2.2); ash.arm(1, 1.0 * fold, -0.35, 2.2);
        ash.leg(0, 0.03, 0.06, 0.03); ash.leg(1, -0.03, 0.06, 0.03);
        ash.root.rotation.z = Math.sin(t * 0.8) * 0.03;
        ash.root.position.y = 0;
        if (kickT >= 0) {
          const k = env(kickT, 0.5, 0.8, 1.8, 2.4);
          ash.arm(0, 1.4 * k + 1.0 * (1 - k), -0.35 * (1 - k), 2.2 * (1 - k));
          ash.leg(0, 1.0 * k, 0.1, 0.2); ash.root.rotation.z = Math.sin(t * 9) * 0.12 * k;
          ash.root.position.y = 0.05 * k;
        }
        if (bowT >= 0) { const k = env(bowT, 0, 0.5, 1.4, 2.2); ash.spine.rotation.x = k * 0.6; } else ash.spine.rotation.x = 0;
      }
    },
  };
}

// ---------------- Kylie ----------------
export interface Kylie extends Character { zoneOut(): void; zoned(): boolean }

/**
 * Kylie the opossum, the building superintendent: a white face, a long pink nose, round black ears, a pale
 * blue cardigan over a cream shirt, khaki trousers, a long bare tail. He looks about nervously; whistle and
 * he zones out, his eyes turning to spirals, perfectly still with a slight lean.
 */
export function makeKylie(): Kylie {
  const p = makePuppet({
    seed: 501,
    head: { R: 0.19, snout: 1.25, cheeks: 0.04, squash: [0.95, 0.95, 1], colors: possumColors(), ears: 'round', earOuter: 0x2a2628, earInner: 0xd8a0a8, earSize: 1.1, eyeSpread: 0.38, eyeUp: 0.24, eyeR: 0.12, whiskers: 0.2, swirl: true, seed: 503 },
    body: { legLen: 0.6, torsoLen: 0.52, hips: 0.18, waist: 0.18, chest: 0.19, depth: 0.82, belly: 0.03, armLen: [0.27, 0.25], armR: 0.056, legR: 0.066, neckLen: 0.05 },
    outfit: { torso: jacketTexture({ cloth: 0xa8c4d8, sweater: true, shirt: 0xf2ead8, seed: 505 }), sleeve: limbCloth(0xa8c4d8, { seed: 506 }), trousers: limbCloth(0xb8a47a, { seed: 507 }) },
    limbFur: 0xd8d4ce, paw: 0xe4b8bc,
    tail: { len: 0.85, r: 0.045, color: 0xe4b8bc, thin: true, lift: 0.7, curl: 1.3 },
  });
  let zoneT = -1, bowT = -1;
  return {
    group: p.group,
    zoneOut() { zoneT = 0; },
    zoned: () => zoneT >= 0,
    bow() { bowT = 0; },
    update(dt, _t, cam) {
      if (!p.step(dt)) return;
      const t = p.sm.t, sd = p.stepDt;
      if (zoneT >= 0) { zoneT += sd; if (zoneT > 4.5) zoneT = -1; }
      if (bowT >= 0) { bowT += sd; if (bowT > 2.4) bowT = -1; }
      const z = zoneT >= 0 ? env(zoneT, 0, 0.15, 4.0, 4.5) : 0;
      for (const s of p.swirls) s.visible = z > 0.5;
      if (z > 0.5) {
        // perfectly still: no breathing, no blinking, the head tipped, arms hanging
        for (const e of p.eyes) e.scale.y = 1;
        p.head.rotation.set(0.1, 0, 0.16);
        p.neck.rotation.set(0, 0, 0);
        p.arm(0, 0, 0, 0.05); p.arm(1, 0, 0, 0.05);
        p.spine.rotation.set(0.03, 0, -0.05);
        return;
      }
      p.idle(t, cam, { lookWeight: 0.6 });
      // a nervous look round now and then
      p.head.rotation.y += Math.sin(t * 0.8) * 0.25 + Math.sin(t * 3.1) * 0.05;
      p.arm(0, 0.25, 0.05, 0.6); p.arm(1, 0.25, 0.05, 0.6);
      p.leg(0, 0.02, 0.05, 0.02); p.leg(1, -0.02, 0.05, 0.02);
      p.spine.rotation.set(0.06, 0, Math.sin(t * 0.6) * 0.03);
      if (bowT >= 0) { const k = env(bowT, 0, 0.5, 1.4, 2.2); p.spine.rotation.x = k * 0.6; p.arm(1, k * 1.2, 0.2, k * 1.4); }
    },
  };
}

// ---------------- Badger ----------------
export interface Badger extends Character { cuss(): void }

/** Badger, the lawyer, in a brown tweed three-piece suit at his desk. Whistle: he rears up and snarls "what the cuss?". */
export function makeBadger(): Badger {
  const p = makePuppet({
    seed: 601,
    head: { R: 0.21, snout: 0.78, cheeks: 0.1, squash: [1.05, 0.9, 1], colors: badgerColors(), ears: 'small', earOuter: 0x2a2828, earInner: 0xe8e2d8, eyeSpread: 0.36, eyeUp: 0.16, eyeR: 0.1, whiskers: 0.12, seed: 603 },
    body: { legLen: 0.56, torsoLen: 0.6, hips: 0.22, waist: 0.22, chest: 0.24, depth: 0.8, belly: 0.03, skirt: 0.1, armLen: [0.28, 0.26], armR: 0.07, legR: 0.08, neckLen: 0.04 },
    outfit: { torso: jacketTexture({ cloth: 0x7a6440, shirt: 0xf2ead8, tie: 0x7a2a24, buttons: 0x3a2a1a, seed: 605 }), sleeve: limbCloth(0x7a6440, { cuff: 0xf2ead8, seed: 606 }), trousers: limbCloth(0x7a6440, { seed: 607 }) },
    limbFur: 0x5a5654, paw: 0x2a2624,
    tail: { len: 0.26, r: 0.08, color: 0x8a8682, lift: 0.1 },
  });
  let cussT = -1;
  return {
    group: p.group,
    cuss() { cussT = 0; },
    bow() { cussT = -1; },
    update(dt, _t, cam) {
      if (!p.step(dt)) return;
      const t = p.sm.t;
      if (cussT >= 0) { cussT += p.stepDt; if (cussT > 2.6) cussT = -1; }
      const c = cussT >= 0 ? env(cussT, 0, 0.25, 1.9, 2.6) : 0;
      p.idle(t, c > 0 ? cam : null, { lookWeight: 0.4 + c * 0.6 });
      // writing at the desk: head down, a paw moving a pen; rearing up with both paws on the desk to snarl
      p.head.rotation.x += 0.35 * (1 - c);
      const w = Math.sin(t * 7) * 0.08 * (1 - c);
      p.arm(0, 1.0 + c * 0.2, 0.05, 1.2 - c * 0.6 + w); p.arm(1, 0.95 + c * 0.25, 0.08, 1.2 - c * 0.6);
      p.spine.rotation.set(0.3 - c * 0.5, 0, 0);
      p.root.position.y = c * 0.12;
      for (const e of p.ears) e.rotation.x -= c * 0.4;
      p.head.rotation.z += Math.sin(t * 20) * 0.03 * c;
    },
  };
}

// ---------------- the Rat ----------------
export interface Rat extends Character { snap(): void; blade(): void }

/**
 * The Rat, Bean's cellar guard: wiry and dark, a black jacket over a black turtleneck, pink paws and a long
 * pink tail, red-brown eyes, a switchblade. Idle he flicks the blade open and shut and snaps his fingers.
 * Whistle: a finger-snapping strut. A thrown box: the switchblade comes out, pointed at you.
 */
export function makeRat(): Rat {
  const p = makePuppet({
    seed: 701,
    head: { R: 0.16, snout: 1.35, cheeks: 0.03, squash: [0.9, 0.9, 1], colors: ratColors(), ears: 'small', earOuter: 0x8a6a6a, earInner: 0xd89aa0, earSize: 1.25, eyeSpread: 0.36, eyeUp: 0.26, eyeR: 0.13, eyeColor: 0x4a0a0a, whiskers: 0.22, seed: 703 },
    body: { legLen: 0.64, torsoLen: 0.5, hips: 0.135, waist: 0.12, chest: 0.155, depth: 0.75, skirt: 0.06, armLen: [0.27, 0.25], armR: 0.048, legR: 0.056, neckLen: 0.08 },
    outfit: { torso: jacketTexture({ cloth: 0x262224, shirt: 0x1a1618, buttons: 0x8a8a8a, seed: 705 }), sleeve: limbCloth(0x262224, { seed: 706 }), trousers: limbCloth(0x1e1a1c, { seed: 707 }) },
    limbFur: 0x4a423e, paw: 0xd8a0a8,
    tail: { len: 1.05, r: 0.035, color: 0xd8a0a8, thin: true, lift: 0.9, curl: 1.6 },
  });
  // the switchblade: a black handle and a blade on a pivot
  const knife = new THREE.Group();
  knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.02), flat(0x1a1a1a)));
  const bladePivot = new THREE.Group(); bladePivot.position.y = -0.055; knife.add(bladePivot);
  bladePivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.024).translate(0, -0.065, 0), new THREE.MeshPhongMaterial({ color: 0xd8dce4, shininess: 120, specular: 0xffffff })));
  knife.position.set(0, -0.12, 0.04); knife.rotation.x = 0.4;
  p.wr[0].add(knife);
  let snapT = -1, bladeT = -1, bowT = -1;
  return {
    group: p.group,
    snap() { snapT = 0; },
    blade() { bladeT = 0; },
    bow() { bowT = 0; },
    update(dt, _t, cam) {
      if (!p.step(dt)) return;
      const t = p.sm.t, sd = p.stepDt;
      if (snapT >= 0) { snapT += sd; if (snapT > 3) snapT = -1; }
      if (bladeT >= 0) { bladeT += sd; if (bladeT > 2.6) bladeT = -1; }
      if (bowT >= 0) { bowT += sd; if (bowT > 2.4) bowT = -1; }
      p.idle(t, cam, { lookWeight: 1 });
      // a slouch, the knife hand low; the blade flicks open and shut every few seconds; the other hand snaps
      const flick = env(t % 5, 1, 1.15, 2.6, 2.75);
      const snapBeat = Math.max(0, Math.sin(t * Math.PI * 2)) ** 6;
      p.arm(0, 0.5, 0.1, 1.1);
      p.arm(1, 0.6, 0.25, 1.6 + snapBeat * 0.3);
      p.wr[1].rotation.set(0, 0, snapBeat * 0.6);
      p.spine.rotation.set(0.16, 0.1, 0);
      p.leg(0, 0.1, 0.12, 0.15); p.leg(1, -0.05, 0.1, 0.1);
      p.root.position.y = 0;
      let open = flick;
      if (snapT >= 0) {
        // a strut: snapping both hands, a step and a kick in time
        const k = env(snapT, 0, 0.2, 2.5, 3);
        const beat = Math.max(0, Math.sin(snapT * Math.PI * 3)) ** 4;
        p.arm(0, 0.9 * k + 0.5 * (1 - k), 0.35 * k, 1.5); p.arm(1, 0.9 * k + 0.6 * (1 - k), 0.35 * k, 1.5);
        p.wr[0].rotation.z = -beat * 0.6 * k; p.wr[1].rotation.z = beat * 0.6 * k;
        p.leg(0, 0.1 + beat * 0.7 * k, 0.12, 0.2); p.root.position.y = beat * 0.04 * k;
        p.spine.rotation.z = Math.sin(snapT * Math.PI * 1.5) * 0.1 * k;
        open = 0;
      }
      if (bladeT >= 0) {
        const k = env(bladeT, 0, 0.2, 2.0, 2.6);
        p.arm(0, 1.3 * k + 0.5 * (1 - k), 0.05, 0.5 * k + 1.1 * (1 - k));
        p.spine.rotation.x = 0.16 - 0.25 * k;
        open = Math.max(open, k);
      }
      bladePivot.rotation.x = Math.PI * (1 - open);
      if (bowT >= 0) { const k = env(bowT, 0, 0.5, 1.4, 2.2); p.spine.rotation.x = k * 0.8; p.arm(1, k * 1.2, 0.5 * k, 0.3); }
    },
  };
}

// ---------------- Rabbit, the chef ----------------
/** Rabbit the chef in his whites and a tall toque, stirring a pot with a wooden spoon. */
export function makeRabbit(): Character {
  const p = makePuppet({
    seed: 801,
    head: { R: 0.17, snout: 0.45, cheeks: 0.1, squash: [1, 0.95, 1.05], colors: rabbitColors(), ears: 'long', earOuter: 0xb8a48e, earInner: 0xe8b0b8, eyeSpread: 0.46, eyeUp: 0.18, eyeR: 0.13, whiskers: 0.16, seed: 803 },
    body: { legLen: 0.56, torsoLen: 0.5, hips: 0.17, waist: 0.17, chest: 0.18, depth: 0.85, belly: 0.03, armLen: [0.25, 0.23], armR: 0.05, legR: 0.06, neckLen: 0.05 },
    outfit: { torso: jacketTexture({ cloth: 0xf6f2ea, lapel: false, buttons: 0xd8d0c0, seed: 805 }), sleeve: limbCloth(0xf6f2ea, { seed: 806 }), trousers: limbCloth(0x3a3a40, { stripes: 0xd8d8d8, seed: 807 }) },
    limbFur: 0xb8a48e, paw: 0xf2ece2,
    tail: { len: 0.16, r: 0.1, color: 0xf6f0e6 },
  });
  // the toque, worn between the ears
  const white = flat(0xf8f6f0, 0.25);
  const toque = new THREE.Group();
  toque.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.14, 14), white));
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), white); puff.scale.set(1, 0.7, 1); puff.position.y = 0.12; toque.add(puff);
  toque.position.set(0, 0.2, -0.02); toque.rotation.z = 0.12;
  p.head.add(toque);
  const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6).translate(0, -0.12, 0), flat(0xb08050));
  spoon.position.set(0, -0.1, 0.04);
  p.wr[0].add(spoon);
  return {
    group: p.group,
    bow() { /* the chef does not bow */ },
    update(dt, _t, cam) {
      if (!p.step(dt)) return;
      const t = p.sm.t;
      p.idle(t, cam, { lookWeight: 0.5 });
      const s = Math.sin(t * 3.2), c = Math.cos(t * 3.2);
      p.arm(0, 0.9 + s * 0.15, c * 0.15, 0.9);
      p.arm(1, 0.2, 0.2, 0.9);
      p.head.rotation.x += 0.25;
      p.leg(0, 0, 0.06, 0); p.leg(1, 0, 0.06, 0);
    },
  };
}

// ---------------- the moles ----------------
export interface Moles { group: THREE.Group; update(dt: number, t: number, cam: THREE.Vector3 | null): void; startle(): void }

/**
 * A crew of moles in dungarees and miner's helmets with lamps, swinging picks at the earth. One puppet is
 * built; the rest are copies sharing its geometry and materials. `spots` place them (position and yaw).
 */
export function makeMoles(spots: Array<{ pos: THREE.Vector3; yaw: number }>): Moles {
  const proto = makePuppet({
    seed: 901,
    head: { R: 0.17, snout: 0.85, cheeks: 0.05, squash: [1.05, 0.95, 1], colors: moleColors(), ears: 'none', earOuter: 0x2e2824, earInner: 0x2e2824, eyeSpread: 0.36, eyeUp: 0.2, eyeR: 0.06, whiskers: 0.12, seed: 903 },
    body: { legLen: 0.4, torsoLen: 0.46, hips: 0.2, waist: 0.21, chest: 0.21, depth: 0.85, belly: 0.03, armLen: [0.22, 0.2], armR: 0.06, legR: 0.065, neckLen: 0.03 },
    outfit: { torso: jacketTexture({ cloth: 0x3a4a6a, sweater: true, belt: 0x6a4a2a, seed: 905 }), sleeve: limbCloth(0x6a5a4a, { seed: 906 }), trousers: limbCloth(0x3a4a6a, { seed: 907 }) },
    limbFur: 0x2e2824, paw: 0xe0a8b0,
  });
  // a helmet with a glowing lamp
  const helmet = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 8, 0, TAU, 0, Math.PI / 2), flat(0xd8a830, 0.4));
  dome.scale.set(1.05, 0.85, 1.05); helmet.add(dome);
  helmet.add(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 16), flat(0xc89828)));
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.4) }));
  lamp.position.set(0, 0.1, 0.18); helmet.add(lamp);
  helmet.position.set(0, 0.08, -0.01);
  proto.head.add(helmet);
  // a pick
  const pick = new THREE.Group();
  pick.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6).translate(0, -0.15, 0), flat(0x9a6a3a)));
  pick.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.36, 6).rotateZ(Math.PI / 2).translate(0, -0.38, 0), flat(0x8a8a90)));
  pick.position.set(0, -0.08, 0.03);
  proto.wr[0].add(pick);
  const group = new THREE.Group();
  const crew = spots.map((s, i) => {
    const g = i === 0 ? proto.group : proto.group.clone(true);
    g.position.copy(s.pos); g.rotation.y = s.yaw;
    group.add(g);
    // find this copy's joints by walking the same paths as the original's
    const find = (o: THREE.Object3D) => {
      const path: number[] = [];
      for (let x: THREE.Object3D | null = o; x && x !== proto.group; x = x.parent) path.unshift(x.parent!.children.indexOf(x));
      let y: THREE.Object3D = g; for (const k of path) y = y.children[k];
      return y;
    };
    return { g, sh: proto.sh.map(find), el: proto.el.map(find), spine: find(proto.spine), head: find(proto.head), root: find(proto.root), phase: i * 0.37 };
  });
  const sm = new StopMotion(12, 911);
  let startleT = -1;
  return {
    group,
    startle() { startleT = 0; },
    update(dt) {
      if (!sm.tick(dt)) return;
      const t = sm.t;
      if (startleT >= 0) { startleT += 1 / 12; if (startleT > 2.2) startleT = -1; }
      const st = startleT >= 0 ? env(startleT, 0, 0.15, 1.6, 2.2) : 0;
      sm.boil(proto.furMats);
      for (const m of crew) {
        // the pick swings over and down at the wall in front of them
        const ph = ((t * 0.9 + m.phase) % 1);
        const swing = ph < 0.6 ? ph / 0.6 : 1 - (ph - 0.6) / 0.4;
        const up = (1 - swing) * (1 - st);
        m.sh[0].rotation.set(-(0.6 + up * 2.2), 0, -0.1);
        m.el[0].rotation.set(-(0.5 + up * 0.6), 0, 0);
        m.sh[1].rotation.set(-(0.6 + up * 1.9) * (1 - st) - st * 2.6, 0, 0.1 + st * 0.4);
        m.el[1].rotation.set(-0.5, 0, 0);
        m.spine.rotation.set(0.25 - up * 0.25 - st * 0.2, 0, 0);
        m.head.rotation.set(0.1 - st * 0.3, Math.sin(t + m.phase * 9) * 0.1, 0);
        m.root.position.y = st * Math.max(0, Math.sin(startleT * 9)) * 0.08;
      }
    },
  };
}

// ---------------- the wolf ----------------
export interface Wolf extends Character { salute(): void; saluting(): boolean }

/**
 * The black wolf on the far ridge: big, shaggy, near-black with grey frosting and amber eyes, standing on
 * all fours in profile. Whistle: he turns his head to you, rises on his haunches and raises a clenched
 * front paw in salute, holds it, and drops back to all fours.
 */
export function makeWolf(): Wolf {
  const group = new THREE.Group();
  const root = new THREE.Group(); group.add(root);
  const black = 0x1e1c20;
  const furMat = charToon({ map: plainFur(black, 1001, { W: 256, H: 256, dark: 0x0e0c10 }), rim: 0.6, shade: 0x8a8aa8 });
  const legMat = charToon({ map: plainFur(0x18161a, 1002, { W: 128, H: 64 }), rim: 0.5, shade: 0x8a8aa8 });
  // the body: a sculpted barrel, deep at the chest, with a shaggy ruff over the shoulders
  const bodyGeo = sculpt(profileShape([[0.82, 0], [0.74, 0.34], [0.5, 0.47], [0.15, 0.46], [-0.3, 0.38], [-0.62, 0.33], [-0.76, 0.2], [-0.82, 0]], { bulge: (d) => 0.035 * Math.sin(d.x * 31 + d.y * 23) * (d.y > 0 ? 1 : 0.3) }), 24, 20);
  bodyGeo.rotateX(Math.PI / 2);
  const torso = new THREE.Group(); torso.position.set(0, 1.24, 0); root.add(torso);
  const body = new THREE.Mesh(bodyGeo, furMat); body.scale.set(0.92, 1.05, 1); body.castShadow = true; torso.add(body);
  const ruff = new THREE.Mesh(sculpt((d, out) => out.copy(d).multiplyScalar(1 + 0.08 * Math.sin(d.x * 17) * Math.sin(d.y * 13 + d.z * 7)), 18, 14), furMat);
  ruff.scale.set(0.5, 0.56, 0.5); ruff.position.set(0, 0.12, 0.5); ruff.castShadow = true; torso.add(ruff);
  // the head on a thick neck
  const neck = new THREE.Group(); neck.position.set(0, 0.25, 0.68); torso.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.62, 12).rotateX(-0.75).translate(0, 0.18, 0.15), furMat); neckMesh.castShadow = true; neck.add(neckMesh);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.48, 0.42); neck.add(headPivot);
  const h = makeHead({ R: 0.34, snout: 1.0, cheeks: 0.18, squash: [0.95, 0.9, 1], colors: wolfColors(), ears: 'wolf', earOuter: 0x18161a, earInner: 0x4a464c, earSize: 1.3, eyeSpread: 0.4, eyeUp: 0.2, eyeR: 0.11, eyeColor: 0xc89a30, seed: 1003 });
  headPivot.add(h.group);
  // legs: shoulder and hip joints with an elbow / hock bend; the front right is the saluting one
  const legGeo = limbGeometry(0.13, 0.09, 0.56, 10, 4), lowGeo = limbGeometry(0.09, 0.065, 0.56, 10, 4);
  const paw = new THREE.SphereGeometry(0.1, 10, 8).scale(1, 0.6, 1.4).translate(0, -0.03, 0.05);
  const legs: Array<{ top: THREE.Group; mid: THREE.Group }> = [];
  for (const [x, z] of [[-0.22, 0.5], [0.22, 0.5], [-0.22, -0.55], [0.22, -0.55]]) {
    const top = new THREE.Group(); top.position.set(x, -0.12, z); torso.add(top);
    const m1 = new THREE.Mesh(legGeo, legMat); m1.castShadow = true; top.add(m1);
    const mid = new THREE.Group(); mid.position.y = -0.54; top.add(mid);
    const m2 = new THREE.Mesh(lowGeo, legMat); m2.castShadow = true; mid.add(m2);
    const pw = new THREE.Mesh(paw, legMat); pw.position.y = -0.56; mid.add(pw);
    legs.push({ top, mid });
  }
  // the tail: a long bushy brush hanging low
  const tail = new THREE.Group(); tail.position.set(0, 0.15, -0.76); torso.add(tail);
  const tailMesh = new THREE.Mesh(sculpt(profileShape([[0.95, 0], [0.85, 0.14], [0.5, 0.17], [0.12, 0.11], [0, 0.07]]), 14, 12), furMat);
  tailMesh.rotation.x = -(Math.PI / 2 + 0.9); tailMesh.castShadow = true; tail.add(tailMesh);
  const sm = new StopMotion(12, 1009);
  const look = new LookAt(1.2, 0.4);
  let saluteT = -1, bowT = -1, last = 0;
  return {
    group,
    salute() { saluteT = 0; },
    saluting: () => saluteT >= 0,
    bow() { bowT = 0; },
    update(dt, _t, cam) {
      if (!sm.tick(dt)) return;
      const t = sm.t, sd = clamp(t - last, 0, 0.25); last = t;
      sm.boil([furMat, legMat, h.furMat]);
      if (saluteT >= 0) { saluteT += sd; if (saluteT > 5.2) saluteT = -1; }
      if (bowT >= 0) { bowT += sd; if (bowT > 2.4) bowT = -1; }
      const s = saluteT >= 0 ? env(saluteT, 0, 0.8, 4.0, 5.0) : 0;
      const fist = saluteT >= 0 ? env(saluteT, 0.6, 1.1, 3.8, 4.4) : 0;
      // breathing, the wind in the fur, the tail swaying
      torso.scale.set(1, 1 + Math.sin(t * 1.4) * 0.012, 1);
      tail.rotation.y = Math.sin(t * 0.9) * 0.15;
      tail.rotation.x = s * 0.4;
      // rising on the haunches: the body pitches up about the hips
      torso.rotation.x = -s * 0.75;
      torso.position.set(0, 1.24 + s * 0.15, -s * 0.35);
      for (const [i, l] of legs.entries()) {
        const front = i < 2;
        l.top.rotation.set(front ? s * 0.75 : s * 0.75 - s * 1.1, 0, 0);
        l.mid.rotation.set(front ? 0 : s * 0.9, 0, 0);
      }
      // the salute: the front right leg straight up, the paw clenched
      legs[0].top.rotation.x = s * 0.75 - fist * 2.7;
      legs[0].mid.rotation.x = -fist * 0.3;
      legs[1].top.rotation.x = s * 0.75 - s * 0.5;
      legs[1].mid.rotation.x = -s * 1.2;
      const [ly, lp] = look.update(headPivot, saluteT >= 0 ? cam : null, sd, 1);
      headPivot.rotation.set(lp * 0.8 + s * 0.6, ly, 0);
      neck.rotation.set(s * 0.3, 0, 0);
      for (const e of h.ears) e.rotation.x = -0.08 - s * 0.3;
      if (bowT >= 0) { const k = env(bowT, 0, 0.5, 1.4, 2.2); headPivot.rotation.x = k * 0.8; legs[0].top.rotation.x = -k * 0.4; }
    },
  };
}
