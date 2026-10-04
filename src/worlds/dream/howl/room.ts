import * as THREE from 'three';
import { mergeStatic, mesh } from '../../../engine/Builders';
import { Painter, boxUV, charToon } from '../../../engine/Paint';
import { easeOutBack, easeInOut } from '../../../engine/Rig';
import { Rng, TAU, smoothstep } from '../../../engine/math';
import { CASTLE_ROOM } from '../layout';
import { lightShaft, optimize } from '../common';
import { deckPlanks } from '../../ghibli/propTextures';
import { woodGrain } from '../../ghibli/characterTextures';
import { breakfastPlate, brick, dialFace, doorBoards, fieldstone, meadowView, panelling, plaster } from './paint';

/*
 * The room inside Howl's castle, built in place (world coordinates) in the box CASTLE_ROOM: a cosy, cluttered
 * kitchen and living room. Dark beams, a plank floor and a rug, the stone hearth where Calcifer sits on his logs
 * (left wall), a breakfast table (right wall), shelves of bottles and jars, a staircase climbing to a hatch in
 * the ceiling, hanging herbs, garlic and a lamp, and windows that show the meadow as painted pictures (the real
 * outside is never seen: the room is closed on every side).
 *
 * The front doors (in from the tongue) open inwards as the Catbus runs up and close behind it. On the back wall
 * the colour dial turns from green to black, click by click, and the inner doors open outwards onto the next
 * scene. Everything stays inside the box except the inner doors' leaves while they stand open (see `INNER`).
 */

const R = CASTLE_ROOM;
const W = R.halfW, Y0 = R.floorY, Y1 = R.floorY + R.height, ZF = R.z0, ZB = R.z1;
/** inner faces of the front and back walls, and the doorways' half width and top */
const FI = -1762.2, BI = -1792, DW = 2.8, DT = Y0 + 6.4;

/** Where things happen, in the rider's z. */
export const ROOM_CUES = {
  /** front doors swing open as the Catbus runs up the tongue */
  frontOpen: [-1726, -1738] as const,
  /** and close behind it, once its tail is through */
  frontClose: [-1771, -1775] as const,
  /** the dial clicks round: green, red, blue, black */
  clicks: [-1767, -1771.5, -1776] as const,
  /** the inner doors swing open onto the next scene (the Catbus's nose is six units ahead of the rider) */
  innerOpen: [-1779.5, -1785.5] as const,
};
/** The inner doors: hinged at x ±2.8 on the back wall's outer face (z -1792.9); open, each leaf reaches z -1795.7. */
export const INNER = { hingeZ: -1792.88, reach: -1795.7 };

function bx(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, uv = 2) {
  return mesh(boxUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), uv), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A rug: deep red with a patterned border and a medallion; the texture covers the whole rug. */
function rugTexture() {
  const p = new Painter(256, 512, 1401).fill('#8a2a24');
  const g = p.g;
  g.strokeStyle = '#e8c070'; g.lineWidth = 10; g.strokeRect(14, 14, 228, 484);
  g.strokeStyle = '#2a3a5a'; g.lineWidth = 16; g.strokeRect(34, 34, 188, 444);
  g.fillStyle = '#e8c070';
  for (let y = 60; y < 460; y += 24) { g.beginPath(); g.moveTo(42, y); g.lineTo(50, y + 8); g.lineTo(42, y + 16); g.fill(); g.beginPath(); g.moveTo(214, y); g.lineTo(206, y + 8); g.lineTo(214, y + 16); g.fill(); }
  for (const [cy, r] of [[256, 70], [130, 34], [382, 34]] as const) {
    g.fillStyle = '#2a3a5a'; g.beginPath(); g.moveTo(128, cy - r); g.lineTo(128 + r * 0.8, cy); g.lineTo(128, cy + r); g.lineTo(128 - r * 0.8, cy); g.fill();
    g.fillStyle = '#e8c070'; g.beginPath(); g.arc(128, cy, r * 0.3, 0, TAU); g.fill();
  }
  p.dabs({ n: 40, colors: ['#000', '#fff'], r: [6, 20], alpha: [0.03, 0.07] });
  return p.texture({ wrap: false });
}

export interface CastleRoom {
  group: THREE.Group;
  /** where Calcifer sits on his logs, and which way he faces */
  calcifer: { pos: THREE.Vector3; yaw: number };
  /** a good spot for his light, in front of the hearth, and for a warm fill light over the far end */
  calciferLight: THREE.Vector3;
  fillLight: THREE.Vector3;
  /** doors and dial, keyed to the rider's z */
  update(dt: number, t: number, z: number): void;
}

export function buildCastleRoom(rng: Rng): CastleRoom {
  const group = new THREE.Group();
  const stat = new THREE.Group();
  group.add(stat);
  const warm = new THREE.Color(0x160a04);
  const floorTex = deckPlanks(0x8a6440);
  const floorM = charToon({ map: floorTex, emissive: warm, rim: 0 });
  const ceilM = charToon({ map: deckPlanks(0x6a4a30), emissive: warm, rim: 0 });
  const beamM = charToon({ map: woodGrain(0x5a3a24, 1403), emissive: warm, rim: 0.1 });
  const plasterM = charToon({ map: plaster(0xe4cca4, 1405), emissive: warm, rim: 0 });
  const panelM = charToon({ map: panelling(0x6a4a30, 1407), emissive: warm, rim: 0 });
  const stoneM = charToon({ map: fieldstone(0x9a8a78, 1409), emissive: warm, rim: 0.1 });
  const brickM = charToon({ map: brick(0x8a4a34, 1411), emissive: warm, rim: 0 });
  const soot = charToon({ color: 0x1c1410, rim: 0 });
  const darkWood = charToon({ color: 0x5a3a24, emissive: warm, rim: 0.15 });
  const midWood = charToon({ color: 0x8a5e3a, emissive: warm, rim: 0.15 });
  const ironM = charToon({ color: 0x2c2a2c, rim: 0.3 });
  const brass = charToon({ color: 0xd0a040, emissive: new THREE.Color(0x2a1a04), rim: 0.5 });
  const copper = charToon({ color: 0xc8703a, emissive: new THREE.Color(0x200c04), rim: 0.6 });
  const cream = charToon({ color: 0xf0e8d8, emissive: warm, rim: 0.2 });
  const doorM = charToon({ map: doorBoards(0x7a5234, 1413), emissive: warm, rim: 0.15 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc870).multiplyScalar(1.7) });
  // small props share one material and carry their colour in the geometry, so they all merge into one draw call
  const propM = charToon({ vertexColors: true, emissive: warm, rim: 0.3 });
  const prop = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return mesh(geo, propM, x, y, z);
  };

  // ---------- shell: floor, ceiling, side walls with a panelled dado ----------
  stat.add(bx(-W, W, Y0 - 0.5, Y0, ZB, ZF, floorM, 1.8));
  // the ceiling, with a hatch where the stairs come up (right side, near the back)
  stat.add(bx(-W, 3.9, Y1, Y1 + 0.6, ZB, ZF, ceilM, 1.8), bx(3.9, W, Y1, Y1 + 0.6, -1786.5, ZF, ceilM, 1.8), bx(3.9, W, Y1, Y1 + 0.6, ZB, -1790.8, ceilM, 1.8));
  stat.add(bx(3.9, W, Y1 + 0.55, Y1 + 0.6, -1790.8, -1786.5, soot));
  for (const s of [-1, 1]) {
    stat.add(bx(s < 0 ? -W - 0.6 : W, s < 0 ? -W : W + 0.6, Y0, Y1, ZB, ZF, plasterM, 4));
    stat.add(bx(s < 0 ? -W : W - 0.1, s < 0 ? -W + 0.1 : W, Y0, Y0 + 1.7, ZB, ZF, panelM, 2));
    stat.add(bx(s < 0 ? -W : W - 0.18, s < 0 ? -W + 0.18 : W, Y0 + 1.7, Y0 + 1.85, ZB, ZF, darkWood, 2));
  }
  // timber posts along the walls, cross beams, and two long beams under them
  for (const z of [-1763, -1770.5, -1778, -1785.5, -1791.6]) for (const s of [-1, 1]) {
    stat.add(bx(s < 0 ? -W : W - 0.45, s < 0 ? -W + 0.45 : W, Y0, Y1, z - 0.25, z + 0.25, beamM, 2));
    // knee braces up to the beam
    const br = bx(-0.15, 0.15, -0.9, 0.9, -0.15, 0.15, beamM);
    br.position.set(s * (W - 0.9), Y1 - 1.0, z); br.rotation.z = s * 0.8; stat.add(br);
  }
  for (let z = -1763; z > ZB + 1; z -= 3.75) {
    // the beam over the stair hatch stops short of it
    const x1 = z < -1786 && z > -1791 ? 3.9 : W;
    stat.add(bx(-W, x1, Y1 - 0.55, Y1, z - 0.28, z + 0.28, beamM, 2));
  }
  for (const s of [-1, 1]) stat.add(bx(s * 3.2 - 0.25, s * 3.2 + 0.25, Y1 - 0.95, Y1 - 0.55, ZB, ZF, beamM, 2));
  // the rug down the middle
  stat.add(mesh(new THREE.PlaneGeometry(3.4, 20).rotateX(-Math.PI / 2), charToon({ map: rugTexture(), emissive: warm, rim: 0 }), 0, Y0 + 0.02, -1775.5));

  // ---------- front wall, with a doorway and two leaves that open inwards ----------
  const frontWall = (z0: number, z1: number, mat: THREE.Material) => [
    bx(-W - 0.6, -DW, Y0, Y1 + 0.6, z0, z1, mat, 4), bx(DW, W + 0.6, Y0, Y1 + 0.6, z0, z1, mat, 4), bx(-DW, DW, DT, Y1 + 0.6, z0, z1, mat, 4),
  ];
  stat.add(...frontWall(FI, ZF, plasterM));
  // door frame on the room side and the threshold
  stat.add(bx(-DW - 0.35, -DW, Y0, DT + 0.35, FI - 0.18, FI + 0.02, beamM), bx(DW, DW + 0.35, Y0, DT + 0.35, FI - 0.18, FI + 0.02, beamM), bx(-DW - 0.35, DW + 0.35, DT, DT + 0.35, FI - 0.18, FI + 0.02, beamM));
  // the threshold runs out through the castle's face plate to meet the tongue
  stat.add(bx(-DW, DW, Y0 - 0.3, Y0 - 0.06, FI, ZF + 0.7, darkWood));
  // a door leaf: boards with iron straps and a ring handle, hinged on one edge (its local x runs from the hinge)
  const leaf = (dir: number) => {
    const g = new THREE.Group();
    const w = DW, h = DT - Y0;
    const board = mesh(new THREE.BoxGeometry(w, h, 0.22), doorM, dir * w / 2, h / 2, 0);
    g.add(board);
    for (const y of [0.8, h / 2, h - 0.8]) g.add(mesh(new THREE.BoxGeometry(w * 0.85, 0.16, 0.28), ironM, dir * w * 0.45, y, 0));
    for (const y of [0.8, h - 0.8]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), ironM, 0, y, 0));
    for (const zs of [-1, 1]) { const ring = mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 14), brass, dir * (w - 0.45), h * 0.47, zs * 0.17); g.add(ring); }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeStatic(g);
    return g;
  };
  const front: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * DW, Y0, FI - 0.12);
    piv.add(leaf(-s)); group.add(piv); front.push(piv);
  }

  // ---------- back wall, the inner doors and the colour dial ----------
  stat.add(...frontWall(ZB + 0.15, BI - 0.15, plasterM));
  for (const zf of [BI, ZB + 0.15]) {
    const z0 = zf === BI ? BI - 0.15 : ZB, z1 = zf === BI ? BI + 0.02 : ZB + 0.15;
    stat.add(bx(-DW - 0.4, -DW, Y0, DT + 0.4, z0, z1, beamM), bx(DW, DW + 0.4, Y0, DT + 0.4, z0, z1, beamM), bx(-DW - 0.4, DW + 0.4, DT, DT + 0.4, z0, z1, beamM));
  }
  // a carved lintel board over the inner door
  stat.add(bx(-DW - 0.6, DW + 0.6, DT + 0.4, DT + 0.75, BI - 0.1, BI + 0.08, midWood));
  stat.add(bx(-DW, DW, Y0 - 0.1, Y0 + 0.04, ZB, BI, darkWood));
  const inner: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * DW, Y0, INNER.hingeZ);
    piv.add(leaf(-s)); group.add(piv); inner.push(piv);
  }
  // the dial: a plaque, the coloured wheel that turns, and a fixed brass pointer above it
  const dialX = 4.15, dialY = 10.3, dialZ = BI + 0.12;
  stat.add(bx(dialX - 1.05, dialX + 1.05, dialY - 1.15, dialY + 1.4, BI - 0.02, BI + 0.08, midWood));
  const wheel = mesh(new THREE.CircleGeometry(0.88, 40), charToon({ map: dialFace(), emissive: new THREE.Color(0x1a1408), rim: 0, alphaTest: 0.5 }), dialX, dialY, dialZ + 0.02);
  group.add(wheel);
  { const ptr = new THREE.Shape(); ptr.moveTo(-0.16, 0.0); ptr.lineTo(0.16, 0.0); ptr.lineTo(0, -0.34); ptr.closePath(); const m = mesh(new THREE.ShapeGeometry(ptr), brass, dialX, dialY + 1.08, dialZ + 0.05); stat.add(m); }
  stat.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10).rotateX(Math.PI / 2), brass, dialX, dialY, dialZ + 0.06));

  // ---------- the hearth on the left wall, with Calcifer's logs ----------
  const HZ = -1773.5;
  stat.add(bx(-W, -3.7, Y0, Y0 + 0.45, HZ - 3.0, HZ + 3.0, stoneM, 3));
  stat.add(bx(-W, -3.9, Y0 + 0.45, Y0 + 3.6, HZ - 3.0, HZ - 1.8, stoneM, 3), bx(-W, -3.9, Y0 + 0.45, Y0 + 3.6, HZ + 1.8, HZ + 3.0, stoneM, 3));
  stat.add(bx(-W, -3.9, Y0 + 3.4, Y0 + 4.0, HZ - 3.0, HZ + 3.0, stoneM, 3));
  stat.add(bx(-W, -5.3, Y0 + 0.45, Y0 + 3.4, HZ - 1.8, HZ + 1.8, soot));
  stat.add(bx(-W, -3.55, Y0 + 4.0, Y0 + 4.25, HZ - 3.3, HZ + 3.3, darkWood));
  stat.add(bx(-W, -4.2, Y0 + 4.25, Y1, HZ - 2.4, HZ + 2.4, brickM, 2));
  // on the mantel: jars, a clock, a candle
  for (let i = 0; i < 6; i++) {
    const z = HZ - 2.6 + i * 1.05;
    if (i === 3) { stat.add(bx(-4.9, -4.2, Y0 + 4.25, Y0 + 5.1, z - 0.35, z + 0.35, midWood)); stat.add(mesh(new THREE.CircleGeometry(0.25, 16).rotateY(Math.PI / 2), cream, -4.19, Y0 + 4.75, z)); continue; }
    stat.add(prop(new THREE.CylinderGeometry(0.18, 0.2, 0.5 + (i % 2) * 0.2, 10), [0x4a7a5a, 0xc8a050, 0x8a3a3a, 0x3a5a8a, 0xd8c8a8, 0x6a8a4a][i], -4.4, Y0 + 4.55 + (i % 2) * 0.1, z));
  }
  // a frying pan and a ladle hung beside the fire, a kettle on the hearth, a bucket of firewood
  { const pan = new THREE.Group(); pan.add(mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.12, 18), ironM, 0, 0, 0), mesh(new THREE.BoxGeometry(0.12, 0.06, 1.0), ironM, 0, 0, 0.75)); pan.position.set(-3.82, Y0 + 2.4, HZ + 2.6); pan.rotation.set(Math.PI / 2 - 0.1, 0, 0); pan.rotation.z = Math.PI / 2; stat.add(pan); }
  stat.add(mesh(new THREE.SphereGeometry(0.42, 14, 10), copper, -4.0, Y0 + 0.82, HZ - 2.4), mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8).rotateZ(1.0), copper, -3.65, Y0 + 0.95, HZ - 2.4));
  stat.add(mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.8, 12), midWood, -4.4, Y0 + 0.4, HZ + 3.7));
  for (let i = 0; i < 5; i++) { const lg = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), darkWood, -4.4 + Math.sin(i) * 0.2, Y0 + 0.95, HZ + 3.7 + Math.cos(i * 2) * 0.2); lg.rotation.z = 0.25 * Math.sin(i * 3); stat.add(lg); }

  // ---------- the breakfast table on the right, under a window ----------
  const TZ = -1767.3;
  stat.add(bx(3.55, W - 0.05, Y0 + 1.25, Y0 + 1.42, TZ - 2.8, TZ + 2.8, midWood));
  for (const [x, z] of [[3.75, TZ - 2.5], [3.75, TZ + 2.5], [5.2, TZ - 2.5], [5.2, TZ + 2.5]]) stat.add(bx(x - 0.1, x + 0.1, Y0, Y0 + 1.25, z - 0.1, z + 0.1, darkWood));
  const plateM = charToon({ map: breakfastPlate(), emissive: warm, rim: 0 });
  for (const z of [TZ - 1.4, TZ + 1.2]) {
    stat.add(mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.06, 20), plateM, 4.45, Y0 + 1.46, z));
    stat.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.24, 12), cream, 4.05, Y0 + 1.55, z + 0.55));
  }
  stat.add(prop(new THREE.SphereGeometry(0.34, 14, 10), 0x3a6a9a, 4.9, Y0 + 1.72, TZ));
  stat.add(prop(new THREE.CylinderGeometry(0.04, 0.07, 0.45, 6).rotateZ(-0.9), 0x3a6a9a, 4.55, Y0 + 1.82, TZ));
  { const loaf = prop(new THREE.SphereGeometry(1, 14, 10), 0xc8904a, 4.9, Y0 + 1.6, TZ + 2.1); loaf.scale.set(0.3, 0.2, 0.5); stat.add(loaf); }
  stat.add(prop(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 10), 0xa82a3a, 5.0, Y0 + 1.56, TZ - 2.2));
  for (const z of [TZ - 3.4, TZ + 3.4]) { stat.add(bx(4.1, 5.1, Y0 + 0.85, Y0 + 0.97, z - 0.45, z + 0.45, midWood)); for (const [dx, dz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) stat.add(bx(4.6 + dx - 0.06, 4.6 + dx + 0.06, Y0, Y0 + 0.85, z + dz - 0.06, z + dz + 0.06, darkWood)); }

  // ---------- windows: painted pictures of the meadow in wooden frames, with curtains and sunbeams ----------
  const windows: Array<[number, number, number]> = [[-1, -1766.2, 0], [1, TZ, 1], [-1, -1789.2, 2]];
  const curtainM = charToon({ color: 0xb8503a, emissive: warm, rim: 0.2, side: THREE.DoubleSide });
  for (const [s, zc, v] of windows) {
    const wx = s * (W - 0.02), y0 = Y0 + 2.6, y1 = Y0 + 5.6, hw = 1.7;
    const pic = mesh(new THREE.PlaneGeometry(hw * 2, y1 - y0), new THREE.MeshBasicMaterial({ map: meadowView(v), color: new THREE.Color(1.18, 1.14, 1.08) }), wx, (y0 + y1) / 2, zc);
    pic.rotation.y = -s * Math.PI / 2;
    stat.add(pic);
    const fx = s * (W - 0.12);
    stat.add(bx(fx - 0.12, fx + 0.12, y0 - 0.2, y0, zc - hw - 0.2, zc + hw + 0.2, darkWood), bx(fx - 0.12, fx + 0.12, y1, y1 + 0.2, zc - hw - 0.2, zc + hw + 0.2, darkWood));
    stat.add(bx(fx - 0.12, fx + 0.12, y0, y1, zc - hw - 0.2, zc - hw, darkWood), bx(fx - 0.12, fx + 0.12, y0, y1, zc + hw, zc + hw + 0.2, darkWood));
    stat.add(bx(fx - 0.06, fx + 0.06, y0, y1, zc - 0.05, zc + 0.05, darkWood), bx(fx - 0.06, fx + 0.06, (y0 + y1) / 2 - 0.05, (y0 + y1) / 2 + 0.05, zc - hw, zc + hw, darkWood));
    stat.add(bx(s * (W - 0.45) - 0.25, s * (W - 0.45) + 0.25, y0 - 0.32, y0 - 0.2, zc - hw - 0.3, zc + hw + 0.3, midWood));
    for (const e of [-1, 1]) { const c = mesh(new THREE.PlaneGeometry(0.7, y1 - y0 + 0.5), curtainM, s * (W - 0.3), (y0 + y1) / 2 + 0.1, zc + e * (hw + 0.25)); c.rotation.y = -s * Math.PI / 2 + e * 0.15; stat.add(c); }
    // a pot of flowers on the sill
    stat.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), copper, s * (W - 0.45), y0 - 0.05, zc + 0.9));
    for (let k = 0; k < 5; k++) stat.add(prop(new THREE.SphereGeometry(0.1, 6, 5), [0xf2a0c0, 0xf7d43a, 0x8fb4f0][k % 3], s * (W - 0.45) + rng.range(-0.12, 0.12), y0 + 0.2 + rng.range(0, 0.15), zc + 0.9 + rng.range(-0.15, 0.15)));
    // a beam of evening sun falling into the room
    const from = new THREE.Vector3(s * (W - 0.4), y1 - 0.3, zc), to = new THREE.Vector3(s * (W - 4.2), Y0 + 0.05, zc - 1.2);
    group.add(lightShaft(from, to, 3.0, 0xffd8a0, 0.16));
  }

  // ---------- shelves of bottles and jars, a cupboard, a coat rack, a broom ----------
  const shelfZ0 = -1778.6, shelfZ1 = -1786.4;
  const bottles: Array<{ x: number; y: number; z: number; r: number; h: number; c: number }> = [];
  for (const y of [Y0 + 1.95, Y0 + 3.35, Y0 + 4.75]) {
    stat.add(bx(-W, -4.55, y - 0.08, y, shelfZ0 - 3.9, shelfZ0 + 0.1, darkWood));
    for (let z = shelfZ0 - 0.25; z > shelfZ1 + 0.3; z -= rng.range(0.35, 0.6)) {
      const h = rng.range(0.35, 0.85), r = rng.range(0.12, 0.22);
      bottles.push({ x: -5.0 + rng.range(-0.1, 0.1), y: y + h / 2, z, r, h, c: rng.pick([0x4a8a5a, 0x8a5a2a, 0x3a5a8a, 0xb88a3a, 0x8a3a4a, 0xd8d0b8, 0x5a7a3a]) });
    }
  }
  for (const s of [shelfZ0 + 0.1, shelfZ1]) stat.add(bx(-W, -4.5, Y0, Y0 + 5.0, s - 0.08, s + 0.08, darkWood));
  {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10);
    const im = new THREE.InstancedMesh(geo, charToon({ rim: 0.5, emissive: new THREE.Color(0x0a0604) }), bottles.length);
    const corkGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const cork = new THREE.InstancedMesh(corkGeo, midWood, bottles.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    bottles.forEach((b, i) => {
      m.makeScale(b.r, b.h, b.r).setPosition(b.x, b.y, b.z); im.setMatrixAt(i, m); im.setColorAt(i, c.set(b.c));
      m.makeScale(b.r * 0.9, 0.12, b.r * 0.9).setPosition(b.x, b.y + b.h / 2 + 0.06, b.z); cork.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor!.needsUpdate = true; cork.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere(); cork.computeBoundingSphere();
    group.add(im, cork);
  }
  // books in a pile on the floor by the shelves
  for (let i = 0; i < 7; i++) stat.add(prop(new THREE.BoxGeometry(0.9, 0.18, 0.65), [0x7a2a2a, 0x2a4a6a, 0x4a6a3a, 0x8a6a3a][i % 4], -4.3 + rng.range(-0.08, 0.08), Y0 + 0.09 + i * 0.18, -1787.3 + rng.range(-0.1, 0.1)).rotateY(rng.range(-0.4, 0.4)));
  // a cupboard on the right before the stairs
  stat.add(bx(4.2, W, Y0, Y0 + 4.2, -1775.8, -1771.3, midWood, 2));
  stat.add(bx(4.12, 4.2, Y0 + 0.3, Y0 + 3.9, -1775.5, -1773.6, darkWood), bx(4.12, 4.2, Y0 + 0.3, Y0 + 3.9, -1773.5, -1771.6, darkWood));
  for (let i = 0; i < 4; i++) stat.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16).rotateZ(Math.PI / 2), cream, 4.4, Y0 + 4.55, -1775.2 + i * 1.1));
  // a coat rack by the inner door with Howl's jacket and a hat, and a broom
  stat.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), darkWood, -4.4, Y0 + 2.6, -1790.6));
  { const jacket = mesh(new THREE.CylinderGeometry(0.35, 0.65, 2.4, 12, 1, true), charToon({ color: 0xd88aa0, rim: 0.3, side: THREE.DoubleSide, emissive: warm }), -4.4, Y0 + 3.6, -1790.35); stat.add(jacket); }
  stat.add(prop(new THREE.CylinderGeometry(0.3, 0.32, 0.3, 12), 0x2a2a3a, -4.4, Y0 + 5.25, -1790.6));
  { const broom = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), midWood, 3.35, Y0 + 2.0, -1791.4); broom.rotation.z = -0.18; stat.add(broom); const bristle = prop(new THREE.ConeGeometry(0.4, 1.1, 10), 0xd8b45e, 3.0, Y0 + 0.5, -1791.4); stat.add(bristle); }

  // ---------- the staircase up the right wall to a hatch in the ceiling ----------
  const steps = 10, zs0 = -1777.0, run = 1.2, rise = (Y1 - 0.6 - Y0) / steps;
  for (let i = 0; i < steps; i++) {
    const zt = zs0 - i * run, yt = Y0 + (i + 1) * rise;
    stat.add(bx(3.9, W, yt - 0.14, yt, zt - run - 0.05, zt, midWood));
    stat.add(bx(3.95, W, yt - rise, yt - 0.14, zt - 0.08, zt, darkWood));
  }
  {
    // the side board (stringer) under the steps, and a rail on posts
    const a = new THREE.Vector3(3.92, Y0, zs0), b = new THREE.Vector3(3.92, Y1 - 0.6, zs0 - steps * run);
    const len = a.distanceTo(b), ang = Math.atan2(b.y - a.y, a.z - b.z);
    const str = bx(-0.08, 0.08, -0.4, 0.4, -len / 2, len / 2, darkWood); str.position.copy(a).lerp(b, 0.5); str.rotation.x = ang; stat.add(str);
    for (let i = 0; i < 8; i += 1) { const z = zs0 - i * run - 0.6, y = Y0 + (i + 1) * rise; stat.add(bx(3.88, 4.0, y, y + 1.45, z - 0.05, z + 0.05, darkWood)); }
    const ra = new THREE.Vector3(3.94, Y0 + rise + 1.45, zs0 - 0.6), rb = new THREE.Vector3(3.94, Y0 + 8 * rise + 1.45, zs0 - 7 * run - 0.6);
    const rl = ra.distanceTo(rb), rang = Math.atan2(rb.y - ra.y, ra.z - rb.z);
    const rail = bx(-0.07, 0.07, -0.07, 0.07, -rl / 2, rl / 2, midWood); rail.position.copy(ra).lerp(rb, 0.5); rail.rotation.x = rang; stat.add(rail);
  }
  // the hatch: a warm glow round the edge of a trapdoor propped half open
  stat.add(bx(3.95, W - 0.05, Y1 + 0.5, Y1 + 0.55, -1790.7, -1786.6, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb860).multiplyScalar(1.3) })));
  { const trap = bx(-0.8, 0.8, -0.06, 0.06, -2.1, 0, doorM); trap.position.set(4.7, Y1, -1786.6); trap.rotation.x = -0.55; stat.add(trap); }
  // baskets and a barrel under the stairs
  stat.add(mesh(new THREE.CylinderGeometry(0.55, 0.5, 1.2, 12), midWood, 4.75, Y0 + 0.6, -1781.2));
  stat.add(prop(new THREE.CylinderGeometry(0.5, 0.4, 0.6, 12), 0xc8a060, 4.7, Y0 + 0.3, -1779.3));

  // ---------- hanging herbs, garlic, onions, copper pots and a lamp ----------
  const herbC = [0x6a8a3a, 0x8a6a9a, 0x9a8a4a, 0x4a7a4a];
  for (const s of [-1, 1]) for (let z = -1764.5; z > -1791; z -= rng.range(1.2, 2.0)) {
    if (s > 0 && z < -1785.5) continue;
    const kind = rng.int(0, 5);
    const x = s * 3.2 + rng.range(-0.15, 0.15), top = Y1 - 0.95;
    if (kind <= 2) {
      // a bunch of herbs hung upside down
      stat.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 3), darkWood, x, top - 0.2, z));
      const h = prop(new THREE.ConeGeometry(0.22, 0.75, 7), herbC[kind], x, top - 0.75, z); h.rotation.x = Math.PI; stat.add(h);
    } else if (kind === 3) {
      // a string of garlic
      for (let k = 0; k < 5; k++) stat.add(mesh(new THREE.SphereGeometry(0.12, 7, 5), cream, x + (k % 2) * 0.08, top - 0.25 - k * 0.2, z));
    } else if (kind === 4) {
      stat.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.3, 12), copper, x, top - 0.45, z), mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 3), darkWood, x, top - 0.15, z));
    } else {
      for (let k = 0; k < 3; k++) stat.add(prop(new THREE.SphereGeometry(0.14, 8, 6), 0xc8803a, x, top - 0.3 - k * 0.24, z + (k % 2) * 0.06));
    }
  }
  // the lamp over the middle of the room
  const LZ = -1781;
  stat.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), ironM, 0, Y1 - 0.7, LZ));
  stat.add(mesh(new THREE.CylinderGeometry(0.15, 0.4, 0.25, 10), ironM, 0, Y1 - 0.95, LZ), mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.42, 10), lampGlow, 0, Y1 - 1.28, LZ), mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), ironM, 0, Y1 - 1.53, LZ));
  // a clock on the wall by the front door
  stat.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20).rotateZ(Math.PI / 2), midWood, -W + 0.12, Y0 + 4.6, -1763.6), mesh(new THREE.CircleGeometry(0.4, 20).rotateY(Math.PI / 2), cream, -W + 0.19, Y0 + 4.6, -1763.6));

  // walls, ceiling and floor block the low sun outside (the room must stay dark but for its own lights)
  stat.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.receiveShadow = true; m.castShadow = false; } });
  stat.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material === plasterM || m.material === ceilM || m.material === floorM)) m.castShadow = true; });
  optimize(stat);

  return {
    group,
    calcifer: { pos: new THREE.Vector3(-4.45, Y0 + 0.9, HZ), yaw: Math.PI / 2 },
    calciferLight: new THREE.Vector3(-3.4, Y0 + 2.0, HZ),
    fillLight: new THREE.Vector3(0.5, Y1 - 1.9, LZ),
    update(_dt, _t, z) {
      // front doors: open as the Catbus runs up the tongue, shut behind it
      const fo = smoothstep(ROOM_CUES.frontOpen[0], ROOM_CUES.frontOpen[1], z) * (1 - smoothstep(ROOM_CUES.frontClose[0], ROOM_CUES.frontClose[1], z));
      const fa = easeInOut(fo) * Math.PI * 0.5;
      front[0].rotation.y = fa; front[1].rotation.y = -fa;
      // the dial: one quarter turn per click, each with a little overshoot, green → red → blue → black at the top
      let turns = 0;
      for (const c of ROOM_CUES.clicks) turns += easeOutBack(smoothstep(c + 0.2, c - 1.0, z), 2.4);
      wheel.rotation.z = turns * Math.PI / 2;
      // the inner doors swing out onto the next scene once the dial shows black
      const io = smoothstep(ROOM_CUES.innerOpen[0], ROOM_CUES.innerOpen[1], z);
      const ia = easeOutBack(io, 0.8) * Math.PI * 0.5;
      inner[0].rotation.y = ia; inner[1].rotation.y = -ia;
    },
  };
}
