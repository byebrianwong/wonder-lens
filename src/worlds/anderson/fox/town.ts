import * as THREE from 'three';
import { Rng } from '../../../engine/math';
import type { Road } from '../layout';
import { Batch, at, boredTunnel, crossWall, cutFace, hangingRoots, lanterns, pathStrip, rootTube, V3, type Opening } from './build';
import { lit, type Mats } from './mats';
import { TOWN, Y, Z } from './plan';
import { boards, signAtlas } from './textures';

/*
 * The animals' underground town: a long gallery cut down through the hill, so that its two walls are the
 * hill's cross-section with the burrows in it, and its roof is the dusk sky. Burrow fronts with round doors
 * and lamplit windows on two levels (a ledge with ladders runs along the upper one), Badger's law office,
 * Rabbit's kitchen, the moles' dig. Lanterns are strung across on wires. On the rims above, the farmers'
 * excavators chew at the edges (placed by the set).
 */

const H = TOWN.half, FL = Y.town, RIM = Y.town + TOWN.rim, LEDGE = Y.town + 6.3;

export interface Town {
  statics: THREE.Group;
  spots: {
    kylie: { pos: THREE.Vector3; yaw: number }; badger: { pos: THREE.Vector3; yaw: number }; rabbit: { pos: THREE.Vector3; yaw: number };
    moles: Array<{ pos: THREE.Vector3; yaw: number }>;
    /** where the excavators stand on the rims, and which way they face */
    diggers: Array<{ pos: THREE.Vector3; yaw: number }>;
  };
  rim: number;
}

export function buildTown(road: Road, rng: Rng, m: Mats): Town {
  const b = new Batch();
  const deck = lit(boards(0x9a6a3c, 25), 0.15);
  const signs = signAtlas([
    { text: 'BADGER, BEAVER & BEAVER', sub: 'Attorneys at Law', bg: '#2a3a2e', fg: '#f0d890', border: '#c8a050' },
    { text: "RABBIT'S KITCHEN", bg: '#f2e6c8', fg: '#a8302a', border: '#a8302a', serif: true },
    { text: 'MOLE & SONS', sub: 'Excavation, Tunnels, Drains', bg: '#d8a040', fg: '#3a2414', border: '#3a2414' },
    { text: 'POST OFFICE', bg: '#a8302a', fg: '#f6eed8', border: '#f6eed8' },
    { text: 'WEASEL', sub: 'Watches Mended', bg: '#3a5a6a', fg: '#f6eed8', border: '#f6eed8', serif: true },
  ]);
  const signMat = lit(signs.tex, 0.35);
  /** a sign on the wall facing the track, `w` wide, centred at (z, y) */
  const sign = (s: number, i: number, z: number, y: number, w: number) => {
    const h = w / 8;
    const geo = new THREE.PlaneGeometry(w, h);
    const [v0, v1] = signs.uv(i);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, v0 + uv.getY(k) * (v1 - v0));
    // the board behind
    b.box(s * H, s * (H - 0.12), y - h / 2 - 0.12, y + h / 2 + 0.12, z - w / 2 - 0.12, z + w / 2 + 0.12, m.woodDark);
    b.add(at(geo, s * (H - 0.13), y, z, -s * Math.PI / 2), signMat);
  };
  /** a room behind an opening in the wall */
  const recess = (s: number, o: Opening, depth: number, wall: THREE.Material, floor: THREE.Material) => {
    const x0 = s * H, x1 = s * (H + depth);
    b.box(x0, x1, o.y0 - 0.3, o.y0, o.z0, o.z1, floor, 2);
    b.box(x1, x1 + s * 0.3, o.y0, o.y1, o.z0, o.z1, wall, 2);
    const w = Math.abs(o.z1 - o.z0), zc = (o.z0 + o.z1) / 2;
    if (o.arch) {
      const r = w / 2, spring = o.y1 - r;
      b.box(x0, x1, o.y0, spring, Math.max(o.z0, o.z1), Math.max(o.z0, o.z1) - 0.15, wall, 2);
      b.box(x0, x1, o.y0, spring, Math.min(o.z0, o.z1) + 0.15, Math.min(o.z0, o.z1), wall, 2);
      const v = new THREE.CylinderGeometry(r, r, depth, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
      // seen from inside: flip the faces
      const n = v.toNonIndexed(); const p = n.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
      n.deleteAttribute('normal'); n.computeVertexNormals();
      b.add(at(n, (x0 + x1) / 2, spring, zc), wall, 2);
    } else {
      b.box(x0, x1, o.y1, o.y1 + 0.3, o.z0, o.z1, wall, 2);
      b.box(x0, x1, o.y0, o.y1, Math.max(o.z0, o.z1), Math.max(o.z0, o.z1) - 0.15, wall, 2);
      b.box(x0, x1, o.y0, o.y1, Math.min(o.z0, o.z1) + 0.15, Math.min(o.z0, o.z1), wall, 2);
    }
  };
  /** a round-topped door frame in green, red or ochre, set into the wall */
  const doorFrame = (s: number, o: Opening, mat: THREE.Material) => {
    const w = Math.abs(o.z1 - o.z0), r = w / 2, zc = (o.z0 + o.z1) / 2, x = s * (H - 0.08);
    b.add(at(new THREE.TorusGeometry(r + 0.1, 0.16, 6, 20, Math.PI), x, o.y1 - r, zc, s * Math.PI / 2), mat);
    for (const z of [o.z0, o.z1]) b.box(x - 0.16, x + 0.16, o.y0, o.y1 - r, z - 0.16, z + 0.16, mat);
  };
  const glowPane = (s: number, z: number, y: number, r: number) => {
    b.add(at(new THREE.CircleGeometry(r, 18), s * (H + 0.35), y, z, -s * Math.PI / 2), m.warmGlow);
    b.add(at(new THREE.TorusGeometry(r + 0.06, 0.09, 5, 18), s * (H - 0.05), y, z, s * Math.PI / 2), m.woodDark);
    b.box(s * (H - 0.02), s * (H + 0.3), y - r, y + r, z - 0.04, z + 0.04, m.woodDark);
  };

  // ---------------- the two walls: the hill's cross-section with the burrows in it ----------------
  const fronts: Record<string, { s: number; o: Opening }> = {
    mole: { s: -1, o: { z0: -974.5, z1: -978, y0: FL + 0.3, y1: FL + 4.2, arch: true } },
    rabbit: { s: -1, o: { z0: -998.5, z1: -1007.5, y0: FL + 0.3, y1: FL + 3.9 } },
    weasel: { s: -1, o: { z0: -1011, z1: -1014, y0: FL + 0.3, y1: FL + 3.8, arch: true } },
    badger: { s: 1, o: { z0: -974.5, z1: -985, y0: FL + 0.3, y1: FL + 4.0 } },
    post: { s: 1, o: { z0: -989, z1: -992, y0: FL + 0.3, y1: FL + 3.8, arch: true } },
    dig: { s: 1, o: { z0: -1003, z1: -1006.6, y0: FL + 0.6, y1: FL + 4.2, round: true } },
  };
  const upper = (s: number) => (s < 0 ? [-981, -992.5, -1003] : [-978.5, -996, -1010.5]).map((z) => ({ z0: z + 1.1, z1: z - 1.1, y0: LEDGE, y1: LEDGE + 3.2, arch: true }));
  for (const s of [-1, 1]) {
    const holes: Opening[] = Object.values(fronts).filter((f) => f.s === s).map((f) => f.o);
    holes.push(...upper(s));
    const windows = s < 0 ? [[-979.8, FL + 2.6], [-985.5, FL + 2.4], [-990, FL + 2.6], [-1016, FL + 2.5], [-986.5, LEDGE + 1.8], [-998, LEDGE + 1.9], [-1013.5, LEDGE + 1.8]] : [[-987, FL + 2.6], [-995, FL + 2.4], [-999, FL + 2.6], [-1013, FL + 2.5], [-984, LEDGE + 1.8], [-1002.5, LEDGE + 1.9], [-1015, LEDGE + 1.8]];
    for (const [z, y] of windows) holes.push({ z0: z + 0.65, z1: z - 0.65, y0: y - 0.65, y1: y + 0.65, round: true });
    b.add(cutFace(s * H, Z.town.z0, Z.town.z1, FL - 0.4, RIM, holes), m.earth, 8);
    for (const [z, y] of windows) glowPane(s, z, y, 0.62);
    for (const o of upper(s)) {
      recess(s, o, 1.6, m.earthDark, m.floor);
      doorFrame(s, o, rng.pick([m.doorGreen, m.red, m.mustard, m.teal]));
      b.add(at(new THREE.SphereGeometry(0.22, 8, 6), s * (H + 1.0), o.y0 + 1.6, (o.z0 + o.z1) / 2), m.lampGlow);
    }
    // the ledge along the upper burrows, a rail, two ladders down to the boardwalk
    b.box(s * H, s * (H - 1.7), LEDGE - 0.25, LEDGE, Z.town.z0 - 1.5, Z.town.z1 + 1.5, deck, 2);
    for (let z = Z.town.z0 - 2; z > Z.town.z1 + 1.5; z -= 1.6) b.box(s * (H - 1.62), s * (H - 1.52), LEDGE, LEDGE + 1.0, z - 0.05, z + 0.05, m.woodDark);
    b.box(s * (H - 1.65), s * (H - 1.5), LEDGE + 0.95, LEDGE + 1.05, Z.town.z0 - 1.5, Z.town.z1 + 1.5, m.woodDark);
    for (let z = Z.town.z0 - 2; z > Z.town.z1 + 1.5; z -= 4.5) b.add(at(new THREE.BoxGeometry(0.12, 0.6, 0.12), s * (H - 1.2), LEDGE - 0.5, z, 0, 0, s * 0.6), m.woodDark);
    for (const lz of s < 0 ? [-987.5, -1009] : [-993, -1015]) {
      for (const dz of [-0.5, 0.5]) b.box(s * (H - 1.9), s * (H - 1.78), FL + 0.3, LEDGE + 1, lz + dz - 0.06, lz + dz + 0.06, m.woodLight);
      for (let y = FL + 0.8; y < LEDGE + 0.8; y += 0.6) b.box(s * (H - 1.9), s * (H - 1.78), y - 0.04, y + 0.04, lz - 0.5, lz + 0.5, m.woodLight);
    }
    // the boardwalk along the foot of the wall
    b.box(s * (H - 4.5), s * H, FL - 0.3, FL + 0.3, Z.town.z0, Z.town.z1, deck, 2);
    for (let z = Z.town.z0 - 3; z > Z.town.z1; z -= 6) b.box(s * (H - 4.55), s * (H - 4.4), FL - 0.2, FL + 0.32, z - 0.1, z + 0.1, m.woodDark);
    // grass on the rim, the hill's surface running out to the sides
    b.box(s * (H - 0.4), s * 48, RIM - 0.35, RIM, Z.town.z0 + 14, Z.town.z1 - 14, m.grass, 4);
    b.box(s * (H - 0.5), s * (H + 0.6), RIM - 0.9, RIM + 0.15, Z.town.z0, Z.town.z1, m.grass, 4);
    // roots poking out of the cut faces
    for (let k = 0; k < 6; k++) {
      const z = rng.range(Z.town.z1 + 2, Z.town.z0 - 2), y = rng.range(LEDGE + 3.8, RIM - 1);
      b.add(rootTube([V3(s * (H + 0.3), y, z), V3(s * (H - 0.6), y - 0.8, z + rng.range(-0.4, 0.4)), V3(s * (H - 0.9), y - rng.range(1.5, 3), z + rng.range(-0.5, 0.5))], 0.12, 0.02, 8), m.bark, 3);
    }
  }
  // the burrows' rooms: Badger's office, Rabbit's kitchen, the mole office, the post office, Weasel's, the dig
  recess(-1, fronts.mole.o, 2.6, m.boysWall, m.studyFloor);
  doorFrame(-1, fronts.mole.o, m.mustard);
  sign(-1, 2, -976.25, FL + 5.0, 5.2);
  b.add(at(new THREE.SphereGeometry(0.26, 8, 6), -(H + 1.6), FL + 3.0, -976.25), m.lampGlow);
  recess(-1, fronts.rabbit.o, 4.0, m.kitchenWall, m.kitchenFloor);
  sign(-1, 1, -1003, FL + 4.6, 7.0);
  {
    // the kitchen: a long counter, a range with a great pot, copper pans on the wall
    const z0 = fronts.rabbit.o.z0, z1 = fronts.rabbit.o.z1;
    b.box(-(H + 0.4), -(H + 1.3), FL + 0.3, FL + 1.35, z0 - 0.4, z1 + 0.4, m.cream);
    b.box(-(H + 0.3), -(H + 1.4), FL + 1.35, FL + 1.45, z0 - 0.3, z1 + 0.3, m.woodLight);
    b.add(at(new THREE.CylinderGeometry(0.55, 0.5, 0.8, 16), -(H + 0.9), FL + 1.85, -1004.5), m.copper);
    for (let k = 0; k < 5; k++) b.add(at(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), -(H + 3.85), FL + 2.6, z0 - 1.2 - k * 1.4, 0, 0, Math.PI / 2), m.copper);
    b.add(at(new THREE.SphereGeometry(0.24, 8, 6), -(H + 2.4), FL + 3.4, -1003), m.lampGlow);
  }
  recess(-1, fronts.weasel.o, 2.0, m.studyWall, m.studyFloor);
  doorFrame(-1, fronts.weasel.o, m.teal);
  sign(-1, 4, -1012.5, FL + 5.0, 4.6);
  recess(1, fronts.badger.o, 4.6, m.studyWall, m.studyFloor);
  sign(1, 0, -979.75, FL + 5.0, 9.0);
  {
    // the office: a desk facing out, filing cabinets, framed certificates, a green lamp
    const zc = -979.5;
    b.box(H + 1.6, H + 2.6, FL + 0.3, FL + 1.25, zc - 1.6, zc + 1.6, m.woodDark);
    b.box(H + 1.5, H + 2.7, FL + 1.25, FL + 1.35, zc - 1.7, zc + 1.7, m.wood);
    b.add(at(new THREE.CylinderGeometry(0.15, 0.3, 0.25, 10, 1, true), H + 1.9, FL + 1.85, zc + 1.2), m.green);
    b.add(at(new THREE.SphereGeometry(0.13, 8, 6), H + 1.9, FL + 1.75, zc + 1.2), m.lampGlow);
    for (const z of [-976, -977.2, -983.8]) b.box(H + 3.8, H + 4.55, FL + 0.3, FL + 2.6, z - 0.5, z + 0.5, m.teal);
    for (const z of [-978, -981]) { b.box(H + 4.55, H + 4.6, FL + 2.2, FL + 3.2, z - 0.6, z + 0.6, m.woodLight); b.box(H + 4.5, H + 4.56, FL + 2.3, FL + 3.1, z - 0.5, z + 0.5, m.cream); }
    b.add(at(new THREE.SphereGeometry(0.24, 8, 6), H + 2.5, FL + 3.6, -976.5), m.lampGlow);
  }
  recess(1, fronts.post.o, 2.0, m.sittingWall, m.studyFloor);
  doorFrame(1, fronts.post.o, m.red);
  sign(1, 3, -990.5, FL + 4.9, 4.0);
  recess(1, fronts.dig.o, 3.4, m.earthDark, m.floor);
  // the dig: spoil heaped in front of the hole, a wheelbarrow, picks leaning
  for (let k = 0; k < 6; k++) b.add(at(new THREE.SphereGeometry(rng.range(0.4, 0.8), 8, 6).scale(1, 0.55, 1), H - rng.range(1, 3.5), FL + 0.3, -1004.8 + rng.range(-2.5, 2.5)), m.floor, 4);
  b.box(H - 3.4, H - 2.4, FL + 0.6, FL + 1.1, -1009.5, -1011.3, m.wood);
  b.add(at(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12).rotateZ(Math.PI / 2), H - 2.9, FL + 0.6, -1011.6), m.iron);

  // ---------------- the floor, the start and end walls, the tunnel on to the cellar ----------------
  b.box(-(H - 4.5), H - 4.5, FL - 0.5, FL, Z.town.z0, Z.town.z1, m.floor, 4);
  b.add(crossWall(Z.town.z0, -H - 0.2, H + 0.2, FL - 0.5, RIM, -1, [{ x: 0, y: road.at(Z.town.z0).y + 2.5, r: 3.5, flatBottom: road.at(Z.town.z0).y - 0.3 }]), m.earth, 8);
  b.add(crossWall(Z.town.z1, -H - 0.2, H + 0.2, FL - 0.5, RIM, 1, [{ x: 0, y: road.at(Z.town.z1).y + 2.5, r: 3.5, flatBottom: road.at(Z.town.z1).y - 0.3 }]), m.earth, 8);
  b.box(-48, 48, RIM - 0.35, RIM, Z.town.z0 + 14, Z.town.z0, m.grass, 4);
  b.box(-48, 48, RIM - 0.35, RIM, Z.town.z1, Z.town.z1 - 14, m.grass, 4);
  b.add(hangingRoots(rng, -3, 3, Z.town.z0 + 0.5, Z.town.z0 - 0.5, road.at(Z.town.z0).y + 5.8, { thick: 0, thin: 8, len: [0.6, 1.6] }), m.bark, 3);
  const tz0 = Z.town.z1 + 0.2, tz1 = Z.wall - 0.3;
  b.add(boredTunnel(road, tz0, tz1, 3.5, 2.5), m.earth, 8);
  b.add(pathStrip(road, tz0, tz1, -3.4, 3.4, -0.22), m.floor, 4);

  // ---------------- lanterns strung across on wires ----------------
  const bulbs: THREE.Vector3[] = [];
  for (const z of [-978, -990, -1002, -1013]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const x = -H + (2 * H) * (i / 12); const y = FL + 10.6 - Math.cos((i / 12 - 0.5) * Math.PI) * 1.8; pts.push(V3(x, y, z)); if (i > 0 && i < 12) bulbs.push(V3(x, y - 0.32, z)); }
    b.add(rootTube(pts, 0.025, 0.025, 24), m.iron);
  }
  const L = lanterns(bulbs, 0.05);
  b.add(L.metal, m.iron); b.add(L.glass, m.glass);
  // a few standing lamps along the boardwalks
  const posts: THREE.Vector3[] = [];
  for (const s of [-1, 1]) for (let z = Z.town.z0 - 6; z > Z.town.z1 + 3; z -= 12) {
    b.add(at(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), s * (H - 4.2), FL + 1.9, z), m.iron);
    posts.push(V3(s * (H - 4.2), FL + 3.9, z));
  }
  const P = lanterns(posts, 0.1);
  b.add(P.metal, m.iron); b.add(P.glass, m.glass);

  for (const mat of [m.wood, m.woodDark, m.woodLight, m.copper, m.iron, m.teal, deck]) b.castShadow(mat);
  const statics = b.build();
  return {
    statics, rim: RIM,
    spots: {
      kylie: { pos: V3(-4.3, FL, -987.5), yaw: 0.75 },
      badger: { pos: V3(H + 3.4, FL + 0.3, -979.5), yaw: -Math.PI / 2 },
      rabbit: { pos: V3(-(H + 1.9), FL + 0.3, -1004.2), yaw: Math.PI / 2 },
      moles: [
        { pos: V3(H - 1.6, FL + 0.3, -1002.2), yaw: Math.PI / 2 + 0.3 },
        { pos: V3(H - 1.3, FL + 0.3, -1004.8), yaw: Math.PI / 2 },
        { pos: V3(H - 1.6, FL + 0.3, -1007.4), yaw: Math.PI / 2 - 0.3 },
        { pos: V3(-(H - 1.2), LEDGE, -996.2), yaw: -Math.PI / 2 },
      ],
      diggers: [
        { pos: V3(-(H + 6.5), RIM, -989), yaw: Math.PI / 2 },
        { pos: V3(H + 6.5, RIM, -1004), yaw: -Math.PI / 2 },
      ],
    },
  };
}
