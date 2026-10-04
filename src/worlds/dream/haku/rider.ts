import * as THREE from 'three';
import { mergeStatic } from '../../../engine/Builders';
import { charToon } from '../../../engine/Paint';
import { limbGeometry, outline } from '../../../engine/Rig';
import { clamp, damp, smoothstep } from '../../../engine/math';
import type { RideState } from '../../../game/types';
import { Subject } from '../../../game/Subject';
import { makeHaku } from '../../ghibli/haku';
import { makeKid } from '../../ghibli/people';
import { fabric } from '../../ghibli/characterTextures';
import { mountAtZ } from '../layout';
import { FILMS, type SetContext } from '../common';
import { HEAD_PART, ScaleFlakes } from './flakes';
import { BURST, FALL_Z } from './places';

/*
 * Haku as the rider's mount. The world hides the Catbus from z -2052 and puts the camera 1.25 above the
 * path; here the dragon is placed so the camera sits on his neck behind the horns: his head 3.6 ahead and
 * below eye level on a neck that slopes gently down to it (the neck must stay below the line from the eye to
 * the head, or it hides the head), his snout lifted towards the moon so it shows beyond his crown, and his
 * body trailing back along the path he has flown. The
 * world banks the vehicle into turns before the sets update, so the dragon is placed in the banked frame
 * and his head banks with the view.
 *
 * He glances back at the rider now and then (keyed to z) and when the ocarina plays: his head swings out to
 * one side on a curving neck (staying about 4 from the camera) and turns so that side of his face, with the
 * eye, brow and whiskers, is towards the rider. At the top of the climb
 * he turns to look at the rider, his scales light up and burst away into flakes from the tail forward, and
 * the head goes last in a flash (z -2302, where the world switches the mount to falling). In the flash he
 * becomes the boy, who falls beside the rider reaching out a hand.
 */

/** the dragon's size: 1.4 times the first Ghibli world's */
const S = 1.4;
/**
 * The head's distance ahead of the rider along the path, and its height above the path. On a climb the point
 * ahead is higher than the (less tilted) view, so half of that height is taken off: the horns stay low in the
 * view, and the neck under the rider drops a little, as if he leaned into the climb. (Going down, the head
 * follows the path, so the neck does not rise towards the rider.)
 */
const AHEAD = 3.6, HEAD_Y = 0.05, CLIMB_KEEP = 0.5;
/** At rest the head hangs this far below the flight path, its snout lifted by `pitch` (radians). */
const REST = { y: -0.6, pitch: 0.35 };
/**
 * A glance back: the head swings this far out to the side (and up), then turns this far towards that side, so
 * the side of his face is towards the rider (about 4.5 from the camera). The neck bends over its first BEND
 * units (in his own size: 3.1 in the world, ending just in front of the rider) and is NECK as thick where it
 * meets the head.
 */
const GLANCE = { out: 2.6, up: 0.3, yaw: 1.65, pitch: 0.12 }, BEND = 2.2, NECK = 0.75;
/** Haku appears here, under the paper cover */
const SHOW_Z = -2046;
/** z-keyed glances back at the rider: [from z, to z, side (+1 turns his head to his left)] */
const GLANCES: Array<[number, number, number]> = [[-2112, -2130, 1], [-2190, -2210, -1], [-2242, -2258, 1]];
/** he turns to look at the rider before the burst, and holds it while the scales go */
const REMEMBER = { z0: -2272, z1: -2283 };
/** the white flash in which the head goes and the boy appears */
const FLASH = { z0: -2298, z1: FALL_Z, z2: -2307 };
/** the boy falls with the rider until here (under the white cover, before the scene is hidden at -2430) */
const BOY_END = -2424;
/** set to false to leave the boy out (the dragon still bursts and the flakes still swirl) */
const BOY = true;

/** How much of the dragon has dissolved at a z (0 whole, 1 gone). */
export const dissolveAt = (z: number) => clamp((BURST.z0 - z) / (BURST.z0 - BURST.z1), 0, 1);

/** The dissolve amount at which the part of the dragon at body coordinate b (0 head .. 1 tail) comes away; matches haku.ts. */
function releaseAt(b: number) {
  if (b < HEAD_PART) return 0.86 + 0.12 * (b / HEAD_PART);
  const ring = (b - HEAD_PART) / (1 - HEAD_PART);
  return (1 - ring) * 0.85 + 0.05;
}

/** an envelope over z (z runs downwards): up over the first 30% of [a, b], down over the last 30% */
const zEnvelope = (z: number, a: number, b: number) => { const w = (b - a) * 0.3; return smoothstep(a, a + w, z) * (1 - smoothstep(b - w, b, z)); };

export function buildHakuRider(ctx: SetContext) {
  const group = new THREE.Group();
  const road = ctx.road, curve = road.curve;
  const L = curve.getLength();

  // ---------- the dragon ----------
  const haku = makeHaku();
  const skull = haku.head.children[0] as THREE.Mesh;
  skull.userData.keep = true; // its ink outline is a child of it
  // the tufts on his crown point back at the rider: shorter, so the top of his head shows between them
  for (const c of haku.head.children) {
    const geo = (c as THREE.Mesh).geometry as THREE.ConeGeometry | undefined;
    if (geo?.type === 'ConeGeometry' && Math.abs(geo.parameters.height - 0.75) < 1e-3) c.scale.set(0.8, 0.5, 0.8);
  }
  mergeStatic(haku.head);
  haku.group.scale.setScalar(S);
  haku.group.visible = false;
  group.add(haku.group);
  const bodyMat = haku.body.mesh.material as THREE.MeshToonMaterial;
  const headMat = skull.material as THREE.MeshToonMaterial;
  const bodyEm = bodyMat.emissive.clone(), headEm = headMat.emissive.clone(), bright = new THREE.Color(0x9ae0ee);
  const rideState = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), yaw: 0, pitch: 0, offset: new THREE.Vector3(), bend: BEND, neck: NECK };
  /** the glance: signed (+ = to his left), eased towards its target so it passes through zero when it changes side */
  let glance = 0;

  // ---------- the flakes ----------
  const SPAN = BURST.z0 - BURST.z1;
  const flakes = new ScaleFlakes(ctx.lowDetail ? 1600 : 3200, 2302, SPAN, releaseAt);
  group.add(flakes.points);
  const bodySamples = Array.from({ length: 8 }, () => new THREE.Vector3());
  const RINGS = [0, 12, 24, 36, 47, 59, 71];

  // ---------- the boy ----------
  const kid = makeKid({
    hair: 0x1d3532, style: 'bob', top: 0xf2f0e8, sleeves: 'long', bottom: { kind: 'shorts', color: 0x8ea6c4 },
    socks: 0xf4f2ea, shoes: 0x5a4636, face: { fringe: 'bob', mouth: 'small', blush: 0.2 }, glow: 0x161c2a, seed: 41,
  });
  // hakama: two wide trouser legs over the shorts, flaring to the ankles, in two parts so they bend at the knee
  {
    const cloth = charToon({ map: fabric(0x8ea6c4, { folds: 10, hem: true, seed: 43 }), emissive: 0x161c2a, rim: 0.35, shade: 0x9aa0cc });
    const upper = limbGeometry(0.12, 0.15, 0.52, 14, 4), lower = limbGeometry(0.15, 0.2, 0.44, 14, 4);
    for (let i = 0; i < 2; i++) {
      const a = new THREE.Mesh(upper, cloth), b = new THREE.Mesh(lower, cloth);
      a.name = b.name = 'hakama';
      kid.hip[i].add(a); kid.knee[i].add(b);
      outline(a, 0x2a1e24, 1.3, 0.014); outline(b, 0x2a1e24, 1.3, 0.014);
    }
  }
  const boy = new THREE.Group(), boyTilt = new THREE.Group();
  kid.group.scale.setScalar(0.62);
  kid.group.position.y = -1.45 * 0.62; // turn about his chest
  boyTilt.add(kid.group);
  boy.add(boyTilt);
  boy.visible = false;
  group.add(boy);
  // falling: one arm reaching out to the rider, the other floating out to the side, legs loose
  const poseBoy = (t: number, reach: number) => {
    kid.shoulder[0].rotation.set(-1.2 - 0.25 * reach + Math.sin(t * 0.9) * 0.05, 0, 0.22);
    kid.elbow[0].rotation.x = -0.3 + 0.2 * reach;
    kid.shoulder[1].rotation.set(-0.45 + Math.sin(t * 0.7) * 0.08, 0, 1.0 + Math.sin(t * 0.8) * 0.08);
    kid.elbow[1].rotation.x = -0.6;
    // legs apart, so the two wide trouser legs read as trousers
    kid.hip[0].rotation.set(-0.3 + Math.sin(t * 0.6) * 0.06, 0, -0.22); kid.knee[0].rotation.x = 0.6;
    kid.hip[1].rotation.set(0.12 - Math.sin(t * 0.6) * 0.06, 0, 0.26); kid.knee[1].rotation.x = 0.25;
  };

  // ---------- the photo subject: the dragon's head while you ride him, the boy while you fall ----------
  const anchor = new THREE.Object3D();
  group.add(anchor);
  let callT = -1, callSide = 1, boyOn = false;
  const facingV = new THREE.Vector3();
  const subject = new Subject({
    id: 'haku-ride', name: 'Haku', from: FILMS.spirited, group: anchor, radius: 1.7, base: 1450, rarity: 'legendary',
    hint: 'You ride on his neck over the night sea: his head, horns and mane are just below you. Play the ocarina and he looks back at you; at the top of the climb he remembers his name.',
    poses: {
      'looking-back': { label: 'Looking back at you', mult: 1.8 },
      remembering: { label: 'Remembering his name', mult: 2.0 },
      reaching: { label: 'Reaching for your hand', mult: 1.7 },
    },
    maxDistance: 60,
    facing: () => facingV,
    onCall: () => {
      if (boyOn) { callT = 0; subject.setPose('reaching', 2.4); return true; }
      if (!haku.group.visible || dissolveAt(lastZ) > 0) return false;
      callT = 0; callSide = -callSide; subject.setPose('looking-back', 2.6);
      return true;
    },
  });
  subject.active = false;

  // a soft cool light that follows the rider: it lights Haku's head from behind, then the boy's face
  const fill = { from: road.u(SHOW_Z), to: road.u(BOY_END), pos: new THREE.Vector3(), color: 0xc8d8ff, intensity: 7, distance: 10 };
  ctx.lights.add(fill);

  let lastZ = 0, seeded = false;
  const qv = new THREE.Quaternion(), qvInv = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const P = new THREE.Vector3(), pa = new THREE.Vector3(), ta = new THREE.Vector3(), v = new THREE.Vector3();
  const headWorld = new THREE.Vector3(), cam = new THREE.Vector3();
  const seedPts: THREE.Vector3[] = [];

  return {
    group, subject, flakes, haku,
    update(dt: number, t: number, ride: RideState) {
      const z = ride.position.z;
      const vehicle = ctx.vehicle;
      // the vehicle's frame this frame, as the camera will see it (the world has already bobbed and banked it);
      // `unbanked` is its rotation before the bank
      qv.copy(vehicle.userData.unbanked as THREE.Quaternion); qvInv.copy(qv).invert();
      qb.copy(vehicle.quaternion);
      P.copy(vehicle.position);
      cam.set(0, mountAtZ(z) === 'fall' ? 0 : 1.25, 0).applyQuaternion(qb).add(P);
      fill.pos.copy(cam).y += 1.2;

      // ---------- the dragon ----------
      const D = dissolveAt(z);
      const dragonOn = z <= SHOW_Z && D < 1;
      haku.group.visible = dragonOn;
      if (dragonOn) {
        // the head: a point AHEAD along the path, moved into the banked frame of the vehicle
        const uA = clamp(ride.u + AHEAD / L, 0, 1);
        curve.getPointAt(uA, pa); curve.getTangentAt(uA, ta);
        v.copy(pa).sub(vehicle.position).applyQuaternion(qvInv);
        v.y = (v.y > 0 ? v.y * CLIMB_KEEP : v.y) + HEAD_Y;
        headWorld.copy(v).applyQuaternion(qb).add(P);
        rideState.dir.copy(ta).applyQuaternion(qvInv).applyQuaternion(qb);
        rideState.up.set(0, 1, 0).applyQuaternion(qb);
        // when he glances back: z-keyed glances, the ocarina, and looking round at the rider before the burst
        let k = 0, side = 1;
        for (const [a, b, s] of GLANCES) { const e = zEnvelope(z, a, b); if (e > k) { k = e; side = s; } }
        if (callT >= 0) { const e = smoothstep(0, 0.5, callT) * (1 - smoothstep(2.0, 2.8, callT)); if (e > k) { k = e; side = callSide; } }
        const rem = smoothstep(REMEMBER.z0, REMEMBER.z1, z);
        if (rem > k) { k = rem; side = 1; }
        glance = damp(glance, side * k, 3, dt);
        const gs = Math.sign(glance), gk = Math.abs(glance);
        // the head swings out first, then turns its face to the rider (and turns back first on the way home)
        const out = smoothstep(0, 0.6, gk), turn = smoothstep(0.3, 1, gk);
        rideState.offset.set(gs * GLANCE.out * out, REST.y + GLANCE.up * out, 0).applyQuaternion(qb).divideScalar(S);
        rideState.yaw = gs * GLANCE.yaw * turn + Math.sin(t * 0.7) * 0.04;
        rideState.pitch = REST.pitch + (GLANCE.pitch - REST.pitch) * turn + Math.sin(t * 1.1) * 0.03;
        rideState.pos.copy(headWorld).divideScalar(S);
        haku.ride = rideState;
        // lay the body along the path behind when he first appears, or after the ride jumps
        // (parallel to the path, through where the head is now)
        if (!seeded || haku.head.position.distanceToSquared(rideState.pos) > 36) {
          seedPts.length = 0;
          v.copy(headWorld).sub(pa);
          for (let d = 36; d > 0; d -= 0.5) seedPts.push(curve.getPointAt(clamp(uA - d / L, 0, 1)).add(v).divideScalar(S));
          seedPts.push(rideState.pos.clone());
          haku.seedTrail(seedPts);
          seeded = true;
        }
        haku.dissolve = D;
        haku.update(dt, t);
        // the scales light up just before they come away
        const g = smoothstep(-2272, -2290, z);
        bodyMat.emissive.copy(bodyEm).lerp(bright, g);
        headMat.emissive.copy(headEm).lerp(bright, g * 0.6);
        // the photo subject sits on his head; when he glances back, the side of his face (his eye) faces the rider
        const hp = haku.head.position;
        anchor.position.set(0, 0, 0.4).applyQuaternion(haku.head.quaternion).add(hp).multiplyScalar(S);
        const eye = smoothstep(0.4, 0.9, gk);
        facingV.set(gs * eye, 0, 1 - eye).applyQuaternion(haku.head.quaternion).normalize();
        // flakes come from these points: the head and seven rings down the body, in world space
        bodySamples[0].copy(haku.head.position).multiplyScalar(S);
        RINGS.forEach((r, i) => bodySamples[i + 1].copy(haku.body.pts[r]).multiplyScalar(S));
      } else {
        seeded = false;
      }

      // ---------- the burst: flakes, the flash, the boy ----------
      flakes.update(t, BURST.z0 - z, cam, dragonOn ? bodySamples : null, 1 - smoothstep(-2398, -2432, z));
      const flash = z > FLASH.z1 ? smoothstep(FLASH.z0, FLASH.z1, z) : 1 - smoothstep(FLASH.z1, FLASH.z2, z);
      if (flash > 0.001) ctx.fx.flash(flash * 0.9, 0xeaf4ff);
      boyOn = BOY && z <= FALL_Z && z > BOY_END;
      boy.visible = boyOn;
      if (callT >= 0) { callT += dt; if (callT > 2.8) callT = -1; }
      if (boyOn) {
        // he falls just ahead of the rider, a little below and to the right, turned to face the rider
        const reach = callT >= 0 ? smoothstep(0, 0.4, callT) * (1 - smoothstep(2.0, 2.8, callT)) : 0;
        v.set(-1.5 + Math.sin(t * 0.5) * 0.15, -0.8 + Math.sin(t * 0.7) * 0.2, 3.4 + Math.sin(t * 0.4) * 0.2 - reach * 0.5).applyQuaternion(qb).add(P);
        boy.position.copy(v);
        boy.lookAt(cam);
        boyTilt.rotation.set(-0.35 + Math.sin(t * 0.6) * 0.05, 0, Math.sin(t * 0.45) * 0.08);
        poseBoy(t, reach);
        kid.tick(dt, t, cam, 1);
        anchor.position.copy(boy.position);
        facingV.set(0, 0, 1).applyQuaternion(boy.quaternion);
      }

      // the subject is the dragon, then the boy; 'remembering' while the scales go
      subject.active = (dragonOn && z <= -2052) || boyOn;
      if (z < REMEMBER.z0 && z > -2312) subject.setPose('remembering', 0.3);
      lastZ = z;
    },
  };
}
