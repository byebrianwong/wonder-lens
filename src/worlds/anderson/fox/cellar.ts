import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import type { Road } from '../layout';
import { Batch, at, crossWall, V3 } from './build';
import type { Mats } from './mats';
import { CELLAR, Y, Z } from './plan';
import { lit } from './mats';

/*
 * Bean's cider cellar. The animals' tunnel breaks through the brick wall into a long barrel-vaulted cellar:
 * racks of cider barrels three high on both sides, their ends to the track, bare bulbs on cords down the
 * middle. The floor is flooded with glowing cider: it pours from burst barrels in arcs, and the train runs
 * down into it and through. The Rat keeps guard on a stack of barrels by the track. At the far end a wooden
 * stair climbs to a lit door where Bean stands looking down, a mug in his hand.
 */

const H = CELLAR.half, FL = Y.cellar, SPRING = Y.cellar + 4.2, RISE = CELLAR.vault - 4.2;
const ZA = Z.cellar.z0, ZB = Z.cellar.z1;

export interface Cellar {
  statics: THREE.Group;
  /** the barrels: instanced, ends to the track */
  live: THREE.Group;
  /** the cider's surface and its streams, scrolled by the set */
  streams: THREE.Texture;
  foam: THREE.Mesh[];
  floaters: Array<{ o: THREE.Object3D; y: number; ph: number }>;
  spots: { rat: { pos: THREE.Vector3; yaw: number }; heart: THREE.Vector3 };
}

/** A barrel's body: a lathe with a belly, open at the ends (u round, v along). */
function barrelGeo(r: number, len: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(t * Math.PI)), (t - 0.5) * len)); }
  return new THREE.LatheGeometry(pts, 16);
}

/** Bean in the lit doorway at the top of the stair: a thin black silhouette with a mug, on warm light. */
function beanDoorway() {
  const W = 256, Hh = 384;
  const p = new Painter(W, Hh, 81);
  const g = p.g;
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#fff2c8'); gr.addColorStop(1, '#f0b860');
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#1a1210';
  // a tall thin man: narrow shoulders, long legs, a bald head with a fringe, a mug raised
  const cx = W * 0.5;
  g.beginPath(); g.ellipse(cx, 70, 22, 28, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(cx - 34, 108); g.lineTo(cx + 34, 108); g.lineTo(cx + 26, 230); g.lineTo(cx - 26, 230); g.closePath(); g.fill();
  g.fillRect(cx - 24, 226, 18, 158); g.fillRect(cx + 6, 226, 18, 158);
  g.beginPath(); g.moveTo(cx + 30, 112); g.lineTo(cx + 64, 150); g.lineTo(cx + 70, 112); g.lineTo(cx + 60, 106); g.lineTo(cx + 56, 132); g.lineTo(cx + 36, 106); g.fill();
  g.fillRect(cx + 56, 84, 22, 28);
  g.beginPath(); g.moveTo(cx - 32, 112); g.lineTo(cx - 44, 210); g.lineTo(cx - 32, 212); g.lineTo(cx - 22, 120); g.fill();
  return p.texture({ wrap: false });
}

export function buildCellar(road: Road, rng: Rng, m: Mats): Cellar {
  const b = new Batch();
  const len = ZA - ZB, zc = (ZA + ZB) / 2;
  // ---------------- brick shell: walls, a segmental vault with ribs, the floor ----------------
  for (const s of [-1, 1]) b.box(s * H, s * (H + 0.4), FL - 0.5, SPRING, ZA, ZB, m.brick, 2);
  {
    const v = new THREE.CylinderGeometry(1, 1, len, 28, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(H, RISE, 1);
    const n = v.toNonIndexed(); const p = n.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
    n.deleteAttribute('normal'); n.computeVertexNormals();
    b.add(at(n, 0, SPRING, zc), m.brick, 2);
    // transverse ribs and the piers under them
    for (let z = ZA - 6; z > ZB + 2; z -= 9) {
      const rib = new THREE.TorusGeometry(1, 0.05, 6, 28, Math.PI).scale(H - 0.2, RISE - 0.15, 6);
      b.add(at(rib, 0, SPRING, z), m.woodDark);
      for (const s of [-1, 1]) b.box(s * (H - 0.5), s * H, FL, SPRING, z - 0.4, z + 0.4, m.woodDark);
    }
  }
  b.box(-H, H, FL - 0.5, FL, ZA, ZB, m.brick, 2);
  // the broken wall the train came through, and the far end wall with the climbing tunnel's hole
  const holeA = road.at(ZA + 0.5), holeB = road.at(ZB);
  b.add(crossWall(ZA, -H - 0.4, H + 0.4, FL - 0.5, SPRING + RISE + 0.3, -1, [{ x: 0, y: holeA.y + 2.5, r: 3.7, flatBottom: holeA.y - 0.4 }]), m.brick, 2);
  b.add(crossWall(ZB, -H - 0.4, H + 0.4, FL - 0.5, SPRING + RISE + 0.3, 1, [{ x: 0, y: holeB.y + 2.5, r: 3.6, flatBottom: holeB.y - 0.4 }]), m.brick, 2);
  // broken bricks round the hole, a spill of earth and rubble down to the cider
  for (let k = 0; k < 26; k++) {
    const a = rng.range(0, TAU), r = rng.range(3.6, 4.6);
    const x = Math.cos(a) * r, y = holeA.y + 2.5 + Math.sin(a) * r;
    if (y < FL) continue;
    b.add(at(new THREE.BoxGeometry(0.5, 0.25, 0.3), x, y, ZA - 0.1, rng.range(-0.4, 0.4), 0, a), m.brick);
  }
  // the ramp of rubble the track runs down: a bank from the hole to under the cider
  {
    const pos: number[] = [];
    const prof = (z: number): Array<[number, number]> => { const y = road.at(z).y - 0.25; return [[-5.5, FL], [-2.8, y], [2.8, y], [5.5, FL]]; };
    const n = 14;
    for (let i = 0; i < n; i++) {
      const za = ZA - 0.2 - (i / n) * 18, zb = ZA - 0.2 - ((i + 1) / n) * 18;
      const pa = prof(za), pb = prof(zb);
      for (let k = 0; k < 3; k++) {
        const A = [pa[k][0], pa[k][1], za], B = [pa[k + 1][0], pa[k + 1][1], za], C = [pb[k][0], pb[k][1], zb], D = [pb[k + 1][0], pb[k + 1][1], zb];
        pos.push(...A, ...B, ...C, ...B, ...D, ...C);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, m.floor, 4);
    for (let k = 0; k < 14; k++) { const z = ZA - rng.range(1, 14), s = rng.sign(); b.add(at(new THREE.BoxGeometry(0.6, 0.3, 0.35), s * rng.range(3.2, 5), road.at(z).y - 0.4, z, rng.range(0, 3), rng.range(-0.3, 0.3)), m.brick); }
  }

  // ---------------- barrel racks: three tiers each side, ends to the track ----------------
  const BR = 0.82, BL = 2.2, pitch = 1.9;
  const racks: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), one = new THREE.Vector3(1, 1, 1);
  const tiers = [FL + 0.25 + BR, FL + 0.25 + BR * 3 + 0.1, FL + 0.25 + BR * 5 + 0.2];
  for (const s of [-1, 1]) {
    const x = s * (H - 0.3 - BL / 2 - 0.2);
    for (const [ti, y] of tiers.entries()) {
      for (let z = ZA - 2.2; z > ZB + 1.5; z -= pitch) {
        // the right-hand racks stop short of Bean's stair
        if (s > 0 && z < ZB + 10.5) continue;
        racks.push(new THREE.Matrix4().compose(V3(x + s * (ti === 1 ? 0.12 : 0), y, z), q, one));
      }
      // cradle beams under each tier
      b.box(x - BL / 2, x + BL / 2, y - BR - 0.12, y - BR + 0.06, ZA - 1, ZB + 1, m.woodDark);
    }
    for (let z = ZA - 1.2; z > ZB + 1; z -= 5.7) b.box(x + s * (BL / 2 - 0.1), x + s * (BL / 2 + 0.1), FL, tiers[2] + BR, z - 0.1, z + 0.1, m.woodDark);
  }
  const live = new THREE.Group();
  const body = new THREE.InstancedMesh(barrelGeo(BR, BL), m.staves, racks.length);
  const endGeo = new THREE.CircleGeometry(BR * 0.86, 16);
  const ends = new THREE.InstancedMesh(endGeo, m.barrelEnd, racks.length * 2);
  const e1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), e2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const p = new THREE.Vector3(), tmp = new THREE.Quaternion(), sc = new THREE.Vector3();
  racks.forEach((mtx, i) => {
    body.setMatrixAt(i, mtx);
    mtx.decompose(p, tmp, sc);
    ends.setMatrixAt(i * 2, new THREE.Matrix4().compose(V3(p.x + BL / 2 + 0.01, p.y, p.z), e1, one));
    ends.setMatrixAt(i * 2 + 1, new THREE.Matrix4().compose(V3(p.x - BL / 2 - 0.01, p.y, p.z), e2, one));
  });
  for (const im of [body, ends]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.receiveShadow = true; live.add(im); }

  // ---------------- the Rat's stack: two barrels on end by the track, labels out ----------------
  const ratZ = -1047, ratX = -3.9;
  const upright = (x: number, y: number, z: number, yaw: number) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(barrelGeo(0.85, 1.9), m.staves));
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.74, 16).rotateX(-Math.PI / 2).translate(0, 0.95, 0), m.barrelEnd);
    g.add(top);
    g.position.set(x, y, z); g.rotation.y = yaw;
    b.addObject(g);
  };
  upright(ratX, FL + 0.95, ratZ, Math.PI / 2);
  upright(ratX, FL + 2.85, ratZ, Math.PI / 2 + 0.3);
  upright(ratX - 1.2, FL + 0.95, ratZ + 1.5, Math.PI / 2 - 0.4);
  upright(3.9, FL + 0.95, -1068, -Math.PI / 2);
  upright(4.4, FL + 0.95, -1070, -Math.PI / 2 + 0.5);

  // ---------------- the stair to Bean's door ----------------
  {
    const s = 1, top = FL + 6.4;
    for (let k = 0; k < 14; k++) {
      const y = FL + (k + 1) * (6.4 / 14), z = ZB + 9 - k * 0.6;
      b.box(s * 6.0, s * 8.6, y - 0.12, y, z - 0.3, z + 0.32, m.wood);
    }
    for (const x of [6.0, 8.6]) b.add(at(new THREE.BoxGeometry(0.16, 0.16, 9.6).rotateX(-Math.atan2(6.4, 8.4)), s * x, FL + 3.6, ZB + 5.0), m.woodDark);
    b.box(s * 5.6, s * 9.4, top - 0.2, top, ZB + 0.4, ZB + 1.6, m.wood);
    const door = lit(beanDoorway(), 0.9);
    b.add(at(new THREE.PlaneGeometry(1.8, 2.7), s * 7.5, top + 1.35, ZB + 0.42), door);
    b.box(s * 6.4, s * 6.6, top, top + 2.9, ZB + 0.3, ZB + 0.5, m.woodDark);
    b.box(s * 8.4, s * 8.6, top, top + 2.9, ZB + 0.3, ZB + 0.5, m.woodDark);
    b.box(s * 6.4, s * 8.6, top + 2.7, top + 2.9, ZB + 0.3, ZB + 0.5, m.woodDark);
  }

  // ---------------- bulbs on cords down the middle ----------------
  for (let z = ZA - 5; z > ZB + 3; z -= 8) {
    const y = SPRING + RISE - 0.1;
    b.add(at(new THREE.CylinderGeometry(0.015, 0.015, 2.4, 4), 0, y - 1.2, z), m.iron);
    b.add(at(new THREE.SphereGeometry(0.2, 10, 8), 0, y - 2.5, z), m.glass);
    b.add(at(new THREE.ConeGeometry(0.42, 0.3, 12, 1, true), 0, y - 2.25, z), m.iron);
  }

  // ---------------- the cider: the flood's surface, streams from burst barrels, foam ----------------
  const cz0 = ZA - 9, cz1 = ZB;
  b.add(at(new THREE.PlaneGeometry(2 * H, cz0 - cz1).rotateX(-Math.PI / 2), 0, Y.cider, (cz0 + cz1) / 2), m.cider, 6);
  const streamTex = m.cider.map!.clone();
  streamTex.repeat.set(0.4, 2);
  const streamMat = new THREE.MeshBasicMaterial({ map: streamTex, color: new THREE.Color(1.5, 1.15, 0.6), transparent: true, opacity: 0.9 });
  const foam: THREE.Mesh[] = [];
  const foamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.25, 0.9), transparent: true, opacity: 0.75 });
  const pours: Array<[number, number, number]> = [[-1, 1, -1040], [1, 0, -1044], [1, 1, -1053], [-1, 0, -1060], [-1, 2, -1066], [1, 1, -1074]];
  for (const [s, ti, z] of pours) {
    const x0 = s * (H - 0.3 - BL - 0.2), y0 = tiers[ti] - 0.2;
    const pts: THREE.Vector3[] = [];
    const reach = 1.6 + ti * 0.5;
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V3(x0 - s * reach * t, y0 - (y0 - Y.cider) * t * t, z)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.13, 6, false);
    const sm = new THREE.Mesh(tube, streamMat);
    live.add(sm);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6).scale(1, 0.25, 1), foamMat);
    f.position.set(x0 - s * reach, Y.cider + 0.02, z);
    live.add(f); foam.push(f);
  }
  // floating apples and a loose barrel
  const floaters: Cellar['floaters'] = [];
  const apple = new THREE.SphereGeometry(0.22, 10, 8);
  for (let k = 0; k < 16; k++) {
    const a = new THREE.Mesh(apple, rng.chance(0.7) ? m.red : m.green);
    a.position.set(rng.range(-H + 3.5, H - 3.5) * (rng.chance(0.5) ? 1 : 1), Y.cider, rng.range(cz0 - 2, cz1 + 3));
    if (Math.abs(a.position.x) < 2.4) a.position.x += Math.sign(a.position.x || 1) * 2.4;
    live.add(a); floaters.push({ o: a, y: Y.cider + 0.05, ph: rng.range(0, TAU) });
  }
  {
    const fb = new THREE.Group();
    fb.add(new THREE.Mesh(barrelGeo(0.8, 1.9), m.staves));
    fb.rotation.z = Math.PI / 2; fb.rotation.y = 0.6;
    fb.position.set(6.4, Y.cider + 0.2, -1058);
    live.add(fb); floaters.push({ o: fb, y: Y.cider + 0.25, ph: 1 });
  }
  for (const mat of [m.wood, m.woodDark, m.staves, m.barrelEnd, m.brick]) b.castShadow(mat);
  const statics = b.build();
  return { statics, live, streams: streamTex, foam, floaters, spots: { rat: { pos: V3(ratX, FL + 3.8, ratZ), yaw: Math.PI / 2 + 0.55 }, heart: V3(0, FL + 3, -1052) } };
}
