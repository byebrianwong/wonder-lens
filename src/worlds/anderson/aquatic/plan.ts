import { clamp, fbm, smoothstep } from '../../../engine/math';

/*
 * Where everything in the Life Aquatic scene goes. The ride runs in -z along x = 0 (see route/aquatic.ts);
 * +x is the rider's right. The sea's surface is y = 0.
 *
 *  -2090 .. -2196  the reef: a canyon of candy coral, sloping down, with light shafts from the surface
 *  -2196 .. -2204  the drop-off: the reef's lip, and the abyss under it
 *  -2180 .. -2240  the electric jellyfish
 *  -2205 .. -2292  the deep, and the jaguar shark
 *  -2282 .. -2296  the far wall rises out of the abyss; the kelp forest grows on it, up to the light
 *  -2326           the Deep Search breaks the surface
 *  -2347 .. -2405  the Belafonte, alongside on the right, its port side cut open
 */

export const Z = {
  start: -2090, clear: -2108,
  arch: -2152, crabs: -2133, esteban: -2181,
  dropOff: -2198, jelly0: -2176, jelly1: -2244,
  shark0: -2203, shark1: -2296,
  wall0: -2282, wall1: -2298,
  kelp0: -2286, kelp1: -2352,
  /** where the camera comes up through the surface */
  surface: -2324,
  irisFull: -2414, end: -2420,
};

/** The Belafonte: centreline x, middle z, length along z (bow towards -z), beam, deck heights. */
export const SHIP = {
  x: 18.5, z: -2376, len: 58, beam: 11,
  /** the open (port) side, facing the ride */
  get face() { return this.x - this.beam / 2; },
  keel: -3.2, floor1: 0.5, floor2: 3.5, deck: 6.5,
  get stern() { return this.z + this.len / 2; },
  get bow() { return this.z - this.len / 2; },
};

/** The crabs' ledge: a flat-topped rock beside the path on the left. */
export const LEDGE = { x: -6.6, z: -2133, r: 3.4 };

/** The seabed's height, given the path's height at z (`py`). */
export function seabed(x: number, z: number, py: (z: number) => number) {
  const ax = Math.abs(x);
  const n = fbm(x * 0.045 + 13.1, z * 0.045, 3) - 0.5;
  const fine = fbm(x * 0.21, z * 0.21 + 7.7, 2) - 0.5;
  // the reef canyon: a valley under the path with walls of reef either side, rising towards the surface
  const zr = Math.max(z, Z.dropOff + 4);
  const centre = Math.min(py(zr) - 5.6, -6.4);
  const wall = 0.032 * Math.max(0, ax - 4) ** 2 * (0.9 + 0.5 * n);
  let reef = Math.min(centre + wall + n * 3 + fine * 0.8, -1.6 + n * 1.2);
  // the drop-off: the floor falls away into the abyss, except for the cliffs far out at the sides
  const abyss = -86 + n * 6;
  const cliffs = -86 + 74 * smoothstep(34, 52, ax + n * 10);
  const deep = Math.max(abyss, cliffs);
  const drop = smoothstep(Z.dropOff + 2, Z.dropOff - 6, z + n * 4 * smoothstep(8, 22, ax));
  reef = reef + (deep - reef) * drop;
  // the far wall, rising out of the abyss, and the sandy shelf beyond it under the Belafonte
  const shelf = Math.min(-15 - 9 * smoothstep(-2318, -2296, z) + 0.012 * Math.max(0, ax - 10) ** 2 * 0.3 + n * 3 + fine, -6);
  const rise = smoothstep(Z.wall0, Z.wall1, z + n * 5);
  return reef + (shelf - reef) * rise;
}

/** How far a point is into the deep (0 in the reef and the kelp, 1 in the abyss), for light and colour. */
export const deepness = (z: number) => smoothstep(Z.dropOff + 6, Z.dropOff - 18, z) * (1 - smoothstep(Z.wall0 + 6, Z.wall1 - 6, z));

/** 0 under the water, 1 once the camera is out of it. */
export const surfaced = (z: number) => clamp((Z.surface + 2 - z) / 4, 0, 1);
