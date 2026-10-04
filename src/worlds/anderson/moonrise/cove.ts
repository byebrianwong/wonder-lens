import * as THREE from 'three';
import { box, cyl, glow, mesh, sphere } from '../../../engine/Builders';
import { Painter } from '../../../engine/Paint';
import { envelope, Spring } from '../../../engine/Rig';
import { Rng, TAU, clamp, lerp } from '../../../engine/math';
import { optimize } from '../common';
import { bark } from '../textures';
import { texMat } from '../kit';
import { COVE } from './plan';
import { MK, boardSign, canvasCloth, stoneLetters } from './textures';
import { KID, bake, flat, kittenBasket, lighten, recordPlayer, scoutKid, suzyKid, unify, type Kid } from './figures';

/*
 * Mile 3.25 Tidal Inlet: the cove Sam and Suzy make their camp in and name Moonrise Kingdom. A crescent of
 * sand below a low dune, their yellow tent and campfire, the canoe pulled up, Suzy's suitcase, books, kitten
 * and battery record player playing Françoise Hardy, Sam's easel with his painting of the cove, the mile sign
 * by the track, and the name spelled out in white stones on the beach. On the dune the two of them dance.
 */

export interface Cove {
  group: THREE.Group;
  dancers: THREE.Group;
  sign: THREE.Object3D;
  /** whistle: they stop dancing and kiss */
  kiss(): void;
  /** a box landed near them: they stop and look */
  look(at: THREE.Vector3): void;
  /** for the finale and the subject's facing bonus */
  sam: Kid; suzy: Kid;
  update(dt: number, t: number, cam: THREE.Vector3): void;
}

/** Sam's watercolour of the cove, on his easel. */
function samPainting() {
  const p = new Painter(160, 128, 9101).fill('#f4efe2');
  const g = p.g;
  g.fillStyle = '#9cc4d8'; g.fillRect(8, 8, 144, 50);
  g.fillStyle = '#3f8f8c'; g.fillRect(8, 58, 144, 26);
  g.fillStyle = '#e4cf9c'; g.beginPath(); g.moveTo(8, 84); g.quadraticCurveTo(80, 60, 152, 84); g.lineTo(152, 120); g.lineTo(8, 120); g.fill();
  g.fillStyle = '#e2b33c'; g.beginPath(); g.moveTo(60, 96); g.lineTo(72, 78); g.lineTo(84, 96); g.fill();
  g.fillStyle = '#2a3550'; g.font = 'italic 11px Georgia, serif'; g.textAlign = 'center'; g.fillText('Moonrise Kingdom', 80, 114);
  return p.texture({ wrap: false });
}

export function buildCove(ground: (x: number, z: number) => number): Cove {
  const rng = new Rng(9100);
  const group = new THREE.Group(), statics = new THREE.Group();
  group.add(statics);
  const add = (o: THREE.Object3D) => { statics.add(o); return o; };
  const wood = flat(0x7a5a3a, 0.3), drift = texMat(bark(0xb8a890, 9102));

  // ---------- the mile sign by the track ----------
  const sign = new THREE.Group();
  {
    const S = COVE.sign;
    sign.add(cyl(0.09, 0.11, 2.6, wood, -1.0, 1.3, 0, 6), cyl(0.09, 0.11, 2.6, wood, 1.0, 1.3, 0, 6));
    const tex = boardSign({ title: 'MILE 3.25', sub: 'Tidal Inlet', fg: 0x2a3550, bg: 0xf4ecdc, border: 0x2a3550, w: 768, h: 384, seed: 9103 });
    const face = mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }), 0, 2.0, 0.07);
    sign.add(face, box(2.75, 1.45, 0.12, flat(0x5a6a7a, 0.2), 0, 2.0, 0));
    sign.position.set(S.x, ground(S.x, S.z), S.z);
    // turned to face the oncoming train
    sign.rotation.y = 0.75;
    add(sign);
  }

  // ---------- the camp on the beach ----------
  {
    const T = COVE.tent, ty = ground(T.x, T.z);
    const tent = new THREE.Group();
    const canvas = new THREE.MeshLambertMaterial({ map: canvasCloth(MK.mustard, 9104), side: THREE.DoubleSide });
    const L = 2.6, Wd = 2.0, H = 1.5;
    // a ridge tent: a prism of canvas
    const gable = new THREE.Shape(); gable.moveTo(-Wd / 2, 0); gable.lineTo(Wd / 2, 0); gable.lineTo(0, H); gable.closePath();
    const prism = new THREE.ExtrudeGeometry(gable, { depth: L, bevelEnabled: false });
    const puv = prism.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) / 2, puv.getY(i) / 2);
    tent.add(mesh(prism, canvas, 0, 0, -L / 2));
    tent.add(mesh(new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-0.45, 0); sh.lineTo(0.45, 0); sh.lineTo(0, H * 0.92); sh.closePath(); return sh; })()), flat(0x2a2218, 0.1), 0, 0, L / 2 + 0.01));
    tent.add(cyl(0.03, 0.03, H + 0.3, wood, 0, (H + 0.3) / 2, L / 2 + 0.05, 5), cyl(0.03, 0.03, H + 0.3, wood, 0, (H + 0.3) / 2, -L / 2 - 0.05, 5));
    tent.position.set(T.x, ty, T.z); tent.rotation.y = 0.9;
    add(tent);
    // the campfire with a pot on a tripod
    const fx = T.x + 2.6, fz = T.z + 2.0, fy = ground(fx, fz);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; add(sphere(0.17, flat(0x8a857a, 0.2), fx + Math.cos(a) * 0.6, fy + 0.06, fz + Math.sin(a) * 0.6, 6, 5)); }
    for (let k = 0; k < 3; k++) { const l = cyl(0.06, 0.06, 0.8, flat(0x4a3424), fx, fy + 0.12, fz, 5); l.rotation.set(Math.PI / 2, (k / 3) * Math.PI, 0); add(l); }
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; const leg = cyl(0.025, 0.025, 1.4, wood, fx + Math.cos(a) * 0.35, fy + 0.65, fz + Math.sin(a) * 0.35, 4); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); add(leg); }
    add(cyl(0.18, 0.15, 0.22, flat(0x2a2a2e, 0.4), fx, fy + 0.75, fz, 10));
    add(sphere(0.2, glow(0xffa040, 1.6), fx, fy + 0.18, fz, 8, 6));
    // the canoe, pulled up
    const canoe = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8, 0, TAU, Math.PI / 2, Math.PI / 2), flat(0x3f6a4a, 0.3));
    canoe.scale.set(0.45, 0.35, 2.3); canoe.rotation.x = Math.PI; canoe.position.set(T.x - 2.6, ground(T.x - 2.6, T.z - 1.5) + 0.32, T.z - 1.5); canoe.rotation.y = 0.5;
    const cg = new THREE.Group(); cg.add(canoe); add(cg);
    const paddle = box(0.08, 0.04, 1.6, wood, T.x - 1.6, ground(T.x - 1.6, T.z - 2.4) + 0.05, T.z - 2.4); paddle.rotation.y = 0.9; add(paddle);
    // Suzy's suitcase and her stack of library books, Sam's knapsack
    add(box(0.75, 0.5, 0.26, flat(0x7aaad8, 0.3), T.x + 1.4, ty + 0.25, T.z + 0.2).rotateY(0.6));
    const cols = [0xb0473a, 0x3f8f8c, 0xe2b33c, 0x2a3550, 0xf0a2a8, 0x6a8a5a];
    for (let i = 0; i < 6; i++) add(box(0.4, 0.07, 0.3, flat(cols[i]), T.x + 1.6, ty + 0.035 + i * 0.072, T.z - 0.8).rotateY(rng.range(-0.3, 0.3)));
    add(box(0.45, 0.55, 0.3, flat(0x6a7a4a, 0.3), T.x - 1.0, ty + 0.27, T.z + 1.6).rotateY(-0.4));
    // Sam's easel with his painting of the cove
    const easel = new THREE.Group();
    for (const s of [-1, 1]) { const l = box(0.05, 1.6, 0.05, wood, s * 0.35, 0.8, 0); l.rotation.z = s * 0.12; easel.add(l); }
    const back = box(0.05, 1.6, 0.05, wood, 0, 0.75, -0.35); back.rotation.x = -0.3; easel.add(back);
    easel.add(mesh(new THREE.PlaneGeometry(0.9, 0.72), new THREE.MeshLambertMaterial({ map: samPainting() }), 0, 1.2, 0.04), box(0.95, 0.04, 0.12, wood, 0, 0.82, 0.03));
    easel.position.set(T.x + 3.4, ground(T.x + 3.4, T.z - 1.2), T.z - 1.2); easel.rotation.y = 1.2;
    add(easel);
  }
  // driftwood on the beach
  for (const [x, z, r] of [[-12.4, -1374, 0.4], [-14.5, -1388, 1.4], [-10.2, -1406, 2.2]] as const) {
    const l = mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 7), drift, x, ground(x, z) + 0.12, z); l.rotation.set(0, r, Math.PI / 2); add(l);
  }
  // the name, in white stones on the sand, tilted a little towards the track so it reads from the train
  {
    const tex = stoneLetters();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.35, depthWrite: true }));
    const cx = -12.6, cz = -1400;
    // lying on the beach, which slopes up towards the track, so the word faces the train
    const tilt = Math.atan2(ground(cx + 2.1, cz) - ground(cx - 2.1, cz), 4.2);
    m.position.set(cx, (ground(cx + 2.1, cz) + ground(cx - 2.1, cz)) / 2 + 0.07, cz);
    // text runs along -z (left to right as seen from the track), the tops of the letters point away (-x)
    m.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + tilt, 0, 0)));
    m.receiveShadow = true;
    group.add(m);
  }
  // rocks at the horns of the cove
  for (let k = 0; k < 18; k++) {
    const z = k < 9 ? rng.range(-1346, -1360) : rng.range(-1410, -1424), x = rng.range(-26, -12);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.6, 1.6), 0), flat(0x857c70, 0.2));
    r.position.set(x, ground(x, z) - 0.2, z); r.rotation.set(rng.range(0, 3), rng.range(0, 3), 0); r.scale.y = 0.65; add(r);
  }
  unify(statics);
  statics.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  optimize(statics);

  // ---------- Sam and Suzy, dancing on the dune to Françoise Hardy ----------
  const dancers = new THREE.Group();
  const D = COVE.dance;
  dancers.position.set(D.x, ground(D.x, D.z), D.z);
  // they face each other across the line of the track's direction, side-on to the rider
  group.add(dancers);
  const sam = scoutKid({ hair: 0x6a4428, seed: 9111, sam: true });
  const suzy = suzyKid(9121);
  const pair = [sam, suzy];
  const wraps = pair.map(() => new THREE.Group());
  pair.forEach((k, i) => {
    k.group.scale.setScalar(KID.tall * (i ? 1.0 : 0.98));
    wraps[i].add(k.group);
    wraps[i].position.z = i ? -0.55 : 0.55;
    wraps[i].rotation.y = i ? 0 : Math.PI;
    dancers.add(wraps[i]);
  });
  // the record player on a log beside them, and the kitten in its basket
  const rp = recordPlayer(1.0, 0xf2e6c8);
  const log = mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.6, 8), drift, -1.1, 0.18, 1.7); log.rotation.set(0, 0.5, Math.PI / 2);
  dancers.add(log);
  rp.group.position.set(-1.1, 0.38, 1.6); rp.group.rotation.y = Math.PI / 2 + 0.5;
  dancers.add(rp.group);
  const kit = kittenBasket(1.6);
  kit.group.position.set(-0.9, 0, -1.5); kit.group.rotation.y = 1.2;
  dancers.add(kit.group);
  for (const k of pair) { lighten(k.group, 56, 36); bake(k.group, [k.spine, k.head, k.shoulder[0], k.shoulder[1], k.elbow[0], k.elbow[1]]); }
  {
    const lr = new THREE.Group(); dancers.add(lr);
    const parts = [rp.group, log, kit.group];
    for (const p of parts) { dancers.remove(p); lr.add(p); }
    unify(lr);
    bake(lr, [rp.record, kit.head]);
  }

  // ---------- life ----------
  let kissT = -1, lookT = -1;
  const lookAt = new THREE.Vector3();
  const sp = { kiss: new Spring(0, 1.3, 0.8), look: new Spring(0, 1.8, 0.8) };
  return {
    group, dancers, sign, sam, suzy,
    kiss() { kissT = 0; },
    look(at) { lookT = 0; lookAt.copy(at); },
    update(dt, t, cam) {
      let kq = 0, lq = 0;
      if (kissT >= 0) { kissT += dt; kq = envelope(kissT, 0, 0.9, 3.6, 4.6); if (kissT > 4.6) kissT = -1; }
      if (lookT >= 0) { lookT += dt; lq = envelope(lookT, 0, 0.25, 2.2, 2.8); if (lookT > 2.8) lookT = -1; }
      const K = sp.kiss.update(kq, dt), Lk = sp.look.update(lq, dt);
      const dance = (1 - clamp(K, 0, 1)) * (1 - clamp(Lk, 0, 1));
      rp.record.rotation.y -= dt * 3.4;
      kit.head.rotation.y = Math.sin(t * 0.7) * 0.5; kit.head.rotation.z = Math.sin(t * 1.3) * 0.15;
      pair.forEach((k, i) => {
        const s = i ? 1 : -1;
        // look at the box, at the rider now and then, or at each other
        k.tick(dt, t, Lk > 0.1 ? lookAt : cam, Lk > 0.1 ? Lk : 0.35 * dance);
        const beat = t * 2.1 * Math.PI + i * 0.4;
        // the dance: a stiff little twist and bounce, arms up and bent, heads bobbing
        wraps[i].position.y = Math.abs(Math.sin(beat)) * 0.05 * dance;
        wraps[i].position.z = (i ? -1 : 1) * lerp(0.55, 0.27, K);
        k.spine.rotation.set(lerp(0, 0.16, K), Math.sin(beat) * 0.3 * dance, Math.sin(beat * 0.5) * 0.08 * dance);
        k.head.rotation.x += lerp(0, 0.12, K);
        k.head.rotation.z = Math.sin(beat + 1) * 0.12 * dance + s * 0.15 * K;
        for (let j = 0; j < 2; j++) {
          const sd = j ? 1 : -1, ph = beat + j * Math.PI;
          let sx = -0.7 + Math.sin(ph) * 0.35, sz = sd * 0.55, ex = -1.5 + Math.cos(ph) * 0.3;
          // the kiss: Sam's hands at her waist, her arms round his neck
          const kx = i ? -2.0 : -0.75, kz = sd * (i ? -0.15 : -0.05), kex = i ? -0.9 : -0.6;
          // the look: hands down
          sx = lerp(lerp(sx, kx, K), -0.1, Lk); sz = lerp(lerp(sz, kz, K), sd * 0.12, Lk); ex = lerp(lerp(ex, kex, K), -0.2, Lk);
          k.shoulder[j].rotation.set(sx, 0, sz);
          k.elbow[j].rotation.set(ex, 0, 0);
        }
      });
    },
  };
}
