import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, sphere, cone } from '../../../engine/Builders';
import { boxUV, repeatUV } from '../../../engine/Paint';
import { smoothstep } from '../../../engine/math';
import { hipGableRoof } from '../../ghibli/farmhouse';
import { roofTileTexture } from '../../ghibli/korikoAtlas';
import { deckPlanks, granite, vermilion } from '../../ghibli/propTextures';
import { BRIDGE, DECK, GATE, WATER } from './plan';
import { CELL, signTexture, townAtlas } from './textures';
import { accMeshes, COLORS, newAccs } from './town';
import { LANTERN, waveLit, type LanternField } from './wave';

/*
 * The long red bridge over the ravine to the bathhouse, and the gate house at its near end. The gate house
 * is built round the room inside Howl's castle (CASTLE_ROOM in ../layout.ts): its doorway at z -1795 faces
 * the bridge, so when you look back you see the gate with its door open and the castle's room inside.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Shared materials for lacquered timber, gold fittings and stone. */
export function bridgeMaterials() {
  const red = new THREE.MeshLambertMaterial({ map: vermilion(), color: 0xe0b0a8 });
  return {
    red,
    redPlain: new THREE.MeshLambertMaterial({ color: 0xb03424 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x2a1a14 }),
    gold: new THREE.MeshLambertMaterial({ color: 0xd8b050, emissive: 0x3a2a08 }),
    stone: new THREE.MeshLambertMaterial({ map: granite(0x8a8478, 331) }),
    deck: new THREE.MeshLambertMaterial({ map: deckPlanks(0x8a6040) }),
    tiles: new THREE.MeshLambertMaterial({ map: roofTileTexture(29), color: 0x6a9a82, side: THREE.DoubleSide }),
  };
}
export type BridgeMats = ReturnType<typeof bridgeMaterials>;

/** A railing post's onion-shaped gold cap (giboshi). */
export function giboshi(m: BridgeMats, x: number, y: number, z: number, s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.13 * s, 0.13 * s, 0.1 * s, m.gold, 0, 0.05 * s, 0, 10));
  const bulb = sphere(0.15 * s, m.gold, 0, 0.22 * s, 0, 10, 8); bulb.scale.y = 1.1; g.add(bulb);
  g.add(cone(0.08 * s, 0.22 * s, m.gold, 0, 0.44 * s, 0, 8));
  g.position.set(x, y, z);
  return g;
}

export function buildBridge(m: BridgeMats, lanterns: LanternField) {
  const g = new THREE.Group();
  const { z0, z1, half } = BRIDGE;
  const len = z0 - z1, zc = (z0 + z1) / 2;
  // the deck: planks on top, red lacquered edges
  const top = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(half * 2, len).rotateX(-Math.PI / 2), half * 2, len / 2), m.deck);
  top.position.set(0, DECK, zc);
  top.receiveShadow = true;
  g.add(top);
  for (const s of [-1, 1]) g.add(box(0.3, 0.7, len, m.red, s * (half - 0.15), DECK - 0.36, zc));
  // girders and cross beams under the deck
  for (const s of [-1, 1]) g.add(box(0.7, 1.1, len, m.redPlain, s * 3.8, DECK - 1.15, zc));
  for (let z = z0 - 1.5; z > z1; z -= 3) g.add(box(half * 2 - 0.4, 0.4, 0.4, m.dark, 0, DECK - 0.62, z));
  // railings: posts, three rails, gold caps on every third post
  let i = 0;
  for (let z = z0 - 0.4; z > z1 + 0.2; z -= 2.9, i++) for (const s of [-1, 1]) {
    const x = s * (half - 0.2);
    g.add(box(0.2, 1.25, 0.2, m.red, x, DECK + 0.62, z));
    if (i % 3 === 0) g.add(giboshi(m, x, DECK + 1.25, z));
  }
  for (const s of [-1, 1]) {
    const x = s * (half - 0.2);
    g.add(box(0.16, 0.14, len, m.red, x, DECK + 1.12, zc));
    g.add(box(0.1, 0.1, len, m.red, x, DECK + 0.62, zc));
    g.add(box(0.12, 0.12, len, m.red, x, DECK + 0.16, zc));
  }
  // lamp posts: a tall post with a bracket holding a lantern over the deck
  for (let z = z0 - 5; z > z1 + 2; z -= 8.7) for (const s of [-1, 1]) {
    const x = s * (half - 0.2);
    g.add(box(0.26, 3.9, 0.26, m.red, x, DECK + 1.95, z));
    g.add(box(1.1, 0.14, 0.18, m.dark, x - s * 0.45, DECK + 3.85, z));
    g.add(giboshi(m, x, DECK + 3.9, z, 1.2));
    lanterns.add(V(x - s * 0.85, DECK + 3.2, z), 0.95, LANTERN.red, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // piers: stone columns from the water to just under the deck, with red timber brackets on top
  for (const pz of [-1810, -1836, -1862]) {
    for (const s of [-1, 1]) {
      const h = DECK - 1.7 - (WATER - 3);
      const col = new THREE.Mesh(boxUV(new THREE.BoxGeometry(2.4, h, 3, 1, 1, 1), 3), m.stone);
      col.position.set(s * 3.6, WATER - 3 + h / 2, pz);
      g.add(col);
      g.add(box(3.2, 0.8, 3.8, m.stone, s * 3.6, WATER + 0.4, pz));
      g.add(box(2.8, 0.6, 3.4, m.redPlain, s * 3.6, DECK - 1.95, pz));
    }
    // cross bracing between the two columns
    for (let y = WATER + 6; y < DECK - 4; y += 9) g.add(box(6, 0.7, 0.8, m.redPlain, 0, y, pz));
    const brace = (y0: number, y1: number, dir: number) => {
      const dy = y1 - y0, l = Math.hypot(4.8, dy);
      const b = box(0.4, l, 0.4, m.dark, 0, (y0 + y1) / 2, pz);
      b.rotation.z = dir * Math.atan2(4.8, dy);
      g.add(b);
    };
    for (let y = WATER + 6; y < DECK - 12; y += 9) { brace(y, y + 9, 1); brace(y, y + 9, -1); }
  }
  g.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; } });
  return g;
}

/** A cusped (karahafu) gable roof over a doorway: a wave-shaped curve across x, extruded along z. */
export function karahafu(w: number, depth: number, rise: number) {
  const n = 28, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const prof = (t: number) => {
    // t from -1 to 1 across the gable: a rounded crown that flows out into upturned ends
    const a = Math.abs(t);
    return rise * (Math.cos(a * Math.PI * 0.5) ** 1.6) + 0.35 * smoothstep(0.75, 1, a);
  };
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n, x = t * w / 2, y = prof(t);
    pos.push(x, y, 0, x, y, -depth);
    uv.push(i / n * w * 0.45, 0, i / n * w * 0.45, depth * 0.45);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, prof };
}

/**
 * The gate house of the bathhouse town, round the castle room. It is built in its own frame, front at
 * z = 0 facing +z and the building running back into -z, then turned round to face the bridge.
 */
export function buildGateHouse(m: BridgeMats, lanterns: LanternField) {
  const g = new THREE.Group();
  g.position.set(0, 0, GATE.z1);
  g.rotation.y = Math.PI;
  /** a point in the gate's own frame, in world space (for the lanterns, which are placed in world space) */
  const W = (x: number, y: number, z: number) => V(-x, y, GATE.z1 - z);
  const cells = townAtlas().cells;
  const A = newAccs();
  const I = new THREE.Matrix4();
  A.wall.setMatrix(I); A.trim.setMatrix(I);
  const hw = (GATE.x1 - GATE.x0) / 2, D = GATE.z0 - GATE.z1;
  const { doorHalf, doorTop } = GATE;
  const y0 = DECK, yMid = DECK + 8.4, yTop = DECK + 14.2;
  const white = new THREE.Color(1, 1, 1);
  /** depth of the doorway, back to the end of the castle room */
  const dd = 1.95;
  // front: lit lattice windows either side of the doorway on the ground storey, paper screens above
  for (const [a, b] of [[-hw, -doorHalf - 0.4], [doorHalf + 0.4, hw]]) {
    const n = 2, bw = (b - a) / n;
    for (let k = 0; k < n; k++) for (let f = 0; f < 2; f++) {
      const ya = y0 + f * 4.2, yb = ya + 4.2;
      A.wall.quad(V(a + k * bw, ya, 0), V(a + (k + 1) * bw, ya, 0), V(a + (k + 1) * bw, yb, 0), V(a + k * bw, yb, 0), cells[f === 0 ? CELL.lattice : CELL.shoji], white);
    }
  }
  // above the door, up to the floor line: dark boards behind the sign
  A.wall.quad(V(-doorHalf - 0.4, doorTop, 0), V(doorHalf + 0.4, doorTop, 0), V(doorHalf + 0.4, yMid, 0), V(-doorHalf - 0.4, yMid, 0), cells[CELL.boards], white);
  // upper storey across the whole front
  {
    const n = 5, bw = (hw * 2) / n;
    for (let k = 0; k < n; k++) A.wall.quad(V(-hw + k * bw, yMid, 0), V(-hw + (k + 1) * bw, yMid, 0), V(-hw + (k + 1) * bw, yTop, 0), V(-hw + k * bw, yTop, 0), cells[k % 2 ? CELL.redRail : CELL.shojiFigure], white);
  }
  // the two sides, seen at an angle from the bridge
  {
    const n = 8, bd = D / n, fh = (yTop - y0) / 3;
    for (let k = 0; k < n; k++) for (let f = 0; f < 3; f++) {
      const ya = y0 + f * fh, yb = ya + fh;
      const cell = cells[f === 0 ? CELL.plaster : (k + f) % 3 ? CELL.shoji : CELL.shojiDim];
      A.wall.quad(V(hw, ya, -k * bd), V(hw, ya, -(k + 1) * bd), V(hw, yb, -(k + 1) * bd), V(hw, yb, -k * bd), cell, white);
      A.wall.quad(V(-hw, ya, -D + k * bd), V(-hw, ya, -D + (k + 1) * bd), V(-hw, yb, -D + (k + 1) * bd), V(-hw, yb, -D + k * bd), cell, white);
    }
  }
  // posts, the doorway's frame and its inside faces, the floor-line beam, a balcony, the footing
  const DK = COLORS.darkWood, R = COLORS.red, Q: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1];
  for (const x of [-hw, -doorHalf - 0.4, doorHalf + 0.4, hw]) A.trim.box(x - 0.35, x + 0.35, y0, yTop, -0.35, 0.35, R);
  A.trim.box(-doorHalf - 0.75, doorHalf + 0.75, doorTop - 0.1, doorTop + 0.7, -0.3, 0.4, R);
  A.trim.quad(V(doorHalf, y0, -dd), V(doorHalf, y0, 0), V(doorHalf, doorTop, 0), V(doorHalf, doorTop, -dd), Q, DK);
  A.trim.quad(V(-doorHalf, y0, 0), V(-doorHalf, y0, -dd), V(-doorHalf, doorTop, -dd), V(-doorHalf, doorTop, 0), Q, DK);
  A.trim.quad(V(-doorHalf, doorTop, -dd), V(doorHalf, doorTop, -dd), V(doorHalf, doorTop, 0), V(-doorHalf, doorTop, 0), Q, DK);
  A.trim.box(-doorHalf, doorHalf, y0 - 0.4, y0 - 0.03, -dd, 0.6, DK);
  A.trim.box(-hw - 0.4, hw + 0.4, yMid - 0.25, yMid + 0.25, -D, 0.45, DK);
  A.trim.box(-hw - 0.3, hw + 0.3, yMid - 0.05, yMid + 0.15, 0, 1.3, COLORS.wood);
  A.trim.box(-hw - 0.3, hw + 0.3, yMid + 1.0, yMid + 1.14, 1.18, 1.32, R);
  for (let x = -hw; x <= hw + 0.01; x += 0.86) A.trim.box(x - 0.05, x + 0.05, yMid + 0.15, yMid + 1.0, 1.2, 1.3, R);
  // a stone footing round the outside only: the castle room's floor is inside
  for (const s of [-1, 1]) {
    A.trim.box(s > 0 ? hw - 0.1 : -hw - 0.5, s > 0 ? hw + 0.5 : -hw + 0.1, y0 - 1.2, y0 + 0.3, -D, 0.5, COLORS.stone);
    A.trim.box(s > 0 ? doorHalf : -hw - 0.5, s > 0 ? hw + 0.5 : -doorHalf, y0 - 1.2, y0 + 0.3, -0.1, 0.5, COLORS.stone);
  }
  g.add(accMeshes(A, { cast: true }));

  // the cusped roof over the doorway, its gilded barge board, and the sign under it
  {
    const span = doorHalf * 2 + 3.2, k = karahafu(span, 2.6, 1.7);
    const roof = new THREE.Mesh(k.geo, m.tiles);
    roof.position.set(0, doorTop + 1.0, 2.2);
    roof.castShadow = true;
    g.add(roof);
    const edge: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const t = -1 + i / 12; edge.push(V((t * span) / 2, doorTop + 1.0 + k.prof(t) - 0.12, 2.18)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 40, 0.12, 6), m.gold));
    const signMap = signTexture('油屋', { vertical: false, w: 512, h: 160 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.6), waveLit(new THREE.MeshLambertMaterial({ map: signMap, emissive: 0xffe0a0, emissiveMap: signMap, emissiveIntensity: 0.6 }), 'bath-gate-sign-1', { dim: 0.8 }));
    sign.position.set(0, doorTop + 0.35, 0.42);
    g.add(sign);
  }
  // the main roof: hip and gable, its small gable facing the bridge, and a lantern turret on the ridge
  {
    const roof = hipGableRoof(D + 2.4, hw * 2 + 3.4, 6.4, m.tiles, m.redPlain);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(0, yTop - 0.4, -D / 2 + 0.4);
    g.add(roof);
    const tur = new THREE.Group();
    tur.add(box(2.4, 2.2, 2.4, m.redPlain, 0, 1.1, 0));
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.6, 4), m.tiles);
    roof2.rotation.y = Math.PI / 4; roof2.position.y = 3.0;
    tur.add(roof2);
    tur.add(giboshi(m, 0, 3.8, 0, 2));
    tur.position.set(0, yTop + 5.9, -8);
    g.add(tur);
    lanterns.add(W(0, yTop + 7.1, -6.7), 1.1, LANTERN.yellow);
  }
  // big lanterns either side of the door, smaller ones on the balcony
  for (const s of [-1, 1]) {
    lanterns.add(W(s * (doorHalf + 1.9), doorTop - 1.2, 0.9), 1.7, LANTERN.red, Math.PI);
    g.add(box(0.14, 0.9, 0.14, m.dark, s * (doorHalf + 1.9), doorTop - 0.1, 0.9));
    lanterns.add(W(s * (doorHalf + 1.9), yMid + 2.6, 1.6), 1.0, LANTERN.white, Math.PI);
  }
  return g;
}

/**
 * A plain stand-in for the castle room, so the gate house's doorway still shows a warm room when you look
 * back after the meadow scene (which owns the real room) is hidden. Its walls sit just inside the thickness
 * of the real room's walls, so while the real room is drawn they are hidden behind it.
 */
export function buildRoomStandIn() {
  const R = { x: 5.56, y0: DECK - 0.03, y1: DECK + 7.56, zf: -1761.2, zb: GATE.z1 + 1.95, dw: 2.8, dt: DECK + 6.4 };
  const parts: THREE.BufferGeometry[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
    const w = a.distanceTo(b) / 2, h = a.distanceTo(d) / 2;
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, h, 0, h], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    parts.push(g);
  };
  const { x, y0, y1, zf, zb } = R;
  quad(V(-x, y0, zf), V(-x, y0, zb), V(-x, y1, zb), V(-x, y1, zf));
  quad(V(x, y0, zb), V(x, y0, zf), V(x, y1, zf), V(x, y1, zb));
  quad(V(-x, y1, zb), V(x, y1, zb), V(x, y1, zf), V(-x, y1, zf));
  quad(V(-x, y0, zf), V(x, y0, zf), V(x, y0, zb), V(-x, y0, zb));
  // the far wall (the castle's front wall), with its doorway
  quad(V(x, y0, zf), V(R.dw, y0, zf), V(R.dw, y1, zf), V(x, y1, zf));
  quad(V(-R.dw, y0, zf), V(-x, y0, zf), V(-x, y1, zf), V(-R.dw, y1, zf));
  quad(V(R.dw, R.dt, zf), V(-R.dw, R.dt, zf), V(-R.dw, y1, zf), V(R.dw, y1, zf));
  const mat = new THREE.MeshLambertMaterial({ map: deckPlanks(0x7a5234), emissive: 0x3a1c0a });
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat);
  mesh.userData.keep = true;
  return mesh;
}
