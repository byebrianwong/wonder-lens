import * as THREE from 'three';
import { clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import type { Road } from '../common';

/*
 * The plan of Gabelmeister's Peak: where each part of the descent is (in z along the ride), the shape of the
 * bobsled run's ice channel, and the height of the snow everywhere. The ride runs in -z; the path's height is
 * the surface the toboggan's runners slide on (the ice, the trestle's deck, the snow), and in the air over
 * the ski jump it is the toboggan's flight.
 */

export const Z = {
  start: -560,
  /** the lid of the pastry box is lifted (the cover clears) */
  clear: -586,
  hut: -552,
  gate: -597,
  /** the summit's edge: the run tips over */
  tip: -604,
  /** the ice channel of the bobsled run */
  chan0: -603, chan1: -703,
  /** the ski jump: the trestle in-run, its lip, and where the flight touches down on the landing hill */
  ramp0: -699, lip: -729, touch: -772,
  /** the cliff edge, the drift below it, the end of the stretch */
  edge: -846, drift: -878, end: -880,
  /** the white cover begins / is full */
  coverIn: -858, coverFull: -870,
};

/** The channel's cross-section: half the floor's width, the corner radius, the wall's height and thickness. */
export const CH = { floor: 1.7, r: 0.85, wall: 1.5, thick: 0.4 };
/** Outer edge of the channel's walls from the path (where the snow bank takes over). */
export const CH_OUT = CH.floor + CH.r + CH.thick;

/** The observatory's knob, the chapel's terrace, the start hut. */
export const SPOT = {
  obs: new THREE.Vector3(30, 60.5, -624),
  chapel: new THREE.Vector3(-30, 55.6, -616),
  hut: new THREE.Vector3(0, 54, -552),
  station: new THREE.Vector3(44, 60.5, -612),
  /** the Grand Budapest, small and far below in the valley */
  hotel: new THREE.Vector3(0, -44, -1085),
  ibex: new THREE.Vector3(-25, 0, -808),
};
export const VALLEY = -62;
/** flat-topped crags: [top centre, radius of the flat top] */
const KNOBS: Array<[THREE.Vector3, number]> = [[SPOT.obs, 12.5], [SPOT.station, 7.5], [SPOT.chapel, 12]];

export interface Plan {
  road: Road;
  /** bank of the ice channel's floor at z (radians; positive raises the right side) */
  bank(z: number): number;
  /** the ground under the ski jump's in-run and flight (the knoll and the landing hill), at z */
  jumpGround(z: number): number;
  /** snow height at a point (the terrain; under the channel it is hidden below the ice) */
  height(x: number, z: number): number;
  /** height of the surface something sliding at lateral offset `lat` from the path stands on, at z */
  surface(z: number, lat: number): number;
  /** height of the channel's wall top on side s (-1 left, +1 right) above the path at z */
  wallTop(z: number, s: number): number;
  /** 0..1: how far the channel's walls have risen at z (they flare low where it starts and ends) */
  wallRise(z: number): number;
  /** the path point a world point is level with, and the point's offset to its right */
  foot(x: number, z: number): { p: { x: number; y: number; z: number; rx: number; rz: number }; lat: number };
}

export function makePlan(road: Road): Plan {
  // ---- the bank of the channel from the path's curvature, sampled every unit of z and smoothed ----
  const Z0 = -540, Z1 = -900, N = Z0 - Z1;
  const heading: number[] = [], raw: number[] = [], banks: number[] = [];
  for (let i = 0; i <= N; i++) {
    const p = road.at(Z0 - i);
    // the path's direction across the ground is the right vector turned a quarter back
    heading.push(Math.atan2(p.rz, p.rx));
  }
  for (let i = 0; i <= N; i++) {
    const a = road.at(Z0 - Math.max(0, i - 1)), b = road.at(Z0 - Math.min(N, i + 1));
    const ds = Math.max(0.5, Math.hypot(b.x - a.x, b.z - a.z));
    let d = heading[Math.min(N, i + 1)] - heading[Math.max(0, i - 1)];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    raw.push(d / ds);
  }
  for (let i = 0; i <= N; i++) {
    let s = 0, w = 0;
    for (let k = -8; k <= 8; k++) { const j = clamp(i + k, 0, N); const wk = 1 - Math.abs(k) / 9; s += raw[j] * wk; w += wk; }
    // a left turn (the heading of the right vector falling) banks the floor up on the right, the outside
    banks.push(clamp(-(s / w) * 30, -0.5, 0.5));
  }
  const bank = (z: number) => {
    if (z > Z.chan0 + 2 || z < Z.chan1 - 2) return 0;
    const f = clamp(Z0 - z, 0, N), i = Math.floor(f), k = f - i;
    const b = lerp(banks[i], banks[Math.min(N, i + 1)], k);
    // ease to level where the channel starts and ends
    return b * smoothstep(Z.chan0, Z.chan0 - 10, z) * smoothstep(Z.chan1, Z.chan1 + 10, z);
  };

  // ---- the ski jump: the knoll under the trestle and the landing hill that meets the flight ----
  const pathY = (z: number) => road.at(z).y;
  const jumpGround = (z: number) => {
    if (z > Z.ramp0 || z < Z.touch) return pathY(z);
    if (z > Z.lip) {
      // the trestle rises off the slope: the ground falls away under the in-run
      const k = smoothstep(Z.ramp0, Z.lip, z);
      return pathY(z) - k * 7.2;
    }
    const d = (z - Z.touch) / (Z.lip - Z.touch); // 1 at the lip, 0 at touchdown
    return pathY(z) - 7.2 * Math.pow(d, 1.35);
  };

  /** the surface of the run itself at a lateral offset (the channel's tilted floor, the deck, the snow) */
  const surface = (z: number, lat: number) => {
    const b = bank(z);
    const y = road.at(z).y;
    // the floor tilts across with the bank; past the floor's edge the corner curves up into the wall
    const l = Math.abs(lat), f = CH.floor;
    const inChan = z <= Z.chan0 && z >= Z.chan1;
    const corner = inChan && l > f ? CH.r - Math.sqrt(Math.max(0, CH.r * CH.r - Math.min(CH.r, l - f) ** 2)) : 0;
    return y + Math.sign(lat) * Math.min(l, f) * Math.sin(b) + corner;
  };
  const wallRise = (z: number) => smoothstep(Z.chan0 + 1, Z.chan0 - 7, z) * smoothstep(Z.chan1 - 1, Z.chan1 + 7, z);
  /** the outside of a curve gets a taller wall; both walls stand on the tilted floor's edges */
  const wallTop = (z: number, s: number) => {
    const sb = Math.sin(bank(z));
    return s * CH.floor * sb + lerp(0.9, CH.wall + Math.max(0, s * sb) * 2.6, wallRise(z));
  };

  // ---- the snow ----
  const zClamp = (z: number) => clamp(z, Z.end, Z0);
  /** the path point a point is level with (its foot, square across the path) and the offset from it */
  const foot = (x: number, z: number) => {
    let p = road.at(zClamp(z));
    let lat = (x - p.x) * p.rx;
    for (let i = 0; i < 2; i++) {
      p = road.at(zClamp(z - p.rz * lat));
      lat = (x - p.x) * p.rx + (z - p.z) * p.rz;
    }
    return { p, lat };
  };
  const height = (x: number, z: number) => {
    const { p, lat } = foot(x, z);
    const al = Math.abs(lat);
    const n1 = fbm(x * 0.045, z * 0.045, 3), n2 = fbm(x * 0.012 + 7, z * 0.012 - 3, 4);
    const py = p.y;
    let near: number;
    if (z > Z.tip) {
      // the summit: a plateau round the start, rising behind into the peak
      near = 54 + (al > 20 ? (al - 20) * 0.12 : 0) + n1 * 0.6;
      if (z > Z.hut + 6) near += Math.pow(Math.max(0, z - (Z.hut + 6)), 1.25) * 0.9 * (0.7 + 0.6 * n2);
    } else if (z > Z.chan1) {
      // the bobsled run: the channel sits in a trench; the banks come up just under its wall tops and rise
      // on into the slope
      if (al < CH_OUT - 0.1) near = py - 1.6;
      else {
        const top = wallTop(p.z, Math.sign(lat)) - 0.3 - 0.25 * smoothstep(CH_OUT, CH_OUT + 3, al);
        const slope = 1.6 + 2.2 * smoothstep(6, 26, al) + n1 * 1.4 * smoothstep(6, 14, al);
        near = py + lerp(top, slope, smoothstep(CH_OUT + 1.5, 12, al));
      }
    } else if (z > Z.touch) {
      // the ski jump: the knoll and landing hill, with banks either side for the spectators' stands
      const g = jumpGround(z);
      near = g - 0.1 + smoothstep(9, 15, al) * 2.6 + smoothstep(22, 30, al) * 3 + n1 * 0.8 * smoothstep(8, 16, al);
    } else if (z > Z.edge) {
      // the outrun across the snowfield
      near = py - 0.12 + smoothstep(3, 18, al) * 1.6 + n1 * 1.4 * smoothstep(4, 14, al);
    } else {
      // over the edge: a deep chasm, with a great drift of snow piled below the edge where the run ends
      const edgeY = 7.9 + smoothstep(5, 30, al) * 1.6;
      const fall = smoothstep(Z.edge, Z.edge - 4, z);
      const chasm = lerp(edgeY, VALLEY + 22, fall);
      const dx = x / 26, dz = (z - Z.drift) / 24;
      const r2 = dx * dx + dz * dz;
      const drift = r2 < 1 ? -3.8 - 26 * r2 * r2 + n1 * 1.5 : -60;
      near = Math.max(chasm, drift);
      if (z < Z.edge - 3) near = Math.max(drift, VALLEY + 22 - (Z.edge - 3 - z) * 0.4);
    }
    // away from the run the mountain falls into the valleys on either side
    const crest = near;
    const fallAway = al < 28 ? 0 : 0.5 * (al - 28) + 0.0042 * (al - 28) ** 2;
    let h = crest - fallAway * (z > Z.tip + 30 ? 0.35 : 1);
    // the valley floor, with a few hummocks
    h = Math.max(h, VALLEY + n2 * 10);
    // the far mountains on either side of the valley
    const side = smoothstep(240, 420, Math.abs(x));
    h = Math.max(h, VALLEY + side * (150 + n2 * 90));
    // crags poking through the snow beside the run
    h += (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 3 * smoothstep(40, 90, al);
    // the summit's crags: the observatory's knob with the cable car station, and the chapel's terrace
    for (const [k, r] of KNOBS) {
      const d = Math.hypot(x - k.x, z - k.z);
      if (d < r + 16) h = Math.max(h, k.y - 0.02 - 34 * Math.pow(smoothstep(r, r + 16, d), 0.7) + (d > r ? n1 * 1.5 : 0));
    }
    return h;
  };

  return { road, bank, jumpGround, height, surface, wallTop, wallRise, foot };
}
