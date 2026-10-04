import * as THREE from 'three';
import { Rng, TAU } from '../../../engine/math';
import { repeatUV } from '../../../engine/Paint';
import type { Road } from '../layout';
import { Batch, at, boredTunnel, crossWall, cutFace, hangingRoots, lanterns, pathStrip, rootTube, V3 } from './build';
import { lit, type Mats } from './mats';
import { newspaper } from './paint';
import { HOME, Y, Z } from './plan';
import { picture, signTexture } from './textures';

/*
 * The Fox family's home under the great tree, as a dollhouse cutaway: the hill is sliced open along the
 * track, so every room stands open to the train like a little stage. Left: the kitchen, then Mrs. Fox's
 * studio, and above them, cut into the earth, the boys' bedroom. Right: Mr. Fox's study, then the sitting
 * room with its fire, and above, the larder full of stolen chickens. At the far end the foot of the tree
 * comes down through the ceiling, its round green door standing open for the train, Mr. Fox on the
 * balcony above it. Then a tunnel through the roots.
 */

const F = HOME.front, B = HOME.back, RY = Y.room, CEIL = Y.room + HOME.roomH, TOP = Y.home + HOME.top;
const R1 = { z0: Z.home.z0 - 2, z1: HOME.split + 1 }, R2 = { z0: HOME.split - 1, z1: Z.home.z1 + 2 };
/** the tree trunk: its axis and radius */
export const TRUNK = { z: -962.5, r: 7 };
const DOOR = { y: Y.home + 2.6, r: HOME.doorR };
/** the boys' bedroom (left) and the larder (right), cut into the earth above the rooms */
const CHAMBER = { floor: -0.2, r: 5, depth: 6, left: { z0: -938, z1: -948 }, right: { z0: -911, z1: -921 } };

export interface Home {
  statics: THREE.Group;
  /** where the characters go */
  spots: {
    mrFox: THREE.Vector3; mrsFox: { pos: THREE.Vector3; yaw: number }; boys: { pos: THREE.Vector3; yaw: number };
    tree: THREE.Vector3; window: THREE.Vector3;
  };
  occluders: THREE.Object3D[];
  /** the fire's glow, flickered by the set */
  fire: THREE.MeshBasicMaterial;
}

/** Flip a geometry's faces so it is seen from inside (a vault). */
function inward(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  const p = n.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
  n.deleteAttribute('normal');
  n.computeVertexNormals();
  return n;
}

export function buildHome(road: Road, rng: Rng, m: Mats): Home {
  const b = new Batch();
  const S = (s: number, x: number) => s * x;
  const pictures = new Map<string, THREE.Material>();
  const pic = (k: Parameters<typeof picture>[0]) => pictures.get(k) ?? pictures.set(k, lit(picture(k, 31 + pictures.size), 0.3)).get(k)!;

  /** a framed picture on a wall facing `nx` (+1 faces +x) or along z (`nz`) */
  const frame = (x: number, y: number, z: number, w: number, h: number, kind: Parameters<typeof picture>[0], face: 'x+' | 'x-' | 'z+') => {
    const d = 0.08;
    if (face === 'z+') {
      b.box(x - w / 2 - 0.12, x + w / 2 + 0.12, y - h / 2 - 0.12, y + h / 2 + 0.12, z, z + d, m.woodLight);
      b.add(at(new THREE.PlaneGeometry(w, h), x, y, z + d + 0.01), pic(kind));
    } else {
      const s = face === 'x+' ? 1 : -1;
      b.box(x, x + s * d, y - h / 2 - 0.12, y + h / 2 + 0.12, z - w / 2 - 0.12, z + w / 2 + 0.12, m.woodLight);
      b.add(at(new THREE.PlaneGeometry(w, h), x + s * (d + 0.01), y, z, s * Math.PI / 2), pic(kind));
    }
  };
  const table = (x: number, z: number, w: number, d: number, h: number, top: THREE.Material, legs: THREE.Material) => {
    b.box(x - w / 2, x + w / 2, RY + h - 0.1, RY + h, z - d / 2, z + d / 2, top);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(x + dx * (w / 2 - 0.12) - 0.06, x + dx * (w / 2 - 0.12) + 0.06, RY, RY + h - 0.1, z + dz * (d / 2 - 0.12) - 0.06, z + dz * (d / 2 - 0.12) + 0.06, legs);
  };
  const chair = (x: number, z: number, sx: number, sz: number, seat: THREE.Material) => {
    // a ladder-back chair; (sx, sz) points from the seat to its back
    b.box(x - 0.32, x + 0.32, RY + 0.85, RY + 0.95, z - 0.32, z + 0.32, seat);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(x + dx * 0.26 - 0.04, x + dx * 0.26 + 0.04, RY, RY + 0.85, z + dz * 0.26 - 0.04, z + dz * 0.26 + 0.04, m.woodDark);
    const bx = x + sx * 0.3, bz = z + sz * 0.3;
    b.box(bx - (sz ? 0.32 : 0.05), bx + (sz ? 0.32 : 0.05), RY + 0.95, RY + 1.9, bz - (sx ? 0.32 : 0.05), bz + (sx ? 0.32 : 0.05), m.woodDark);
  };
  const lamp = (x: number, z: number, h: number, shade: THREE.Material) => {
    b.add(at(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 10), x, RY + 0.04, z), m.brass);
    b.add(at(new THREE.CylinderGeometry(0.03, 0.03, h, 6), x, RY + h / 2, z), m.brass);
    b.add(at(new THREE.CylinderGeometry(0.3, 0.5, 0.55, 12, 1, true), x, RY + h + 0.1, z), shade);
    b.add(at(new THREE.SphereGeometry(0.2, 10, 8), x, RY + h - 0.05, z), m.lampGlow);
  };
  const pendant = (x: number, z: number, drop: number, shade: THREE.Material) => {
    b.add(at(new THREE.CylinderGeometry(0.02, 0.02, drop, 4), x, CEIL - drop / 2, z), m.iron);
    b.add(at(new THREE.ConeGeometry(0.55, 0.45, 14, 1, true), x, CEIL - drop - 0.1, z), shade);
    b.add(at(new THREE.SphereGeometry(0.2, 10, 8), x, CEIL - drop - 0.32, z), m.lampGlow);
  };
  const armchair = (x: number, z: number, yaw: number, cloth: THREE.Material) => {
    const g = new THREE.Group();
    for (const geo of [at(new THREE.BoxGeometry(1.3, 0.55, 1.2), 0, 0.5, 0), at(new THREE.BoxGeometry(1.3, 1.1, 0.3), 0, 1.0, -0.5), at(new THREE.BoxGeometry(0.25, 0.75, 1.2), -0.6, 0.75, 0), at(new THREE.BoxGeometry(0.25, 0.75, 1.2), 0.6, 0.75, 0)]) g.add(new THREE.Mesh(geo, cloth));
    g.add(new THREE.Mesh(at(new THREE.BoxGeometry(1.1, 0.22, 1.0), 0, 0.85, 0.05), m.cream));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.06, 0.04, 0.24, 6), dx * 0.55, 0.12, dz * 0.5), m.woodDark));
    g.position.set(x, RY, z); g.rotation.y = yaw;
    b.addObject(g);
  };

  // ---------------- the cut faces, the rooms and the chambers, on each side ----------------
  for (const s of [-1, 1]) {
    const ch = s < 0 ? CHAMBER.left : CHAMBER.right;
    b.add(cutFace(S(s, F), Z.home.z0, Z.home.z1, Y.home - 0.3, TOP + 0.4, [
      { z0: R1.z0, z1: R1.z1, y0: RY, y1: CEIL },
      { z0: R2.z0, z1: R2.z1, y0: RY, y1: CEIL },
      { z0: ch.z0, z1: ch.z1, y0: CHAMBER.floor, y1: CHAMBER.floor + 1 + CHAMBER.r, arch: true },
    ]), m.earth, 8);
    for (const r of [R1, R2]) {
      const wall = s < 0 ? (r === R1 ? m.kitchenWall : m.studioWall) : (r === R1 ? m.studyWall : m.sittingWall);
      const floor = s < 0 ? (r === R1 ? m.kitchenFloor : m.studioFloor) : m.studyFloor;
      b.box(S(s, F), S(s, B), RY - 0.4, RY, r.z0, r.z1, floor, 2);
      b.box(S(s, F), S(s, B), CEIL, CEIL + 0.4, r.z0, r.z1, m.plaster);
      // beams across the ceiling
      for (let zz = r.z0 - 2.5; zz > r.z1 + 1; zz -= 3.5) b.box(S(s, F), S(s, B), CEIL - 0.28, CEIL, zz - 0.18, zz + 0.18, m.woodDark);
      b.box(S(s, B), S(s, B + 0.3), RY, CEIL, r.z0, r.z1, wall, 2);
      b.box(S(s, F), S(s, B), RY, CEIL, r.z0, r.z0 - 0.25, wall, 2);
      b.box(S(s, F), S(s, B), RY, CEIL, r.z1 + 0.25, r.z1, wall, 2);
      // skirting and a picture rail
      b.box(S(s, B - 0.06), S(s, B), RY, RY + 0.3, r.z0, r.z1, m.woodDark);
      b.box(S(s, B - 0.05), S(s, B), CEIL - 0.6, CEIL - 0.5, r.z0, r.z1, m.cream);
      // the earth's cut edge round the opening: a dark lip so the rooms read as cut out of the hill
      b.box(S(s, F - 0.05), S(s, F + 0.25), CEIL, CEIL + 0.18, r.z0, r.z1, m.earthDark, 8);
    }
    // the chamber: a floor, a back wall, a barrel vault running into the earth
    const cx0 = S(s, F), cx1 = S(s, F + CHAMBER.depth), cz = (ch.z0 + ch.z1) / 2, spring = CHAMBER.floor + 1;
    b.box(cx0, cx1, CHAMBER.floor - 0.3, CHAMBER.floor, ch.z0, ch.z1, m.studyFloor, 2);
    const cwall = s < 0 ? m.boysWall : m.larderWall;
    b.box(cx1, cx1 + s * 0.2, CHAMBER.floor, spring + CHAMBER.r, ch.z0, ch.z1, cwall, 2);
    b.box(cx0, cx1, CHAMBER.floor, spring, ch.z0, ch.z0 - 0.15, cwall, 2);
    b.box(cx0, cx1, CHAMBER.floor, spring, ch.z1 + 0.15, ch.z1, cwall, 2);
    const vault = inward(new THREE.CylinderGeometry(CHAMBER.r, CHAMBER.r, CHAMBER.depth, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(0));
    // after the turn the vault's axis runs along x; only its top half is kept (theta 0..PI)
    b.add(at(vault, (cx0 + cx1) / 2, spring, cz), cwall, 2);
  }

  // ---------------- the slot over the track: floor, rug, ceiling, the entrance wall ----------------
  for (const s of [-1, 1]) b.box(S(s, 3), S(s, F + 0.1), Y.home - 0.4, Y.home, Z.home.z0, Z.home.z1, m.floor, 4);
  const rugLen = Z.home.z0 - Z.home.z1;
  const rug = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(6, rugLen).rotateX(-Math.PI / 2), 1, rugLen / 6).translate(0, Y.home - 0.02, (Z.home.z0 + Z.home.z1) / 2), m.rug);
  b.addObject(rug);
  b.box(-F - 0.5, F + 0.5, TOP, TOP + 0.8, Z.home.z0, Z.home.z1 - 2, m.earthDark, 8);
  b.add(crossWall(Z.home.z0, -F - 0.1, F + 0.1, Y.home - 0.4, TOP + 0.4, -1, [{ x: 0, y: Y.home + 2.3, r: 3.6, flatBottom: Y.home - 0.3 }]), m.earth, 8);
  b.add(hangingRoots(rng, -F, F, Z.home.z0 - 2, Z.home.z1 + 6, TOP, { thick: 4, thin: 34, len: [0.8, 3] }), m.bark, 3);

  // ---------------- the entrance tunnel (under the white cover) ----------------
  b.add(boredTunnel(road, Z.start + 2, Z.home.z0, 3.6, 2.3), m.earth, 8);
  b.add(pathStrip(road, Z.start + 2, Z.home.z0, -3.4, 3.4, -0.22), m.floor, 4);

  // ---------------- the kitchen (left, front) ----------------
  {
    const s = -1, z = (R1.z0 + R1.z1) / 2;
    // the stove against the back wall, a kettle on it, a pipe to the ceiling
    const sx = S(s, B - 0.9), sz = R1.z0 - 3;
    b.box(sx - 0.8, sx + 0.8, RY, RY + 1.4, sz - 0.9, sz + 0.9, m.cream);
    b.box(sx - 0.85, sx + 0.85, RY + 1.4, RY + 1.5, sz - 0.95, sz + 0.95, m.iron);
    b.box(sx + 0.81, sx + 0.84, RY + 0.3, RY + 1.1, sz - 0.6, sz + 0.6, m.iron);
    b.add(at(new THREE.CylinderGeometry(0.15, 0.15, CEIL - RY - 1.5, 8), sx - 0.4, (RY + 1.5 + CEIL) / 2, sz), m.iron);
    b.add(at(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.8, 1), sx + 0.2, RY + 1.75, sz + 0.4), m.copper);
    b.add(at(new THREE.ConeGeometry(0.06, 0.4, 6), sx + 0.5, RY + 1.85, sz + 0.4, 0, 0, -1.1), m.copper);
    // the table laid for breakfast
    table(S(s, 9), z, 1.6, 3.0, 1.15, m.woodLight, m.wood);
    for (const dz of [-0.8, 0, 0.8]) {
      b.add(at(new THREE.CylinderGeometry(0.26, 0.24, 0.03, 14), S(s, 9) + 0.3, RY + 1.17, z + dz), m.white);
      b.box(S(s, 9) + 0.2, S(s, 9) + 0.42, RY + 1.19, RY + 1.23, z + dz - 0.1, z + dz + 0.1, m.mustard);
    }
    b.add(at(new THREE.SphereGeometry(0.22, 12, 8), S(s, 9) - 0.3, RY + 1.35, z), m.teal);
    chair(S(s, 9), z + 1.9, 0, 1, m.red); chair(S(s, 9), z - 1.9, 0, -1, m.red); chair(S(s, 10.4), z, -1, 0, m.red);
    pendant(S(s, 9), z, 1.0, m.mustard);
    // shelves of jars and plates on the back wall, copper pans hanging
    for (const yy of [RY + 2.2, RY + 3.0]) {
      b.box(S(s, B - 0.6), S(s, B), yy - 0.06, yy, z - 4, z + 2, m.wood);
      for (let k = 0; k < 7; k++) b.add(at(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 8), S(s, B - 0.32), yy + 0.18, z - 3.6 + k * 0.8), rng.pick([m.red, m.mustard, m.green, m.cream]));
    }
    for (let k = 0; k < 4; k++) b.add(at(new THREE.CylinderGeometry(0.32 - k * 0.04, 0.32 - k * 0.04, 0.06, 14), S(s, B - 0.15), RY + 1.8, z + 3.0 + k * 0.85, 0, 0, Math.PI / 2), m.copper);
    frame(S(s, B - 0.02), RY + 2.8, z + 4.2, 1.6, 1.2, 'hills', 'x+');
  }

  // ---------------- Mrs. Fox's studio (left, back) ----------------
  {
    const s = -1, z = (R2.z0 + R2.z1) / 2;
    // the easel near the front, its canvas turned towards the track
    const ex = S(s, 6.4), ez = z + 0.6;
    const easel = new THREE.Group();
    for (const dx of [-0.5, 0.5]) easel.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.07, 2.6, 0.07), dx, 1.3, 0, 0, 0.08 * Math.sign(-dx) * -1), m.woodLight));
    easel.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.07, 2.4, 0.07), 0, 1.2, -0.5, 0, -0.35), m.woodLight));
    easel.add(new THREE.Mesh(at(new THREE.BoxGeometry(1.4, 0.07, 0.18), 0, 1.05, 0.08), m.woodLight));
    easel.add(new THREE.Mesh(at(new THREE.BoxGeometry(1.7, 1.25, 0.06), 0, 1.75, 0.08), m.white));
    easel.add(new THREE.Mesh(at(new THREE.PlaneGeometry(1.6, 1.15), 0, 1.75, 0.115), pic('storm')));
    easel.position.set(ex, RY, ez); easel.rotation.y = Math.PI / 2 - 0.5;
    b.addObject(easel);
    // canvases leaning against the walls, a paint table, a stool, a lamp
    frame(S(s, B - 0.02), RY + 2.2, z - 3, 2.2, 1.6, 'storm', 'x+');
    frame(S(s, B - 0.02), RY + 2.6, z + 3.4, 1.4, 1.0, 'tree', 'x+');
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2 - k * 0.15, 1.5 - k * 0.2), m.white));
      g.position.set(S(s, B - 0.5 - k * 0.12), RY + 0.6 - k * 0.07, z + 6.5); g.rotation.z = s * -0.15;
      b.addObject(g);
    }
    table(S(s, 11.5), z - 6.2, 1.4, 1.0, 0.95, m.wood, m.woodDark);
    for (let k = 0; k < 6; k++) b.add(at(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8), S(s, 11.2 + (k % 3) * 0.25), RY + 1.07, z - 6.4 + Math.floor(k / 3) * 0.35), rng.pick([m.red, m.mustard, m.teal, m.green]));
    b.add(at(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), S(s, 8.6), RY + 0.75, z - 1.8), m.woodLight);
    b.add(at(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5), S(s, 8.6), RY + 0.37, z - 1.8), m.woodDark);
    lamp(S(s, 12.6), z + 2, 2.6, m.cream);
  }

  // ---------------- Mr. Fox's study (right, front) ----------------
  {
    const s = 1, z = (R1.z0 + R1.z1) / 2;
    // bookcases along the back wall
    b.box(S(s, B - 0.7), S(s, B - 0.05), RY, RY + 3.6, z - 8.5, z + 8.5, m.woodDark);
    b.add(at(new THREE.PlaneGeometry(16.6, 3.4), S(s, B - 0.72), RY + 1.8, z, -Math.PI / 2), m.books, 2);
    // the desk facing the track, a typewriter, a green-shaded lamp, papers, his chair
    const dx = S(s, 9.6);
    b.box(dx - 0.7, dx + 0.7, RY + 1.0, RY + 1.12, z - 1.6, z + 1.6, m.wood);
    for (const dz of [-1.3, 1.3]) b.box(dx - 0.65, dx + 0.65, RY, RY + 1.0, z + dz - 0.28, z + dz + 0.28, m.woodDark);
    b.box(dx - 0.35, dx + 0.15, RY + 1.12, RY + 1.36, z - 0.35, z + 0.35, m.iron);
    b.add(at(new THREE.PlaneGeometry(0.42, 0.5), dx - 0.05, RY + 1.55, z, -Math.PI / 2 + 0.2, -0.1), m.white);
    b.add(at(new THREE.CylinderGeometry(0.04, 0.06, 0.6, 6), dx + 0.2, RY + 1.42, z + 1.1), m.brass);
    b.add(at(new THREE.CylinderGeometry(0.12, 0.3, 0.22, 12, 1, true), dx + 0.05, RY + 1.72, z + 1.1, 0, 0, 0.5), m.green);
    b.add(at(new THREE.SphereGeometry(0.11, 8, 6), dx - 0.02, RY + 1.62, z + 1.1), m.lampGlow);
    chair(S(s, 10.8), z, 1, 0, m.green);
    // a globe, an armchair by the bookcase, the framed newspaper column on the partition wall
    b.add(at(new THREE.SphereGeometry(0.42, 16, 12), S(s, 7.2), RY + 1.45, z + 6.4), m.teal);
    b.add(at(new THREE.TorusGeometry(0.48, 0.03, 4, 20), S(s, 7.2), RY + 1.45, z + 6.4, Math.PI / 2), m.brass);
    b.add(at(new THREE.CylinderGeometry(0.05, 0.2, 1.0, 8), S(s, 7.2), RY + 0.5, z + 6.4), m.woodDark);
    armchair(S(s, 11.6), z - 5.6, -Math.PI / 2 - 0.3, m.mustard);
    const np = lit(newspaper(), 0.3);
    b.box(S(s, 9.0), S(s, 11.2), RY + 1.6, RY + 4.0, R1.z1 + 0.25, R1.z1 + 0.33, m.woodLight);
    b.add(at(new THREE.PlaneGeometry(1.95, 2.25), S(s, 10.1), RY + 2.8, R1.z1 + 0.34), np);
    pendant(S(s, 8.2), z - 3, 0.8, m.green);
  }

  // ---------------- the sitting room (right, back): sofa, armchairs, the fire, the family portrait ----------------
  let fireMat: THREE.MeshBasicMaterial;
  {
    const s = 1, z = (R2.z0 + R2.z1) / 2;
    const sofa = new THREE.Group();
    sofa.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 3.6).translate(0, 0.5, 0), m.red), new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 3.6).translate(0.45, 0.9, 0), m.red));
    for (const dz of [-1.75, 1.75]) sofa.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.3).translate(0, 0.6, dz), m.red));
    for (const dz of [-0.85, 0.85]) sofa.add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 1.55).translate(-0.05, 0.88, dz), m.cream));
    sofa.position.set(S(s, B - 0.9), RY, z); b.addObject(sofa);
    frame(S(s, B - 0.02), RY + 3.0, z, 1.8, 1.4, 'portrait', 'x-');
    armchair(S(s, 9.5), z + 3.2, Math.PI, m.mustard);
    armchair(S(s, 9.5), z - 3.2, 0, m.mustard);
    table(S(s, 10.2), z, 1.2, 1.4, 0.6, m.woodDark, m.woodDark);
    b.add(at(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.8, 1), S(s, 10.2), RY + 0.75, z), m.white);
    b.add(at(new THREE.CylinderGeometry(2.4, 2.4, 0.02, 24), S(s, 10.2), RY + 0.01, z), m.teal);
    lamp(S(s, 12.8), z + 5, 2.7, m.mustard);
    // a radio on a side table
    b.box(S(s, 12.4), S(s, 13.4), RY, RY + 0.9, z - 5.6, z - 4.6, m.woodDark);
    b.box(S(s, 12.5), S(s, 13.3), RY + 0.9, RY + 1.6, z - 5.5, z - 4.7, m.wood);
    b.add(at(new THREE.CircleGeometry(0.25, 14), S(s, 12.49), RY + 1.25, z - 5.1, -Math.PI / 2), m.cream);
    // the fireplace on the end wall, facing the room
    const fz = R2.z1 + 0.25, fx = S(s, 9.5);
    b.box(fx - 1.6, fx + 1.6, RY, RY + 2.4, fz, fz + 0.5, m.brick, 2);
    b.box(fx - 1.9, fx + 1.9, RY + 2.4, RY + 2.6, fz, fz + 0.75, m.woodDark);
    b.box(fx - 0.9, fx + 0.9, RY, RY + 1.5, fz + 0.5, fz + 0.52, m.iron);
    fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.9, 0.3) });
    const fire = new THREE.Group();
    for (let k = 0; k < 3; k++) fire.add(new THREE.Mesh(new THREE.ConeGeometry(0.28 - k * 0.04, 0.8 + k * 0.15, 8), fireMat).translateX((k - 1) * 0.35).translateY(0.42));
    fire.position.set(fx, RY + 0.05, fz + 0.62);
    b.addObject(fire);
    b.add(at(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 10), fx, RY + 2.85, fz + 0.4), m.brass);
    b.add(at(new THREE.CircleGeometry(0.17, 14), fx, RY + 2.85, fz + 0.62), m.cream);
  }

  // ---------------- the boys' bedroom (left chamber): a bunk bed, a whack-bat poster, a little rug ----------------
  {
    const s = -1, ch = CHAMBER.left, z = (ch.z0 + ch.z1) / 2, fl = CHAMBER.floor;
    const bx = S(s, F + 5.2);
    for (const yy of [fl + 0.6, fl + 2.3]) {
      b.box(bx - 0.7, bx + 0.7, yy, yy + 0.25, z - 2.6, z + 1.0, m.wood);
      b.box(bx - 0.65, bx + 0.65, yy + 0.25, yy + 0.5, z - 2.5, z + 0.9, yy < fl + 1 ? m.red : m.teal);
      b.box(bx - 0.5, bx + 0.5, yy + 0.5, yy + 0.7, z + 0.4, z + 0.85, m.white);
    }
    for (const dz of [-2.6, 1.0]) for (const dx of [-0.7, 0.7]) b.box(bx + dx - 0.06, bx + dx + 0.06, fl, fl + 3.4, z + dz - 0.06, z + dz + 0.06, m.woodDark);
    const poster = lit(signTexture('WHACK-BAT', { bg: '#f0d070', fg: '#8a2a1a', sub: 'Kristofferson Silverfox', w: 256, h: 320, border: '#8a2a1a' }), 0.35);
    b.add(at(new THREE.PlaneGeometry(1.2, 1.5), S(s, F + CHAMBER.depth - 0.03), fl + 2.4, z + 3.0, -s * Math.PI / 2), poster);
    b.add(at(new THREE.CylinderGeometry(1.4, 1.4, 0.02, 20), S(s, F + 2.6), fl + 0.01, z), m.mustard);
    // the whack-bat bat leaning in the corner
    b.add(at(new THREE.CylinderGeometry(0.05, 0.09, 1.3, 6), S(s, F + 5.6), fl + 0.65, z + 4.4, 0, 0.15), m.woodLight);
    b.add(at(new THREE.SphereGeometry(0.22, 10, 8), S(s, F + 2.2), fl + 2.9, z, 0), m.lampGlow);
  }

  // ---------------- the larder (right chamber): jars on shelves, stolen chickens hanging ----------------
  {
    const s = 1, ch = CHAMBER.right, z = (ch.z0 + ch.z1) / 2, fl = CHAMBER.floor;
    for (const yy of [fl + 0.9, fl + 1.9, fl + 2.9]) {
      b.box(S(s, F + CHAMBER.depth - 0.7), S(s, F + CHAMBER.depth), yy - 0.06, yy, z - 3.5, z + 3.5, m.wood);
      for (let k = 0; k < 8; k++) b.add(at(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 8), S(s, F + CHAMBER.depth - 0.35), yy + 0.21, z - 3.1 + k * 0.88), rng.pick([m.red, m.mustard, m.green, m.copper]));
    }
    for (let k = 0; k < 4; k++) {
      const cx = S(s, F + 2.2), cz = z - 2.4 + k * 1.6, cy = fl + 3.2;
      b.add(at(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), cx, cy + 1.2, cz), m.iron);
      b.add(at(new THREE.SphereGeometry(0.42, 12, 9).scale(1, 1.3, 0.9), cx, cy, cz), m.cream);
      for (const dz of [-0.14, 0.14]) b.add(at(new THREE.CylinderGeometry(0.05, 0.04, 0.55, 5), cx, cy + 0.7, cz + dz), m.mustard);
    }
    b.add(at(new THREE.SphereGeometry(0.2, 10, 8), S(s, F + 1.4), fl + 3.6, z + 3.4), m.lampGlow);
  }

  // ---------------- lanterns on brackets along the slot ----------------
  const lamps: THREE.Vector3[] = [];
  for (const s of [-1, 1]) for (let z = Z.home.z0 - 8; z > Z.home.z1 + 4; z -= 9.5) {
    lamps.push(V3(S(s, 3.85), Y.home + 4.9, z));
    b.add(at(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 4), S(s, 4.2), Y.home + 5.65, z, 0, 0, Math.PI / 2), m.iron);
  }
  const L = lanterns(lamps, 0.25);
  b.add(L.metal, m.iron); b.add(L.glass, m.glass);

  // ---------------- the foot of the tree: bark wall, round door, balcony, window ----------------
  const trunkZ = (x: number) => TRUNK.z + Math.sqrt(Math.max(0, TRUNK.r * TRUNK.r - x * x));
  {
    // the bark front, bent round the trunk, with the doorway left open
    const nx = 40, ny = 64, x0 = -F - 0.3, x1 = F + 0.3, y0 = Y.home - 0.4, y1 = TOP + 0.6;
    const pos: number[] = [];
    const P = (x: number, y: number) => [x, y, trunkZ(x)];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, ya = y0 + (y1 - y0) * j / ny, yb = y0 + (y1 - y0) * (j + 1) / ny;
      if (Math.hypot((xa + xb) / 2, (ya + yb) / 2 - DOOR.y) < DOOR.r && (ya + yb) / 2 > Y.home - 0.3) continue;
      if ((ya + yb) / 2 < Y.home - 0.2 && Math.abs((xa + xb) / 2) < DOOR.r * 0.9) continue;
      pos.push(...P(xa, ya), ...P(xb, ya), ...P(xa, yb), ...P(xb, ya), ...P(xb, yb), ...P(xa, yb));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, m.bark, 3);
    // the door frame: a green-painted ring bent onto the bark, brass studs
    const ring = new THREE.TorusGeometry(DOOR.r + 0.05, 0.32, 8, 40);
    const rp = ring.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) rp.setZ(i, rp.getZ(i) + trunkZ(rp.getX(i)) + 0.05);
    ring.translate(0, DOOR.y, 0); ring.computeVertexNormals();
    b.add(ring, m.doorGreen);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; const x = Math.cos(a) * (DOOR.r + 0.05), y = DOOR.y + Math.sin(a) * (DOOR.r + 0.05); if (y < Y.home + 0.2) continue; b.add(at(new THREE.SphereGeometry(0.09, 6, 5), x, y, trunkZ(x) + 0.36), m.brass); }
    // the doorway's lining through the trunk
    b.add(inward(new THREE.CylinderGeometry(DOOR.r, DOOR.r, 3.4, 28, 1, true, 0.5, TAU - 1.0).rotateX(Math.PI / 2)).translate(0, DOOR.y, trunkZ(0) - 1.6), m.woodLight);
    // the round door itself, swung open against the left of the slot
    const door = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.CylinderGeometry(DOOR.r - 0.1, DOOR.r - 0.1, 0.18, 32).rotateZ(Math.PI / 2), m.doorGreen);
    leaf.position.set(0, 0, DOOR.r);
    door.add(leaf);
    for (let k = -2; k <= 2; k++) door.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 6.2 - Math.abs(k) * 1.1).translate(0.1, k * 1.15, DOOR.r), m.doorGreen));
    door.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8).translate(0.2, 0, DOOR.r * 1.75), m.brass));
    door.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 14).rotateY(Math.PI / 2).translate(0.22, 0.6, DOOR.r), m.brass));
    door.position.set(-F + 0.65, Y.home + DOOR.r - 0.05, trunkZ(-3.6) + 0.1);
    b.addObject(door);
    // two lamps beside the door
    for (const s of [-1, 1]) {
      const x = S(s, 4.15);
      b.add(at(new THREE.BoxGeometry(0.1, 0.5, 0.45), x, Y.home + 4.2, trunkZ(x) + 0.2), m.brass);
      b.add(at(new THREE.SphereGeometry(0.26, 10, 8), x, Y.home + 4.55, trunkZ(x) + 0.42), m.lampGlow);
    }
    // the balcony: a half-round deck on brackets, a turned rail
    const by = Y.home + 6.05, bz = trunkZ(0) - 0.3;
    b.add(at(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 24, 1, false, -Math.PI / 2, Math.PI), 0, by - 0.12, bz), m.wood);
    b.add(at(new THREE.CylinderGeometry(2.45, 2.45, 0.1, 24, 1, true, -Math.PI / 2, Math.PI), 0, by - 0.3, bz), m.woodDark);
    for (const x of [-1.4, 1.4]) b.add(at(new THREE.ConeGeometry(0.3, 1.2, 4).rotateX(Math.PI), x, by - 0.85, trunkZ(x) + 0.25), m.woodDark);
    for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + (k / 12) * Math.PI; b.add(at(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), Math.sin(a) * 2.28, by + 0.45, bz + Math.cos(a) * 2.28), m.woodLight); }
    b.add(at(new THREE.TorusGeometry(2.28, 0.07, 6, 28, Math.PI).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2), 0, by + 0.92, bz), m.woodLight);
    // the round window of the room behind him, lamplit
    const wy = Y.home + 8.4;
    b.add(at(new THREE.CircleGeometry(1.15, 24), 0, wy, trunkZ(0) + 0.04), m.warmGlow);
    b.add(at(new THREE.TorusGeometry(1.2, 0.16, 6, 28), 0, wy, trunkZ(0) + 0.08), m.doorGreen);
    b.box(-0.06, 0.06, wy - 1.15, wy + 1.15, trunkZ(0) + 0.05, trunkZ(0) + 0.12, m.doorGreen);
    b.box(-1.15, 1.15, wy - 0.06, wy + 0.06, trunkZ(0) + 0.05, trunkZ(0) + 0.12, m.doorGreen);
    // a name board under the balcony
    const board = lit(signTexture('MR. & MRS. FOX', { bg: '#f2e6c8', fg: '#7a3a1a', w: 512, h: 96, border: '#7a3a1a', serif: true }), 0.35);
    b.box(-1.6, 1.6, by - 0.95, by - 0.45, trunkZ(0) + 0.2, trunkZ(0) + 0.28, m.woodDark);
    b.add(at(new THREE.PlaneGeometry(3.0, 0.42), 0, by - 0.7, trunkZ(0) + 0.29), board);
    // roots flaring from the trunk into the floor and the earth walls, and up into the ceiling
    for (const s of [-1, 1]) {
      b.add(rootTube([V3(S(s, 3.2), Y.home + 1.2, trunkZ(3.2) - 0.4), V3(S(s, 4.0), Y.home + 0.2, trunkZ(4) + 0.8), V3(S(s, 4.8), Y.home - 0.2, trunkZ(4) + 2.4)], 0.55, 0.2), m.bark, 3);
      b.add(rootTube([V3(S(s, 2.6), TOP - 1.5, trunkZ(2.6) - 0.4), V3(S(s, 3.6), TOP - 0.4, trunkZ(3.6) + 1.5), V3(S(s, 4.4), TOP + 0.4, trunkZ(4.4) + 4)], 0.5, 0.25), m.bark, 3);
    }
  }
  // the tunnel on through the roots, towards the town
  const tunnelStart = trunkZ(0) - 3.2;
  b.add(boredTunnel(road, tunnelStart, Z.tunnel.z1 + 0.5, 3.5, 2.5), m.earth, 8);
  b.add(hangingRoots(rng, -2.6, 2.6, tunnelStart - 1, Z.tunnel.z1 + 2, Y.home + 5.6, { thick: 0, thin: 14, len: [0.5, 1.6] }), m.bark, 3);
  b.add(pathStrip(road, trunkZ(0) - 0.2, Z.tunnel.z1, -3.4, 3.4, -0.22), m.floor, 4);
  const tl = lanterns([V3(-2.4, Y.home + 4.3, tunnelStart - 4), V3(2.4, Y.home + 4.3, tunnelStart - 9)], 0.4);
  b.add(tl.metal, m.iron); b.add(tl.glass, m.glass);

  for (const mat of [m.wood, m.woodDark, m.woodLight, m.red, m.mustard, m.cream, m.copper, m.brass, m.green, m.teal, m.doorGreen, m.iron, m.white]) b.castShadow(mat);
  const statics = b.build();

  // occluders: the earth walls on each side and the trunk
  const occluders: THREE.Object3D[] = [];
  const proxyMat = new THREE.MeshBasicMaterial();
  for (const s of [-1, 1]) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, Z.home.z0 - Z.home.z1), proxyMat);
    o.position.set(S(s, F + 0.4), CEIL + 1.0 + 1.6, (Z.home.z0 + Z.home.z1) / 2); o.visible = false; o.updateMatrixWorld(true);
    occluders.push(o);
  }
  return {
    statics, occluders, fire: fireMat!,
    spots: {
      mrFox: V3(0, Y.home + 6.05, trunkZ(0) + 1.0),
      mrsFox: { pos: V3(-7.6, RY, (R2.z0 + R2.z1) / 2 + 1.9), yaw: Math.PI / 2 + 0.25 },
      boys: { pos: V3(-(F + 1.5), CHAMBER.floor, (CHAMBER.left.z0 + CHAMBER.left.z1) / 2 - 0.3), yaw: Math.PI / 2 },
      tree: V3(0, Y.home + 6.5, trunkZ(0)),
      window: V3(0, Y.home + 8.4, trunkZ(0)),
    },
  };
}
