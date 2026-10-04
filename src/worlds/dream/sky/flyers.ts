import * as THREE from 'three';
import type { RideState } from '../../../game/types';
import { Subject } from '../../../game/Subject';
import { Heading, Spring, envelope } from '../../../engine/Rig';
import { charToon } from '../../../engine/Paint';
import { clamp, lerp, smoothstep } from '../../../engine/math';
import { makeKiki } from '../../ghibli/people';
import { makeDirigible } from '../../ghibli/characters';
import { FILMS, forwardOf } from '../common';

/*
 * The two fliers of the sky scene: Kiki and Jiji on her broom, keeping pace with the Catbus, and the big
 * airship from Koriko drifting past on the left in the sunrise.
 */

/** Where Kiki joins and leaves, by the rider's z. */
const KIKI = { arrive: -935, leave: -1165 };

export function buildKiki(camera: THREE.Camera) {
  const kiki = makeKiki();
  kiki.group.rotation.order = 'YXZ';
  kiki.group.visible = false;
  const kk = {
    phase: 'off' as 'off' | 'in' | 'fly' | 'out', outT: 0, closeT: 0, vel: new THREE.Vector3(),
    heading: new Heading(0, 1.1, 0.85), bank: new Spring(0, 1.1, 0.8), pitch: new Spring(0, 1.2, 0.85),
    closeSide: 1, side: 1, prevYaw: 0,
  };
  const kikiS: Subject = new Subject({
    id: 'kiki', name: 'Kiki', from: FILMS.kiki, group: kiki.group, radius: 1.3, base: 950, rarity: 'rare',
    hint: 'She flies with the Catbus over the clouds at sunrise. Play the ocarina and she comes alongside and waves; toss an acorn near her broom and it wobbles.',
    poses: { wave: { label: 'Waving hello', mult: 1.7 }, swerve: { label: 'Wobbling broom', mult: 1.4 } },
    centerOffset: new THREE.Vector3(0, 1.0, 0.2), facing: forwardOf(kiki.head), maxDistance: 120,
    onCall: () => { kiki.wave(); kikiS.setPose('wave', 2.5); kk.closeT = 4; return true; },
    onItem: () => { kiki.startle(); kikiS.setPose('swerve', 1.2); jijiS.setPose('startled', 1.2); return true; }, reactRange: 12,
  });
  const jijiS: Subject = new Subject({
    id: 'jiji', name: 'Jiji', from: FILMS.kiki, group: kiki.group, radius: 0.45, base: 520,
    hint: 'Rides at the back of Kiki\'s broom. An acorn thrown close makes him jump.',
    poses: { startled: { label: 'Startled jump', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 0.35, -0.75), maxDistance: 60,
    // the game updates every subject every frame: outside this stretch they are off even if the set's update stops
    update: (_dt, ride) => { if (ride.position.z > -912 || ride.position.z <= -1232) kikiS.active = jijiS.active = false; },
  });

  const target = new THREE.Vector3(), rel = new THREE.Vector3(), travel = new THREE.Vector3(), side = new THREE.Vector3(), look = new THREE.Vector3();
  const off = () => { kk.phase = 'off'; kiki.group.visible = false; kikiS.active = jijiS.active = false; };
  off();

  /**
   * Kiki flies with the Catbus. She ranges 8 to 23 units ahead and swings from side to side, always within
   * about 34 degrees of straight ahead of the rider, so she stays in view; when her swing brings her in
   * front of the Catbus's face she rises over its line instead. Called, she comes in close where the camera
   * is looking and waves. She arrives from far ahead and leaves by climbing away to the left before the
   * storm. Everything is measured from `eye`, the rider's eye on the Catbus this frame (from the ride's
   * position, so it is never a frame behind the vehicle), and `riderVel`, the Catbus's measured velocity,
   * which she adds to her own so she never drops behind.
   */
  const update = (dt: number, t: number, ride: RideState, eye: THREE.Vector3, riderVel: THREE.Vector3) => {
    const z = ride.position.z;
    // the screen is covered before -912 and after -1232: she can be put away there without being seen
    if (z > -912 || z <= -1232) { off(); return; }
    const want = z <= KIKI.arrive && z > KIKI.leave;
    if (kk.phase === 'off' && !want) return;
    travel.copy(ride.tangent).setY(0).normalize();
    side.set(-travel.z, 0, travel.x);
    kk.closeT = Math.max(0, kk.closeT - dt);
    const close = smoothstep(0, 1, kk.closeT);
    if (kk.phase === 'off') {
      // she appears far ahead in the haze, a little to the right, and flies back to meet the Catbus
      kiki.group.position.copy(eye).addScaledVector(travel, 140).addScaledVector(side, 8).setY(eye.y + 12);
      kk.vel.copy(riderVel);
      kk.heading.set(Math.atan2(-travel.x, -travel.z));
      kk.phase = 'in';
    }
    if ((kk.phase === 'fly' || kk.phase === 'in') && !want) { kk.phase = 'out'; kk.outT = 0; }
    if (kk.phase === 'out') {
      kk.outT += dt;
      target.copy(eye).addScaledVector(travel, -30).addScaledVector(side, -210).setY(eye.y + 95);
      if (kk.outT > 14 || kiki.group.position.distanceTo(eye) > 230) { off(); return; }
    } else {
      // where the camera looks, as an angle from the direction of travel (positive = right)
      look.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
      const lookA = look.lengthSq() > 1e-4 ? Math.atan2(look.normalize().dot(side), look.dot(travel)) : 0;
      if (close < 0.05 && Math.abs(lookA) > 0.25) kk.closeSide = Math.sign(lookA);
      // a slow cycle between ranging far ahead and coming in close in front of the Catbus's head
      const range = smoothstep(0.25, 0.6, 0.5 + 0.5 * Math.sin(t * 0.21 + 1.3));
      let ahead = lerp(9.5 + Math.sin(t * 0.5) * 1.5, 15 + Math.sin(t * 0.23 + 0.5) * 8, range);
      const swing = Math.sin(t * 0.31) * 0.85 + Math.sin(t * 0.77) * 0.15;
      if (range > 0.8 && Math.abs(swing) > 0.3) kk.side = Math.sign(swing);
      let across = Math.tan(lerp(kk.side * 0.58, swing * 0.55, range)) * ahead;
      // called: she comes in 8.5 away where the camera is looking (up to 80 degrees round) and waves
      if (close > 0) {
        const a = clamp(lookA, -1.4, 1.4);
        ahead = lerp(ahead, Math.cos(a) * 8.5, close);
        across = lerp(across, Math.sin(a) * 8.5 || kk.closeSide * 4.5, close);
      }
      target.copy(eye).addScaledVector(travel, ahead).addScaledVector(side, across);
      // a little above eye level; straight ahead and close, she rises clear of the Catbus's line
      const overHead = (1 - smoothstep(2.5, 4.5, Math.abs(across))) * (1 - smoothstep(10, 16, ahead));
      target.y = eye.y + lerp(0.6 + ahead * 0.1 + Math.sin(t * 0.9) * 0.6, 0.2, close) + overHead * 4;
      if (kk.phase === 'in' && kiki.group.position.distanceTo(target) < 14) kk.phase = 'fly';
    }
    // steer: keep pace with the Catbus, then close the gap to the target at a limited speed
    const limit = kk.phase === 'in' ? 30 : kk.phase === 'out' ? 22 : 12;
    rel.subVectors(target, kiki.group.position).multiplyScalar(1.2).clampLength(0, limit).add(riderVel);
    kk.vel.lerp(rel, 1 - Math.exp(-dt * 2.6));
    kiki.group.position.addScaledVector(kk.vel, dt);
    // face the way she flies, lean into turns, nose up or down with the climb
    const hv = Math.hypot(kk.vel.x, kk.vel.z);
    const yaw = hv > 0.5 ? kk.heading.update(Math.atan2(kk.vel.x, kk.vel.z), dt) : kk.heading.value;
    const yawRate = (yaw - kk.prevYaw) / Math.max(dt, 1e-3);
    kk.prevYaw = yaw;
    kiki.group.rotation.set(kk.pitch.update(clamp(-kk.vel.y * 0.08, -0.35, 0.35), dt), yaw, kk.bank.update(clamp(-yawRate * 0.45, -0.55, 0.55), dt));
    kiki.group.visible = true;
    const near = kiki.group.position.distanceTo(eye);
    kikiS.active = jijiS.active = kk.phase === 'fly' || (kk.phase === 'in' && near < 60);
    // she glances over at the Catbus when close, and looks right at you when she waves
    kiki.lookTarget = close > 0.1 || near < 14 ? eye : null;
    kiki.update(dt, t);
  };
  return { group: kiki.group, subjects: [kikiS, jijiS], update, hide: off };
}

/** The airship's drift, by the rider's z: from ahead on the left, past the rider about 90 units out, then behind. */
const SHIP = { z0: -925, z1: -1200, a: new THREE.Vector3(-108, 62, -1068), b: new THREE.Vector3(-60, 58, -980) };

export function buildAirship() {
  const ship = makeDirigible();
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(ship.group);
  // propellers at the back of the gondola and a signal lamp on its nose (in the ship's own space)
  const propMat = charToon({ color: 0x4a4038, rim: 0.2 });
  const props: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.18), propMat);
    arm.position.set(s * 2.2, -4.2, -1.2);
    ship.group.add(arm);
    const hub = new THREE.Group();
    hub.position.set(s * 2.9, -4.2, -1.45);
    ship.group.add(hub);
    hub.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), propMat));
    for (const a of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.05), propMat);
      blade.rotation.z = a;
      hub.add(blade);
    }
    props.push(hub);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
  lamp.position.set(0, -4.0, 3.6);
  ship.group.add(lamp);
  ship.group.scale.setScalar(1.8);
  const yaw = Math.atan2(SHIP.b.x - SHIP.a.x, SHIP.b.z - SHIP.a.z);
  root.rotation.y = yaw;
  let signalT = -1;
  const subject: Subject = new Subject({
    id: 'blimp', name: 'The airship', from: FILMS.kiki, group: root, radius: 25, base: 560, rarity: 'rare',
    hint: 'The great airship from Koriko drifts past on the left above the clouds at sunrise. Play the ocarina and it dips its nose and blinks its lamp.',
    poses: { signal: { label: 'Signalling back', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, -1.5, 0), maxDistance: 300,
    onCall: () => { signalT = 0; subject.setPose('signal', 3); return true; },
    // the game updates every subject every frame, so this holds even when the ride jumps past this set
    update: (_dt, ride) => { subject.active = ride.position.z <= SHIP.z0 - 5 && ride.position.z > -1205; },
  });
  subject.active = false;
  const warm = new THREE.Color(0xffd890), bright = new THREE.Color(1.0, 0.86, 0.6);

  const update = (dt: number, t: number, z: number) => {
    const k = clamp((SHIP.z0 - z) / (SHIP.z0 - SHIP.z1), 0, 1);
    root.position.lerpVectors(SHIP.a, SHIP.b, k);
    root.position.y += Math.sin(t * 0.35) * 0.8;
    // answering the ocarina: the nose dips in a bow and the lamp blinks
    let bow = 0;
    if (signalT >= 0) { signalT += dt; bow = envelope(signalT, 0, 0.8, 1.6, 3.0); if (signalT > 3.2) signalT = -1; }
    tilt.rotation.set(bow * 0.09 + Math.sin(t * 0.21) * 0.012, 0, Math.sin(t * 0.27) * 0.02);
    const blink = signalT >= 0 ? (Math.sin(signalT * 14) > 0 ? 3.2 : 0.4) : 1.1;
    lampMat.color.copy(signalT >= 0 ? bright : warm).multiplyScalar(blink);
    for (const p of props) p.rotation.z += dt * 9;
    ship.update(dt, t);
  };
  return { root, subject, update };
}
