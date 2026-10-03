import * as THREE from 'three';
import { lerp, smoothstep } from '../../engine/math';

/**
 * The route of the Amélie ride: a dream that passes from one film scene into the next. The ride runs in -z.
 * Each scene ("set") owns a stretch of z; the sets are built separately and only shown near the rider.
 *
 *  street    Rue des Trois Frères at golden morning, into the giant green grocer, out of its back door
 *  cafe      the Café des 2 Moulins, then up the tablecloth onto a giant table (the crème brûlée)
 *  bedroom   Amélie's red bedroom at dusk (reached through an iris), out of its open window
 *  rooftops  a flight over the zinc roofs at sunset, round the domes of the Sacré-Cœur
 *  butte     down the steps of the Sacré-Cœur at blue hour, past the carousel (a white flash)
 *  canal     gliding on the Canal Saint-Martin at night, into its vaulted tunnel
 *  gare      out onto a platform of the Gare de l'Est, into a giant photo booth (four flashes)
 *  finale    a Montmartre street at sunrise behind Amélie and Nino, and a crane shot up over Paris
 */

export type SetId = 'street' | 'cafe' | 'bedroom' | 'rooftops' | 'butte' | 'canal' | 'gare' | 'finale';

/** z where each set begins (the ride enters it) and ends. */
export const SETS: Record<SetId, { z0: number; z1: number }> = {
  street: { z0: 60, z1: -252 },
  cafe: { z0: -252, z1: -452 },
  bedroom: { z0: -452, z1: -532 },
  rooftops: { z0: -532, z1: -800 },
  butte: { z0: -800, z1: -912 },
  canal: { z0: -912, z1: -1236 },
  gare: { z0: -1236, z1: -1430 },
  finale: { z0: -1430, z1: -1712 },
};

/** Key heights. */
export const Y = {
  street0: 2, grocer: 8, cafe: 8, table: 16, bedroom: 18, parvis: 26, square: 8, water: 0, platform: 1.4, finale: 6,
};

/** Hand-placed control points for the path, by set. */
const PTS: [number, number, number][] = [
  // street: a cobbled lane climbing gently, swaying left and right
  [0, 2, 60], [0, 2, 30], [-2.5, 2.6, -15], [-2.8, 4.0, -60], [1.8, 5.6, -105], [1.2, 7.2, -145], [0, 8, -168],
  // the grocer: in through the open front, straight down the aisle, out through the back door
  [0, 8, -185], [0, 8, -215], [0, 8, -244],
  // the café: past the bar, under the arch into the giant back room, up the tablecloth onto the table
  [0, 8, -262], [0.6, 8, -290], [0, 8, -318], [0, 8, -338], [0, 8.0, -348], [0, 9.68, -358], [0, 13.05, -374], [0, 16.05, -388], [0, 16.05, -396],
  [1.5, 16.05, -414], [0, 16.05, -432], [0, 16.6, -448],
  // the bedroom (after the iris): across the room to the open window
  [0, 18, -462], [0, 18, -485], [0, 18, -510], [0, 18.2, -528],
  // the flight: out over the roofs, swooping between chimneys, round the right of the basilica
  [0, 18.8, -545], [5, 16.5, -575], [-4, 18.5, -615], [4, 24, -655], [14, 33, -700], [22, 40, -740],
  [24, 40, -768], [10, 33, -795], [-12, 27.6, -810], [-22, 26.1, -816],
  // the butte: down the great steps to the square and past the carousel
  [-24, 24.4, -822], [-24, 16.75, -842], [-24, 9.1, -862], [-22, 8.05, -878], [-14, 8.05, -898],
  // the canal (after the flash): on the water between the quays, into the vaulted tunnel
  [-4, 3.0, -914], [0, 0.2, -930], [0, 0.15, -960], [3, 0.15, -1010], [-3, 0.15, -1070], [2, 0.15, -1120], [0, 0.15, -1165], [0, 0.15, -1200],
  // the station: up out of the water onto the platform, through the hall into the giant photo booth
  [0, 0.6, -1222], [0, 1.4, -1240], [0, 1.4, -1280], [0, 1.4, -1330], [0, 1.4, -1380], [0, 1.4, -1410], [0, 1.4, -1428],
  // the finale (after the booth's flashes): a morning street, then the crane shot
  [0, 6, -1440], [0, 6, -1470], [-2, 6.4, -1520], [2, 7, -1570], [0, 7.4, -1620], [0, 7.6, -1640], [0, 8.4, -1656], [0, 11.5, -1680], [0, 16.5, -1708],
];

/** Speed multiplier by z (the ride lingers in rooms and rushes in the air). */
const SPEED: Array<[number, number]> = [
  [60, 0.9], [-150, 0.9], [-175, 0.7], [-245, 0.65], [-262, 0.6], [-440, 0.6], [-462, 0.5], [-525, 0.55], [-560, 1.15], [-760, 1.25],
  [-805, 0.8], [-900, 0.85], [-930, 0.95], [-1200, 1.0], [-1240, 0.75], [-1400, 0.7], [-1440, 0.85], [-1640, 0.8], [-1712, 0.7],
];

export function makeCurve() {
  const c = new THREE.CatmullRomCurve3(PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  c.arcLengthDivisions = 6000;
  return c;
}

/** A road sample: position, ride progress and the unit "right" vector across the road. */
export interface RoadSample { x: number; y: number; z: number; u: number; rx: number; rz: number; }
export type RoadAt = (z: number) => RoadSample;

/** Builds a lookup from z to the road, valid because the road is monotonic in z. */
export function makeRoadLookup(curve: THREE.Curve<THREE.Vector3>, samples = 4000): RoadAt {
  const pts: RoadSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const r = new THREE.Vector3().crossVectors(t, up).normalize();
    pts.push({ x: p.x, y: p.y, z: p.z, u, rx: r.x, rz: r.z });
  }
  return (z: number) => {
    let lo = 0, hi = pts.length - 1;
    if (z >= pts[0].z) return pts[0];
    if (z <= pts[hi].z) return pts[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].z >= z) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const k = a.z === b.z ? 0 : (a.z - z) / (a.z - b.z);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z, u: lerp(a.u, b.u, k), rx: lerp(a.rx, b.rx, k), rz: lerp(a.rz, b.rz, k) };
  };
}

/** Speed multiplier for a z along the ride. */
export function speedAtZ(z: number) {
  for (let i = 0; i < SPEED.length - 1; i++) {
    const [za, a] = SPEED[i], [zb, b] = SPEED[i + 1];
    if (z <= za && z >= zb) return lerp(a, b, smoothstep(za, zb, z));
  }
  return z > SPEED[0][0] ? SPEED[0][1] : SPEED[SPEED.length - 1][1];
}

/** Helpers every set uses to place things relative to the path. */
export interface Road {
  curve: THREE.CatmullRomCurve3;
  at: RoadAt;
  /** ride progress at a z */
  u(z: number): number;
  /** world point at a lateral offset from the path (positive = right), at the path's height plus yOff */
  side(z: number, lat: number, yOff?: number): THREE.Vector3;
  /** yaw that makes local +z face the path from the given side (+1 right, -1 left) */
  faceRoad(z: number, side: number): number;
  /** yaw that makes local +z point along the direction of travel */
  along(z: number): number;
}

export function makeRoad(curve: THREE.CatmullRomCurve3): Road {
  const at = makeRoadLookup(curve);
  return {
    curve, at,
    u: (z) => at(z).u,
    side: (z, lat, yOff = 0) => { const p = at(z); return new THREE.Vector3(p.x + p.rx * lat, p.y + yOff, p.z + p.rz * lat); },
    faceRoad: (z, side) => { const p = at(z); return Math.atan2(-p.rx * side, -p.rz * side); },
    along: (z) => { const p = at(z); return Math.atan2(p.rz, -p.rx); },
  };
}
