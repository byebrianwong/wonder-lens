import * as THREE from 'three';
import { Rng } from '../../../engine/math';
import type { Road } from '../layout';
import { makeAdult, type Adult } from '../people';
import { Batch, at, boredTunnel, cutFace, hangingRoots, lanterns, pathStrip, V3 } from './build';
import { lit, type Mats } from './mats';
import { Z } from './plan';
import { boards, packedEarth, signAtlas } from './textures';

/*
 * The climb: a steep tunnel up from Bean's cellar to the hilltop, shored with timber. Two round holes in its
 * walls look into the farmers' buildings it passes under: on the left Boggis's Chicken House No. 1 (nesting
 * boxes stacked to the roof, a white hen in every one, Boggis himself, enormously fat, gnawing a drumstick),
 * on the right Bunce's storehouse (smoked geese and ducks hanging in rows, jars of goose liver, Bunce, short
 * and pot-bellied).
 */

const R = 3.5, RISE = 2.5, WIN = 2.6, WX = 3.25;
export const WINDOWS = { boggis: { s: -1, z: -1095 }, bunce: { s: 1, z: -1105 } };

export interface Climb {
  statics: THREE.Group;
  farmers: Array<{ f: Adult; chew: boolean }>;
  live: THREE.Group;
  lampAt: THREE.Vector3;
}

export function buildClimb(road: Road, rng: Rng, m: Mats): Climb {
  const b = new Batch();
  const z0 = Z.cellar.z1 - 0.2, z1 = Z.climb.z1 - 0.5;
  const skip = (z: number, side: number) => Object.values(WINDOWS).some((w) => w.s === side && Math.abs(z - w.z) < WIN);
  b.add(boredTunnel(road, z0, z1, R, RISE, { step: 1.2, skip }), m.earth, 8);
  b.add(pathStrip(road, z0, z1, -3.4, 3.4, -0.22), m.floor, 4);
  // timber sets shoring the tunnel every few units: two posts and a cap
  for (let z = z0 - 3; z > z1 + 1; z -= 4.2) {
    const p = road.at(z);
    for (const s of [-1, 1]) b.add(at(new THREE.BoxGeometry(0.3, 4.6, 0.3), s * 3.05, p.y + 2.05, z, 0, 0, -s * 0.05), m.woodDark);
    b.add(at(new THREE.BoxGeometry(6.6, 0.32, 0.34), 0, p.y + 4.4, z), m.woodDark);
  }
  // roots hanging from the tunnel roof, following the climb
  for (let z = z0 - 2; z > z1 + 2; z -= 6) b.add(hangingRoots(rng, -2.2, 2.2, z, z - 5, road.at(z - 2.5).y + 5.7, { thick: 0, thin: 6, len: [0.5, 1.4] }), m.bark, 3);
  const lamp = lanterns([V3(-2.6, road.at(-1089).y + 3.9, -1089), V3(2.6, road.at(-1112).y + 3.9, -1112)], 0.2);
  b.add(lamp.metal, m.iron); b.add(lamp.glass, m.glass);

  const plank = lit(boards(0xe8dcc0, 33), 0.25);
  const straw = lit(packedEarth(0xd8b060, 35), 0.2);
  const plankDark = lit(boards(0x8a6a44, 34), 0.18);
  const signs = signAtlas([
    { text: 'BOGGIS', sub: 'Chicken House No. 1', bg: '#f2ead0', fg: '#6a2a1a', border: '#6a2a1a' },
    { text: 'BUNCE', sub: 'Ducks, Geese & Goose Liver', bg: '#3a3a2a', fg: '#e8d8a0', border: '#e8d8a0' },
  ]);
  const signMat = lit(signs.tex, 0.4);
  const farmers: Climb['farmers'] = [];
  const live = new THREE.Group();

  for (const [key, w] of Object.entries(WINDOWS)) {
    const s = w.s, zc = w.z;
    const lo = road.at(zc + WIN).y - 0.4, hi = road.at(zc - WIN).y + 4.4;
    const wy = road.at(zc).y + 2.0;
    // the flat wall with the round hole, framed in timber
    b.add(cutFace(s * WX, zc + WIN, zc - WIN, lo, hi, [{ z0: zc + 1.5, z1: zc - 1.5, y0: wy - 1.5, y1: wy + 1.5, round: true }]), m.earth, 8);
    b.add(at(new THREE.TorusGeometry(1.55, 0.14, 6, 24), s * (WX - 0.05), wy, zc, s * Math.PI / 2), m.woodLight);
    b.box(s * (WX - 0.2), s * WX, hi - 0.4, hi, zc + WIN, zc - WIN, m.woodDark);
    // the room beyond: floor below the hole, walls, ceiling
    // (kept clear of the tunnel's own walls, which reach out to x = 3.5; a short wooden sleeve joins the hole to it)
    const fy = wy - 2.2, xr = s * (WX + 0.6), x1 = s * (WX + 10), za = zc + 6, zb = zc - 6, top = wy + 4.5;
    const wall = key === 'boggis' ? plank : plankDark;
    b.add(at(new THREE.CylinderGeometry(1.5, 1.5, 0.7, 20, 1, true).rotateZ(Math.PI / 2), s * (WX + 0.3), wy, zc), m.woodLight);
    b.add(at(new THREE.CylinderGeometry(1.5, 1.5, 0.7, 20, 1, true).rotateZ(Math.PI / 2).scale(-1, 1, 1), s * (WX + 0.3), wy, zc), m.woodLight);
    b.box(xr, x1, fy - 0.3, fy, za, zb, key === 'boggis' ? straw : plankDark, 3);
    b.box(x1, x1 + s * 0.3, fy, top, za, zb, wall, 2);
    b.box(xr, x1, fy, top, za, za - 0.3, wall, 2);
    b.box(xr, x1, fy, top, zb + 0.3, zb, wall, 2);
    b.box(xr, x1, top, top + 0.3, za, zb, wall, 2);
    for (let z = za - 2; z > zb; z -= 3) b.box(xr, x1, top - 0.35, top, z - 0.15, z + 0.15, m.woodDark);
    const geo = new THREE.PlaneGeometry(5.6, 0.7);
    const [v0, v1] = signs.uv(key === 'boggis' ? 0 : 1);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, v0 + uv.getY(k) * (v1 - v0));
    b.add(at(geo, x1 - s * 0.02, top - 1.1, zc, -s * Math.PI / 2), signMat);
    b.add(at(new THREE.SphereGeometry(0.28, 10, 8), s * (WX + 4.5), top - 0.9, zc), m.lampGlow);
    b.add(at(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), s * (WX + 4.5), top - 0.3, zc), m.iron);
    if (key === 'boggis') {
      // nesting boxes up the back wall, a hen in each
      const hen = new THREE.SphereGeometry(0.38, 10, 8);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
        const y = fy + 0.4 + r * 1.15, z = za - 1.6 - c * 1.25;
        b.box(x1 - s * 1.1, x1, y - 0.06, y, z - 0.6, z + 0.6, m.woodLight);
        b.box(x1 - s * 1.1, x1, y, y + 1.0, z - 0.6, z - 0.54, m.woodLight);
        b.add(at(hen.clone().scale(1, 0.85, 1.2), x1 - s * 0.55, y + 0.35, z), m.white);
        b.add(at(new THREE.SphereGeometry(0.2, 8, 6), x1 - s * 0.85, y + 0.62, z + 0.12), m.white);
        b.add(at(new THREE.SphereGeometry(0.09, 6, 5).scale(0.6, 1, 1), x1 - s * 0.88, y + 0.84, z + 0.12), m.red);
        b.add(at(new THREE.ConeGeometry(0.06, 0.16, 5), x1 - s * 1.04, y + 0.6, z + 0.12, 0, 0, s * Math.PI / 2), m.mustard);
      }
    } else {
      // smoked geese and ducks hanging from rails in rows; shelves of jars below
      const bird = new THREE.SphereGeometry(0.42, 10, 8);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
        const x = s * (WX + 3.2 + r * 3), z = za - 1.6 - c * 1.6, y = top - 1.9;
        b.add(at(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 4), x, y + 1.0, z), m.iron);
        b.add(at(bird.clone().scale(0.9, 1.4, 0.8), x, y, z), m.copper);
        b.add(at(new THREE.CylinderGeometry(0.06, 0.04, 0.5, 5), x, y + 0.6, z), m.mustard);
      }
      for (const y of [fy + 0.9, fy + 1.8]) {
        b.box(x1 - s * 0.8, x1, y - 0.06, y, za - 1, zb + 1, m.wood);
        for (let k = 0; k < 9; k++) b.add(at(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 8), x1 - s * 0.4, y + 0.2, za - 1.6 - k * 1.1), rng.pick([m.cream, m.mustard, m.copper]));
      }
    }
    // the farmer himself, in the middle of the room, facing the hole
    const f = key === 'boggis'
      ? makeAdult({ seed: 1201, hair: 0x8a6a4a, style: 'short', top: 0x6a7a52, bottom: { kind: 'trousers', color: 0x5a5444 }, shoes: 0x3a2a1a, hat: { kind: 'flat', color: 0x4a4a3a }, build: 1.75, scale: 1.25, glow: 0x3a2410 })
      : makeAdult({ seed: 1301, hair: 0x5a4a3a, style: 'bald', top: 0x7a6a5a, bottom: { kind: 'trousers', color: 0x3e3a30 }, shoes: 0x2a2018, moustache: 0x3a2a1a, coat: 0x6a6a52, coatSkirt: false, build: 1.45, scale: 0.85, glow: 0x3a2410 });
    f.group.position.set(s * (WX + 4.6), fy, zc + (key === 'boggis' ? 0.6 : -0.4));
    f.group.rotation.y = -s * Math.PI / 2;
    live.add(f.group);
    farmers.push({ f, chew: key === 'boggis' });
    if (key === 'boggis') {
      // a drumstick in his hand
      const leg = new THREE.Group();
      leg.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6).scale(1, 1.5, 1), m.copper), new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 5).translate(0, -0.2, 0), m.white));
      leg.position.set(0, -0.05, 0.06);
      f.hand[1].parent!.add(leg);
      leg.position.add(f.hand[1].position);
    }
  }
  for (const mat of [m.woodDark, m.woodLight, m.white, m.copper]) b.castShadow(mat);
  return { statics: b.build(), farmers, live, lampAt: V3(-6, road.at(-1095).y + 3, -1095) };
}
