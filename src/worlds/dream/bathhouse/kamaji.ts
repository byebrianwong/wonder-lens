import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon, Painter } from '../../../engine/Paint';
import { envelope, limbGeometry, LookAt, outline, taperedTube } from '../../../engine/Rig';
import { clamp, Rng, smoothstep, TAU } from '../../../engine/math';
import { css, fabric, hairTexture } from '../../ghibli/characterTextures';
import { drawerWall } from './textures';

/*
 * Kamaji, the boiler man: an old man sitting cross-legged on his platform in front of a wall of herb drawers,
 * bald, with a big grey moustache, round dark glasses and six long, thin arms. The arms work on their own:
 * pulling drawers open, dropping herbs into the mortar, grinding with the pestle, and now and then one of
 * them stretches out, slowly, one arm at a time. Played the ocarina, he looks up and waves three arms;
 * thrown an acorn, he catches it in one hand.
 *
 * Each arm is a shoulder and an elbow joint posed by a two-joint reach (the hand goes to a target point, the
 * elbow bends out and up like a spider's leg), so the hands move between targets smoothly whatever the task.
 * Built facing +z, seated, origin on the cushion; the set scales the group up.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const L1 = 1.5, L2 = 1.5;
/** where the mortar sits, in his own space (on the low table in front of him) */
const MORTAR = new THREE.Vector3(0.05, 0.42, 0.78);

/** Bald head (sphere facing +z): tanned skin, wrinkles across the forehead, grey hair round the back. */
function kamajiHead() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 7971).fill(css(0xd4a070));
  const g = p.g;
  p.vgrad([[0, css(0xe0b080)], [0.5, css(0xd4a070)], [1, css(0xb07850)]]);
  p.dabs({ n: 40, colors: [css(0xc08860), css(0xe8bc90), css(0xa87050)], r: [3, 14], alpha: [0.1, 0.25] });
  // a fringe of grey hair round the back of the head, from ear to ear (the front is u 0.25)
  g.fillStyle = '#b8b4ac';
  g.beginPath();
  g.moveTo(W * 0.4, H * 0.42);
  g.quadraticCurveTo(W * 0.75, H * 0.36, W * 1.1, H * 0.42);
  g.lineTo(W * 1.1, H * 0.62); g.quadraticCurveTo(W * 0.75, H * 0.66, W * 0.4, H * 0.6);
  g.closePath(); g.fill();
  g.fillStyle = '#b8b4ac'; g.fillRect(0, H * 0.42, W * 0.1, H * 0.2);
  p.lines({ n: 60, colors: ['#8a8680', '#e0dcd4'], alpha: [0.2, 0.5], width: [1, 2], wobble: 2 });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(90,40,20,0.25)']]);
  // wrinkles on the forehead and a few liver spots
  g.strokeStyle = 'rgba(120,70,40,0.55)'; g.lineWidth = 2.5; g.lineCap = 'round';
  for (let k = 0; k < 4; k++) { const y = H * 0.24 + k * 9; g.beginPath(); g.moveTo(W * 0.19, y + 3); g.quadraticCurveTo(W * 0.25, y - 4, W * 0.31, y + 3); g.stroke(); }
  for (let k = 0; k < 8; k++) { g.fillStyle = 'rgba(140,80,40,0.3)'; g.beginPath(); g.arc(W * (0.12 + p.rng.next() * 0.3), H * (0.1 + p.rng.next() * 0.25), 3 + p.rng.next() * 4, 0, TAU); g.fill(); }
  // creases at the corners of the eyes, below the glasses
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W * (0.25 + s * 0.085), H * 0.5); g.lineTo(W * (0.25 + s * 0.11), H * 0.53); g.stroke(); }
  return p.texture();
}

interface Arm {
  sh: THREE.Group; el: THREE.Group; hand: THREE.Group;
  /** which side: -1 on his right (-x), +1 on his left */
  side: number;
  /** the hand's current target, in the group's own space */
  cur: THREE.Vector3;
  /** a direction the elbow bends towards, in the torso's space */
  pole: THREE.Vector3;
  acorn: THREE.Object3D;
  period: number; offset: number;
}

export interface Kamaji {
  group: THREE.Group;
  /** the drawers he pulls, in world space (add to the scene group) */
  drawers: THREE.InstancedMesh;
  /** dark holes behind the drawers, in world space */
  holes: THREE.Mesh;
  wave(): void;
  catch(worldPos: THREE.Vector3): void;
  update(dt: number, t: number, cam: THREE.Vector3): void;
}

/**
 * `place` puts him in the world (position, yaw, scale) before his drawers are fitted, and `wall` describes the
 * drawer wall behind him: the plane x = wall.x (facing +x) and the grid origin and size of its drawers.
 */
export function makeKamaji(place: { pos: THREE.Vector3; yaw: number; scale: number }, wall: { x: number; z0: number; y0: number; cell: number }): Kamaji {
  const g = new THREE.Group();
  const rng = new Rng(9091);
  // ink lines a little heavier than the children's, so he reads from across the room
  const ink = 0x2a1e18, lw = 1.7, lm = 0.05;
  // a little warm self-light: the furnace below him lights his face and arms
  const skin = charToon({ color: 0xc89060, rim: 0.45, emissive: 0x44200c });
  const shirt = charToon({ map: fabric(0x3c4a60, { folds: 9, seed: 91 }), rim: 0.4, shade: 0x9aa0cc, emissive: 0x1c1610 });
  const pants = charToon({ map: fabric(0x4a3424, { folds: 6, seed: 92 }), rim: 0.3, emissive: 0x1a0e08 });
  const towel = charToon({ map: fabric(0xeee6d4, { folds: 4, seed: 93 }), rim: 0.3, emissive: 0x3a2a1c });
  const hair = charToon({ map: hairTexture(0xd0ccc4, 94), rim: 0.55, emissive: 0x4a4038 });
  const glass = charToon({ color: 0x14161c, rim: 0.9, shade: 0x606880 });
  const metal = charToon({ color: 0xd0b070, rim: 0.5, emissive: 0x3a2a10 });
  const glintMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.2, 0.9) });

  // ----- body: a soft lathe from the hips to the neck, a towel round the neck, a sash -----
  const torso = new THREE.Group(); torso.position.y = 0.18; g.add(torso);
  const body = new THREE.Mesh(new THREE.LatheGeometry([
    V(0.001, 0, 0), V(0.27, 0.02, 0), V(0.33, 0.25, 0), V(0.34, 0.5, 0), V(0.31, 0.78, 0), V(0.3, 0.95, 0), V(0.22, 1.06, 0), V(0.1, 1.12, 0), V(0.001, 1.13, 0),
  ].map((p) => new THREE.Vector2(p.x, p.y)), 22).scale(1, 1, 0.82), shirt);
  torso.add(body);
  outline(body, ink, lw, lm);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 22).rotateX(Math.PI / 2).scale(1, 1, 0.84), pants);
  sash.position.y = 0.22; torso.add(sash);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.07, 8, 18).rotateX(Math.PI / 2 - 0.25), towel);
  scarf.position.set(0, 1.08, 0.03); torso.add(scarf);
  // ----- head -----
  const neck = new THREE.Group(); neck.position.y = 1.1; torso.add(neck);
  neck.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 10).translate(0, 0.05, 0), skin));
  const head = new THREE.Group(); head.position.set(0, 0.36, 0.04); neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.31, 32, 22), charToon({ map: kamajiHead(), rim: 0.5, emissive: 0x44200c }));
  skull.scale.set(0.96, 1.1, 1);
  head.add(skull);
  outline(skull, ink, lw, lm);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin); ear.scale.set(0.45, 1, 0.75); ear.position.set(s * 0.3, -0.02, -0.01); head.add(ear); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin);
  nose.scale.set(0.075, 0.085, 0.08); nose.position.set(0, -0.06, 0.31); head.add(nose);
  // round dark glasses on a thin wire frame
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glass);
    lens.scale.set(0.085, 0.085, 0.03); lens.position.set(s * 0.11, 0.03, 0.29); head.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.017, 6, 20), metal);
    rim.position.set(s * 0.11, 0.03, 0.3); head.add(rim);
    // a glint of the fire on each lens, so the glasses read as glass
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), glintMat);
    glint.scale.set(0.022, 0.014, 0.005); glint.position.set(s * 0.11 - 0.03, 0.06, 0.322); glint.rotation.z = 0.5; head.add(glint);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4).rotateX(Math.PI / 2), metal);
    arm.position.set(s * 0.2, 0.04, 0.16); arm.rotation.y = -s * 0.2; head.add(arm);
    // bushy grey eyebrows over the glasses
    const brow = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), hair);
    brow.scale.set(0.1, 0.035, 0.05); brow.position.set(s * 0.12, 0.14, 0.27); brow.rotation.z = s * 0.25; head.add(brow);
  }
  head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4).rotateZ(Math.PI / 2).translate(0, 0.045, 0.3), metal));
  // the big drooping moustache
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([V(s * 0.01, -0.11, 0.31), V(s * 0.12, -0.13, 0.3), V(s * 0.22, -0.22, 0.25), V(s * 0.26, -0.36, 0.19)]);
    const m = new THREE.Mesh(taperedTube(c, 0.075, 0.025, 12, 10), hair);
    head.add(m);
    outline(m, ink, lw, lm);
  }
  const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), hair);
  puff.scale.set(0.1, 0.05, 0.05); puff.position.set(0, -0.11, 0.31); head.add(puff);

  // ----- crossed legs -----
  const limbOn = (parent: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3, r0: number, r1: number, len: number, mat: THREE.Material) => {
    const j = new THREE.Group(); j.position.copy(from);
    j.quaternion.setFromUnitVectors(V(0, -1, 0), dir.clone().normalize());
    const m = new THREE.Mesh(limbGeometry(r0, r1, len, 10, 4), mat);
    j.add(m); parent.add(j);
    outline(m, ink, lw, lm);
    return j;
  };
  for (const s of [-1, 1]) {
    limbOn(g, V(s * 0.17, 0.2, 0.05), V(s * 0.55, -0.08, 0.75), 0.12, 0.1, 0.58, pants);
    limbOn(g, V(s * 0.5, 0.14, 0.48), V(-s * 0.85, 0, 0.3), 0.1, 0.08, 0.6, pants);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
    foot.scale.set(0.12, 0.06, 0.07); foot.position.set(-s * 0.08, 0.1, 0.66); foot.rotation.y = s * 0.4;
    g.add(foot);
  }

  // ----- six arms -----
  // long and thin, but thick enough to read from twenty units away
  const upperGeo = limbGeometry(0.1, 0.075, L1, 10, 6), foreGeo = limbGeometry(0.078, 0.06, L2, 10, 6);
  // a long thin hand: palm and three fingers, one geometry
  const handGeo = (() => {
    const palm = new THREE.SphereGeometry(1, 10, 8).scale(0.1, 0.15, 0.06).translate(0, -0.12, 0);
    const fingers = [-1, 0, 1].map((k) => limbGeometry(0.032, 0.022, 0.24, 6, 3).rotateX(0.35).rotateZ(k * 0.25).translate(k * 0.05, -0.24, 0.015));
    const parts = [palm, ...fingers].map((x) => { x.deleteAttribute('uv'); return x.index ? x.toNonIndexed() : x; });
    return mergeGeometries(parts)!;
  })();
  const acornGeo = mergeGeometries([new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.25, 1), new THREE.SphereGeometry(0.065, 8, 5).scale(1, 0.55, 1).translate(0, 0.055, 0)].map((x) => x.toNonIndexed()))!;
  const acornMat = charToon({ color: 0x8a5a30, rim: 0.3 });
  const arms: Arm[] = [];
  const sockets: Array<[number, number, number]> = [[0.26, 0.98, -0.02], [0.27, 0.84, -0.1], [0.25, 0.68, -0.12]];
  sockets.forEach(([x, y, z], pair) => {
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * x, y, z); torso.add(sh);
      const up = new THREE.Mesh(upperGeo, skin); sh.add(up); outline(up, ink, lw, lm);
      const el = new THREE.Group(); el.position.y = -L1; sh.add(el);
      const fore = new THREE.Mesh(foreGeo, skin); el.add(fore); outline(fore, ink, lw, lm);
      const hand = new THREE.Group(); hand.position.y = -L2; el.add(hand);
      hand.add(new THREE.Mesh(handGeo, skin));
      const acorn = new THREE.Mesh(acornGeo, acornMat); acorn.position.set(0, -0.24, 0.08); acorn.visible = false; hand.add(acorn);
      arms.push({
        sh, el, hand, side, cur: V(side * 0.5, 0.3, 0.5), pole: V(side * 0.8, 0.7 - pair * 0.25, -0.5).normalize(), acorn,
        period: [11, 13, 15, 17, 12, 14][arms.length], offset: rng.range(0, 10),
      });
    }
  });

  // ----- the low table with the mortar, and the pestle in the grinding hand -----
  const wood = charToon({ color: 0x6a4428, rim: 0.3 });
  const clay = charToon({ color: 0x9a5a3a, rim: 0.3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.62).translate(0, 0.2, 0.86), wood));
  for (const [x, z] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, 1.12], [0.5, 1.12]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06).translate(x, 0.06, z), wood));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.1, 0.01), new THREE.Vector2(0.17, 0.08), new THREE.Vector2(0.19, 0.16), new THREE.Vector2(0.17, 0.165), new THREE.Vector2(0.12, 0.06)], 18), clay);
  bowl.position.set(MORTAR.x, 0.23, MORTAR.z);
  g.add(bowl);
  outline(bowl, ink, lw, lm);
  const pestle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.5, 8).translate(0, -0.34, 0.03), wood);
  arms[2].hand.add(pestle);
  // herbs and little bowls on the table
  for (let i = 0; i < 5; i++) {
    const herb = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), charToon({ color: [0x6a8a3a, 0x9a7a3a, 0x5a6a2a, 0xa8483a, 0xc8b060][i], rim: 0.2 }));
    herb.scale.set(0.07, 0.035, 0.07); herb.position.set(-0.42 + i * 0.13 + (i > 2 ? 0.25 : 0), 0.24, 0.98 + (i % 2) * 0.08);
    g.add(herb);
  }

  // ----- placement and the drawers -----
  g.position.copy(place.pos);
  g.rotation.y = place.yaw;
  g.scale.setScalar(place.scale);
  g.updateMatrixWorld(true);
  // each arm gets its own drawer on the wall behind him, snapped to the drawer grid, on the arm's own side
  // (his right, local -x, points along world +z when he faces +x)
  const rightZ = Math.sin(place.yaw);
  const slots: THREE.Vector3[] = [];
  // height above the cushion and distance along the wall, in world units
  const picks: Array<[number, number]> = [[2.6, 1.8], [2.4, 1.8], [3.4, 0.6], [3.4, 0.6], [1.2, 2.6], [1.6, 2.8]].map(([h, a]) => [h * place.scale / 1.6, a * place.scale / 1.6] as [number, number]);
  arms.forEach((a, i) => {
    const [h, along] = picks[i];
    const z = place.pos.z - a.side * rightZ * along;
    const col = Math.round((wall.z0 - z) / wall.cell - 0.5), row = Math.round((place.pos.y + h - wall.y0) / wall.cell - 0.5);
    slots.push(V(wall.x, wall.y0 + (row + 0.5) * wall.cell, wall.z0 - (col + 0.5) * wall.cell));
  });
  // the drawers: boxes whose front (+x) shows one painted drawer; dark holes behind them
  const dGeo = new THREE.BoxGeometry(0.9, wall.cell * 0.94, wall.cell * 0.94);
  const duv = dGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < duv.count; i++) duv.setXY(i, (duv.getX(i) * 0.94 + 0.03) / 6, (duv.getY(i) * 0.94 + 0.03) / 6 + 5 / 6);
  const drawers = new THREE.InstancedMesh(dGeo, new THREE.MeshLambertMaterial({ map: drawerWall() }), slots.length);
  drawers.castShadow = true;
  const holes = new THREE.Mesh(mergeGeometries(slots.map((s) => new THREE.PlaneGeometry(wall.cell * 0.9, wall.cell * 0.9).rotateY(Math.PI / 2).translate(s.x + 0.006, s.y, s.z)))!, new THREE.MeshBasicMaterial({ color: 0x0a0604 }));
  holes.userData.keep = true;
  const pulls = slots.map(() => 0);
  const m4 = new THREE.Matrix4();
  const setDrawers = () => {
    slots.forEach((s, i) => { m4.makeTranslation(s.x - 0.43 + pulls[i] * 0.75, s.y, s.z); drawers.setMatrixAt(i, m4); });
    drawers.instanceMatrix.needsUpdate = true;
  };
  setDrawers();
  drawers.computeBoundingSphere();

  // ----- the work: targets in his own space -----
  const toLocal = (w: THREE.Vector3) => g.worldToLocal(w.clone());
  // where the hand holds each drawer's front, shut and pulled out
  const drawerIn = slots.map((s) => toLocal(s.clone().add(V(0.1, 0, 0))));
  const drawerOut = slots.map((s) => toLocal(s.clone().add(V(0.85, 0, 0))));
  const mortar = MORTAR;
  const rest = (side: number) => V(side * 0.42, 0.32, 0.52);
  const stretch = (side: number, k: number) => V(side * (1.4 + k * 0.6), 2.4 + k * 0.5, 0.1 - k * 0.3);
  const look = new LookAt(1.0, 0.5);
  let waveT = -1, catchT = -1;
  const catchAt = new THREE.Vector3();
  let catchArm = 0;
  const want = new THREE.Vector3(), tmp = new THREE.Vector3(), T = new THREE.Vector3(), S = new THREE.Vector3(), dir = new THREE.Vector3(), n = new THREE.Vector3(), u = new THREE.Vector3(), f = new THREE.Vector3(), mm = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), basis = new THREE.Matrix4();
  const camW = new THREE.Vector3();

  /** pose one arm so its hand reaches `target` (in the group's space), the elbow bending towards the pole */
  const reach = (a: Arm, target: THREE.Vector3) => {
    T.copy(target).applyMatrix4(g.matrixWorld);
    torso.updateMatrixWorld();
    torso.worldToLocal(T);
    S.copy(a.sh.position);
    dir.subVectors(T, S);
    const dist = clamp(dir.length(), 0.25, (L1 + L2) * 0.995);
    dir.normalize();
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), A = Math.acos(cosA);
    n.copy(a.pole).addScaledVector(dir, -a.pole.dot(dir));
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0).addScaledVector(dir, -dir.y);
    n.normalize();
    u.copy(dir).multiplyScalar(Math.cos(A)).addScaledVector(n, Math.sin(A));
    // forearm direction from the elbow to the hand
    f.copy(S).addScaledVector(dir, dist).sub(tmp.copy(S).addScaledVector(u, L1)).normalize();
    mm.copy(f).addScaledVector(u, -f.dot(u));
    if (mm.lengthSq() < 1e-8) mm.copy(n); else mm.normalize();
    Y.copy(u).negate(); Z.copy(mm).negate(); X.crossVectors(Y, Z);
    a.sh.quaternion.setFromRotationMatrix(basis.makeBasis(X, Y, Z));
    a.el.rotation.set(Math.acos(clamp(u.dot(f), -1, 1)), 0, 0);
  };

  const ch: Kamaji = {
    group: g, drawers, holes,
    wave() { waveT = 0; },
    catch(p) {
      catchT = 0; catchAt.copy(toLocal(p));
      // the nearest hand on that side catches it
      let best = 1e9;
      arms.forEach((a, i) => { const d = a.cur.distanceTo(catchAt); if (d < best) { best = d; catchArm = i; } });
    },
    update(dt, t, cam) {
      g.updateMatrixWorld();
      if (waveT >= 0) { waveT += dt; if (waveT > 3.2) waveT = -1; }
      if (catchT >= 0) { catchT += dt; if (catchT > 2.2) catchT = -1; }
      const waveK = waveT >= 0 ? envelope(waveT, 0, 0.6, 2.4, 3.2) : 0;
      // one arm at a time stretches, slowly, every nine seconds
      const stretchArm = Math.floor(t / 9) % 6, stretchK = envelope(t % 9, 0.5, 2.2, 3.6, 5.4);
      arms.forEach((a, i) => {
        const ph = ((t + a.offset) % a.period) / a.period;
        let pull = 0;
        if (i === 2) {
          // grinding: the hand circles round the mortar
          want.copy(mortar).add(tmp.set(Math.cos(t * 2.4) * 0.09, 0.12 + Math.sin(t * 4.8) * 0.03, Math.sin(t * 2.4) * 0.07));
        } else if (i === 3) {
          // steadying the mortar's rim
          want.copy(mortar).add(tmp.set(0.17, 0.08, 0.02 + Math.sin(t * 0.7) * 0.02));
        } else {
          // the drawer round: rest, reach for its drawer, pull it, carry a pinch to the mortar, rest
          if (ph < 0.18) want.copy(rest(a.side));
          else if (ph < 0.48) {
            // the hand holds the drawer's front while it slides out and back in
            pull = smoothstep(0.3, 0.37, ph) * (1 - smoothstep(0.41, 0.47, ph));
            want.copy(drawerIn[i]).lerp(drawerOut[i], pull);
          } else if (ph < 0.7) want.copy(mortar).add(tmp.set(a.side * 0.1, 0.25, 0));
          else want.copy(rest(a.side)).add(tmp.set(0, Math.sin(t * 0.8 + i) * 0.04, 0));
        }
        pulls[i] = pull;
        // the slow stretch
        if (i === stretchArm && stretchK > 0 && waveK === 0) want.lerp(stretch(a.side, stretchK), stretchK);
        // the wave: the three upper and middle right arms, high, side to side
        if (waveK > 0 && (i === 0 || i === 1 || i === 2)) {
          const wv = V(a.side * (0.9 + Math.sin(t * 9 + i) * 0.25), 2.0 + (i === 2 ? -0.3 : 0), 0.7);
          want.lerp(wv, waveK);
        }
        // the catch: one hand darts to the acorn, then brings it up in front of his face
        let caught = false;
        if (catchT >= 0 && i === catchArm) {
          const go = envelope(catchT, 0, 0.35, 0.8, 1.3), show = envelope(catchT, 0.8, 1.3, 1.8, 2.2);
          tmp.copy(catchAt);
          want.lerp(tmp, go).lerp(V(0.12, 1.5, 0.75), show);
          caught = catchT > 0.3 && catchT < 2.0;
        }
        a.acorn.visible = caught;
        // move unhurriedly towards the target (faster when catching)
        a.cur.lerp(want, 1 - Math.exp(-(catchT >= 0 && i === catchArm ? 9 : waveK > 0 ? 5 : 2.6) * dt));
        reach(a, a.cur);
        a.hand.rotation.set(Math.sin(t * 1.3 + i) * 0.2, 0, Math.sin(t * 0.9 + i) * 0.15);
      });
      setDrawers();
      // the head: down at the work, up at the camera when he waves or when you come close
      camW.copy(cam);
      const near = g.position.distanceTo(cam) < 26;
      const target = catchT >= 0 ? arms[catchArm].hand.getWorldPosition(tmp) : waveK > 0 || near ? camW : null;
      const [ly, lp] = look.update(neck, target, dt, 1);
      neck.rotation.set(lp * 0.4 + (target ? 0 : 0.28), ly * 0.4, 0);
      head.rotation.set(lp * 0.6, ly * 0.6, Math.sin(t * 0.4) * 0.03);
      torso.rotation.set(0.08 + Math.sin(t * 0.5) * 0.015 + waveK * -0.05, 0, Math.sin(t * 0.37) * 0.02);
    },
  };
  return ch;
}
