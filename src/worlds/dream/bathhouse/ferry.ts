import * as THREE from 'three';
import { box, cyl } from '../../../engine/Builders';
import { Painter } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { deckPlanks } from '../../ghibli/propTextures';
import { FERRY, QUAY } from './plan';
import { CELL, townAtlas } from './textures';
import { accMeshes, addHouse, COLORS, newAccs } from './town';
import { LANTERN, type LanternField } from './wave';
import type { BridgeMats } from './bridge';
import type { PlumeSource } from './steam';

/*
 * The spirits' ferry: a paddle steamer moored at the quay under the far wall. A dark green hull with a red
 * gunwale, red paddle boxes with gold sunbursts, a cabin with lit paper windows, a pavilion on the upper
 * deck, a tall funnel, lanterns strung along the rails, and a gangplank down to the quay. The masked
 * spirits come out of the cabin door on the quay side.
 *
 * It is built in world axes, its origin at the middle of the deck; its -z side faces the quay.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The cabin door on the quay side and the foot of the gangplank, in world space (the spirits' route). */
export const FERRY_DOOR = { inside: V(FERRY.x - 4, FERRY.deck, FERRY.z - 0.9), door: V(FERRY.x - 4, FERRY.deck, FERRY.z - 3.1), edge: V(FERRY.x - 4, FERRY.deck, FERRY.z - 3.9), foot: V(FERRY.x - 4, QUAY.top, QUAY.z0 - 1.6) };

function sunburst() {
  const p = new Painter(256, 256, 7951).fill('#a82a20');
  const g = p.g;
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * TAU, a1 = a0 + TAU / 32;
    g.fillStyle = i % 2 ? '#d8a840' : '#e8c060';
    g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 118, a0, a1); g.closePath(); g.fill();
  }
  g.fillStyle = '#6a1a14'; g.beginPath(); g.arc(128, 128, 30, 0, TAU); g.fill();
  g.strokeStyle = '#e8c060'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 122, 0, TAU); g.stroke();
  return p.texture({ wrap: false });
}

export function buildFerry(m: BridgeMats, lanterns: LanternField) {
  const g = new THREE.Group();
  g.position.set(FERRY.x, FERRY.deck, FERRY.z);
  const W = (x: number, y: number, z: number) => V(FERRY.x + x, FERRY.deck + y, FERRY.z + z);
  const L = FERRY.len / 2, B = FERRY.beam / 2;
  // the hull: the deck plan (rounded stern at -x, pointed bow at +x) extruded downwards, with a red gunwale
  const plan = new THREE.Shape();
  plan.moveTo(-L + 2, -B);
  plan.lineTo(L - 6, -B);
  plan.quadraticCurveTo(L - 1, -B * 0.7, L, 0);
  plan.quadraticCurveTo(L - 1, B * 0.7, L - 6, B);
  plan.lineTo(-L + 2, B);
  plan.quadraticCurveTo(-L, B, -L, 0);
  plan.quadraticCurveTo(-L, -B, -L + 2, -B);
  const hullGeo = new THREE.ExtrudeGeometry(plan, { depth: 3.4, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2).translate(0, -3.4, 0);
  g.add(new THREE.Mesh(hullGeo, new THREE.MeshLambertMaterial({ color: 0x223a30 })));
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(plan, { depth: 0.45, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2).translate(0, -0.35, 0), m.redPlain);
  rim.scale.set(1.015, 1, 1.03);
  g.add(rim);
  const deck = new THREE.Mesh(new THREE.ShapeGeometry(plan, 10).rotateX(-Math.PI / 2).translate(0, 0.01, 0), new THREE.MeshLambertMaterial({ map: deckPlanks(0x8a6a48) }));
  const duv = deck.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < duv.count; i++) duv.setXY(i, duv.getX(i) * 0.5, duv.getY(i) * 0.5);
  g.add(deck);
  // the paddle boxes, half drums on both sides with gold sunbursts
  const burst = new THREE.MeshLambertMaterial({ map: sunburst(), emissive: 0x1a0a04 });
  for (const s of [-1, 1]) {
    const pb = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 1.5, 24, 1, false, -Math.PI / 2, Math.PI), [m.redPlain, burst, burst]);
    pb.rotation.x = -Math.PI / 2;
    pb.position.set(0.5, -0.3, s * (B + 0.75));
    g.add(pb);
  }
  // the cabin: lit paper windows all round, a real doorway on the quay side, the upper deck on its roof
  const A = newAccs();
  const I = new THREE.Matrix4();
  A.wall.setMatrix(I); A.trim.setMatrix(I);
  const cells = townAtlas().cells, white = new THREE.Color(1, 1, 1);
  const x0 = -9, x1 = 7, zc = 2.9, y0 = 0, y1 = 2.9, bw = 2;
  for (let x = x0, i = 0; x < x1 - 0.01; x += bw, i++) {
    const door = Math.abs(x + bw / 2 - (FERRY_DOOR.door.x - FERRY.x)) < 0.1;
    A.wall.quad(V(x, y0, zc), V(x + bw, y0, zc), V(x + bw, y1, zc), V(x, y1, zc), cells[i % 2 ? CELL.shoji : CELL.shojiFigure], white);
    if (door) {
      // the doorway: a short dark passage with the top of a stair inside, which the spirits climb out of
      const dz = -zc + 2.4, inner = new THREE.Color(0x3a1c10);
      A.trim.box(x, x + bw, y1 - 0.4, y1, -zc - 0.05, -zc + 0.05, COLORS.red);
      A.trim.quad(V(x + bw, y0, dz), V(x, y0, dz), V(x, y1, dz), V(x + bw, y1, dz), [0, 0, 1, 0, 1, 1, 0, 1], inner);
      A.trim.box(x - 0.06, x + 0.06, y0, y1, -zc, dz, inner);
      A.trim.box(x + bw - 0.06, x + bw + 0.06, y0, y1, -zc, dz, inner);
      A.trim.box(x, x + bw, y1 - 0.1, y1, -zc, dz, inner);
      continue;
    }
    A.wall.quad(V(x + bw, y0, -zc), V(x, y0, -zc), V(x, y1, -zc), V(x + bw, y1, -zc), cells[CELL.shoji], white);
  }
  for (const [x, f] of [[x1, 1], [x0, -1]] as const) {
    if (f > 0) A.wall.quad(V(x, y0, zc), V(x, y0, -zc), V(x, y1, -zc), V(x, y1, zc), cells[CELL.lattice], white);
    else A.wall.quad(V(x, y0, -zc), V(x, y0, zc), V(x, y1, zc), V(x, y1, -zc), cells[CELL.lattice], white);
  }
  A.trim.box(x0 - 0.6, x1 + 0.6, y1, y1 + 0.3, -zc - 0.6, zc + 0.6, COLORS.wood);
  for (const z of [-zc - 0.5, zc + 0.5]) {
    A.trim.box(x0 - 0.5, x1 + 0.5, y1 + 1.0, y1 + 1.12, z - 0.06, z + 0.06, COLORS.red);
    for (let x = x0 - 0.5; x <= x1 + 0.5; x += 1) A.trim.box(x - 0.05, x + 0.05, y1 + 0.3, y1 + 1.0, z - 0.05, z + 0.05, COLORS.red);
  }
  // railings along the main deck
  for (const z of [-B + 0.2, B - 0.2]) {
    A.trim.box(-L + 2, L - 6, 1.2, 1.32, z - 0.06, z + 0.06, COLORS.red);
    for (let x = -L + 2; x <= L - 6; x += 1.3) A.trim.box(x - 0.05, x + 0.05, 0.3, 1.2, z - 0.05, z + 0.05, COLORS.darkWood);
  }
  // the pavilion on the upper deck, with a hip roof of green tiles
  addHouse(A, {
    x: -2, y: y1 + 0.3, z: 2.1, yaw: 0, w: 7, d: 4.2, floors: [2.4], cell: (_f, b) => (b % 2 ? CELL.lattice : CELL.redRail), roof: 'hip', rise: 1.6, overhang: 0.9,
    roofColor: COLORS.roofGreen, lanterns: { field: lanterns, every: 1.6, color: LANTERN.red, size: 0.7 },
  });
  // the gangplank down to the quay
  {
    const d = FERRY_DOOR, top = d.edge.clone().sub(g.position), foot = d.foot.clone().sub(g.position);
    const len = top.distanceTo(foot), mid = top.clone().add(foot).multiplyScalar(0.5);
    const plank = box(1.6, 0.14, len, m.dark, mid.x, mid.y, mid.z);
    plank.rotation.x = Math.atan2(top.y - foot.y, top.z - foot.z) * (top.z > foot.z ? -1 : 1);
    g.add(plank);
  }
  g.add(accMeshes(A, { cast: true }));
  // funnel, mast and flags
  g.add(cyl(0.75, 0.85, 6.4, m.dark, 3.4, y1 + 3.4, 0, 16), cyl(0.8, 0.8, 0.7, m.redPlain, 3.4, y1 + 5.6, 0, 16));
  g.add(cyl(0.08, 0.1, 7, m.dark, L - 4, 3.5, 0, 6));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshLambertMaterial({ color: 0xc83a2a, side: THREE.DoubleSide }));
  flag.position.set(L - 3.1, 6.4, 0);
  g.add(flag);
  // lanterns strung from the funnel to the bow and the stern
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    lanterns.add(W(3.4 + (L - 4 - 3.4) * t, y1 + 5.4 - Math.sin(t * Math.PI) * 1.4 - t * 0.8, 0), 0.6, i % 2 ? LANTERN.red : LANTERN.yellow);
    lanterns.add(W(3.4 + (-L + 1 - 3.4) * t, y1 + 5.4 - Math.sin(t * Math.PI) * 1.4 - t * 1.6, 0), 0.6, i % 2 ? LANTERN.yellow : LANTERN.red);
  }
  for (const s of [-1, 1]) for (let x = -L + 3; x < L - 6; x += 3.2) lanterns.add(W(x, 1.9, s * (B - 0.2)), 0.55, LANTERN.red);
  g.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.castShadow = true; });
  const smoke: PlumeSource = { p: W(3.4, y1 + 7, 0), n: 18, rise: 14, spread: 3, size: 3.2, speed: 1.2, alpha: 0.35, color: 0x5a5058 };
  return { group: g, smoke, lamps: [W(0, 4, -B), W(-6, 2, -B), W(6, 2, -B)] };
}
