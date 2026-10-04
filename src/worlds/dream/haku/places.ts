/*
 * Where things are in the scene on Haku's back (world units; the ride runs in -z).
 */

/**
 * The sea's surface. It is the same water the bathhouse scene stands in (WATER in ../bathhouse/plan.ts), so
 * Haku leaves the boiler room's back window (z -2066, about y -9) over the sea it continues.
 */
export const SEA_Y = -30;

/** The flooded railway line: a straight line slightly across the sea, to the right of the rider's path. It comes out from behind the boiler room. */
export const trackX = (z: number) => 30 + (z + 2150) * 0.05;
export const TRACK = { z0: -2070, z1: -2720 };

/** The scales burst: the body comes apart between these z (tail first), the head goes at the end with a flash. */
export const BURST = { z0: -2286, z1: -2302 };
/** The rider's mount changes from Haku to falling at this z (set by the world). */
export const FALL_Z = -2302;

/** Ponyo and her sisters race in the moon's path on the water over this stretch (they rise at z0 and dive by z1). */
export const PONYO = { z0: -2094, z1: -2196 };

/** The sea train is in view over this stretch (it is always somewhere on its line). */
export const TRAIN = { z0: -2110, z1: -2230 };

/**
 * The bathhouse scene is hidden once the rider passes z -2080; from `swapZ` on this scene shows a stand-in in
 * the same place: the bathhouse (buildBathhouse at the bathhouse scene's position and size), and its podium
 * and the boiler room wing as plain blocks. Numbers copied from ../bathhouse/plan.ts.
 */
export const BATHHOUSE = {
  swapZ: -2079, x: 0, y: 6, z: -1928, s: 1.25,
  podium: [{ x0: -40, x1: 39.5, z0: -1879, z1: -1912 }, { x0: -34, x1: 31, z0: -1912, z1: -1994 }], bottom: -33,
  wing: { x0: -2, x1: 44, z0: -1994, z1: -2066, roof: 4.2 },
};
/**
 * The water surface is drawn this far below SEA_Y, so where the bathhouse scene's own (opaque) water is drawn
 * too, at SEA_Y, theirs covers ours instead of the two fighting.
 */
export const WATER_DROP = 0.25;

/** Small islands, each with a lone house (or only trees). `top` is the height of its flat top above the sea. */
export const ISLANDS: Array<{ x: number; z: number; r: number; top: number; house: boolean }> = [
  { x: -48, z: -2128, r: 10, top: 3.2, house: true },
  { x: 68, z: -2162, r: 13, top: 4.2, house: true },
  { x: -95, z: -2208, r: 16, top: 5.0, house: true },
  { x: -40, z: -2268, r: 9, top: 3.0, house: true },
  { x: 60, z: -2252, r: 8, top: 2.6, house: false },
  { x: 125, z: -2112, r: 18, top: 5.5, house: true },
  { x: -150, z: -2150, r: 20, top: 6.0, house: true },
  { x: -72, z: -2322, r: 12, top: 3.6, house: true },
  { x: 78, z: -2338, r: 14, top: 4.0, house: true },
  { x: -66, z: -2072, r: 13, top: 4.0, house: true },
  { x: 74, z: -2084, r: 11, top: 3.4, house: true },
  { x: -22, z: -2352, r: 6, top: 2.2, house: false },
  { x: -118, z: -2275, r: 7, top: 2.4, house: false },
  { x: 160, z: -2230, r: 12, top: 4.0, house: true },
  { x: -200, z: -2110, r: 16, top: 5.0, house: false },
];

/** Is a point in the stretch of water where Ponyo's school swims (kept clear of islands and lamps)? */
export const inPonyoWater = (x: number, z: number) => x > -36 && x < 14 && z < -2096 && z > -2260;
