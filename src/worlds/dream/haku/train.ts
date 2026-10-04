import * as THREE from 'three';
import { mergeStatic, toon } from '../../../engine/Builders';
import { Rng, clamp, smoothstep } from '../../../engine/math';
import { Subject } from '../../../game/Subject';
import { buildSeaTrain } from '../../ghibli/environment';
import { makeShadowPassengers } from '../../ghibli/characters';
import { FILMS } from '../common';
import { Streaks } from './glints';
import { SEA_Y, TRACK, TRAIN, trackX } from './places';

/*
 * The sea train gliding across the water far below, on its flooded line: two rails on sleepers that rest
 * on low posts just above the water. It is keyed to the rider: it starts well ahead, the rider slowly catches
 * up and is alongside it (40 below and 20 to the right) by z -2230, then it falls behind.
 */

const SCALE = 1.25;
/** height of the rail tops above the water */
const RAIL = 0.42;

/** Where the train's front is when the rider is at z `zr`: it runs at 0.65 of the rider's pace. */
export const trainZ = (zr: number) => clamp(-2150 + 0.65 * (2110 + zr), TRACK.z1 + 40, TRACK.z0 - 40);

/** A dark head-and-shoulders shape for a passenger standing at a lit window. */
function silhouetteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.filter = 'blur(1.5px)';
  g.beginPath(); g.ellipse(32, 24, 9, 11, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(32, 62, 20, 26, 0, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

export function buildTrainLine(rng: Rng) {
  const group = new THREE.Group();

  // ---------- the flooded line ----------
  const a = new THREE.Vector3(trackX(TRACK.z0), 0, TRACK.z0), b = new THREE.Vector3(trackX(TRACK.z1), 0, TRACK.z1);
  const len = a.distanceTo(b), yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const line = new THREE.Group();
  line.position.copy(a).lerp(b, 0.5).setY(SEA_Y);
  line.rotation.y = yaw;
  const railMat = toon(0x3a3c40), woodMat = toon(0x4a3828), postMat = toon(0x2e2a26);
  const gauge = 1.3 * SCALE;
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, len), railMat);
    rail.position.set(s * gauge, RAIL - 0.08, 0);
    line.add(rail);
  }
  const STEP = 2.2, n = Math.floor(len / STEP);
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 0.14, 0.36), woodMat, n);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), postMat, n * 2);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * STEP;
    sleepers.setMatrixAt(i, m4.makeTranslation(0, RAIL - 0.23, z));
    posts.setMatrixAt(i * 2, m4.makeTranslation(-1.9, RAIL - 0.3 - 0.75, z));
    posts.setMatrixAt(i * 2 + 1, m4.makeTranslation(1.9, RAIL - 0.3 - 0.75, z));
  }
  sleepers.computeBoundingSphere(); posts.computeBoundingSphere();
  line.add(sleepers, posts);
  mergeStatic(line);
  group.add(line);

  // ---------- the train ----------
  const t = buildSeaTrain();
  // the world lights the scene; the train's own lamps would add lights
  t.light.removeFromParent();
  t.cabinLight.removeFromParent();
  // shadow passengers in the glass cabin at the front, and more standing at the lit windows along the car
  const riders = makeShadowPassengers(3, rng, 2.2);
  riders.position.set(0, 0.67, -3.3);
  t.interior.add(riders);
  const silMat = new THREE.MeshBasicMaterial({ map: silhouetteTexture(), color: 0x140e0a, transparent: true, opacity: 0.82, depthWrite: false });
  const silGeo = new THREE.PlaneGeometry(0.95, 0.95);
  for (const s of [-1, 1]) for (let i = 1; i < 5; i++) {
    if (rng.chance(0.35)) continue;
    const m = new THREE.Mesh(silGeo, silMat);
    m.position.set(s * 1.67, 2.15, -2.5 - i * 2.1 + rng.range(-0.25, 0.25));
    m.rotation.y = s * Math.PI / 2;
    t.group.add(m);
  }
  t.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  t.winMat.emissiveIntensity = 1.05;
  mergeStatic(t.group);
  // the lit windows shine on the water beside it
  const streaks = new Streaks();
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) streaks.add(new THREE.Vector3(s * 1.9, (SEA_Y - RAIL) / SCALE + 0.03, -2.5 - i * 2.1), 0.9, 7, 0xffb060, i + s * 3);
  streaks.uniforms.uGain.value = 0.6;
  t.group.add(streaks.build());
  const root = new THREE.Group();
  root.add(t.group);
  t.group.scale.setScalar(SCALE);
  group.add(root);

  // ---------- its photo subject: it answers the ocarina with its lights ----------
  let blinkT = -1;
  const subject = new Subject({
    id: 'seatrain', name: 'The sea train', from: FILMS.spirited, group: root, radius: 10, base: 800, rarity: 'rare',
    hint: 'Gliding across the sea far below on your right, on its flooded line, with shadow passengers at the lit windows. Play the ocarina and it answers with its lights.',
    poses: { lights: { label: 'Answering with its lights', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 2.4, -4.5 * SCALE), maxDistance: 170,
    onCall: () => { blinkT = 0; subject.setPose('lights', 2.6); return true; },
  });

  const fwd = new THREE.Vector3();
  return {
    group, subject,
    update(dt: number, t2: number, zr: number, fog: THREE.FogExp2) {
      const z = trainZ(zr);
      root.position.set(trackX(z), SEA_Y + RAIL, z);
      fwd.set(trackX(z - 1) - trackX(z), 0, -1);
      root.rotation.y = Math.atan2(fwd.x, fwd.z);
      // a soft sway on the rails
      t.group.rotation.z = Math.sin(t2 * 1.7) * 0.006;
      // two blinks of the lights when called
      let boost = 0;
      if (blinkT >= 0) { blinkT += dt; boost = Math.max(0, Math.sin(blinkT * Math.PI * 2.4)) * 1.6 * (1 - smoothstep(1.4, 1.7, blinkT)); if (blinkT > 1.8) blinkT = -1; }
      t.winMat.emissiveIntensity = 1.05 + boost;
      streaks.uniforms.uGain.value = 0.6 + boost * 0.5;
      streaks.update(t2, fog);
      subject.active = zr < TRAIN.z0 + 70 && zr > TRAIN.z1 - 90;
    },
  };
}
