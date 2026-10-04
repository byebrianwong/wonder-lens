/*
 * Route under the sea and up to the Belafonte (The Life Aquatic). Keep the first and last points fixed
 * (see hotel.ts).
 *
 *  -2090  the gondola's splash: the Deep Search, just under the surface (the cover hides the change)
 *  -2108  down a reef canyon in candy colours, under the coral arch with the paisley octopus
 *  -2196  over the drop-off into the deep: the electric jellyfish, then the jaguar shark
 *  -2290  up the far wall through the kelp towards the light, under the Belafonte's keel
 *  -2331  out through the surface at sundown, along the Belafonte's cutaway side to the bow
 */
export const PTS: [number, number, number][] = [
  [0, -1, -2090], [0, -3.4, -2106], [0, -7, -2126], [0, -10.6, -2148], [0, -14, -2170], [0, -18.5, -2192],
  [0, -23.5, -2212], [0, -25.6, -2234], [0, -25.8, -2256], [0, -23.6, -2276], [0, -17.5, -2294], [0, -9.5, -2309],
  [0, -3.2, -2320], [0, 0.2, -2332], [0, 0.6, -2346], [0, 0.6, -2370], [0, 0.6, -2396], [0, 0.6, -2420],
];

/** The ride lingers in the deep with the shark and along the Belafonte. */
export const SPEED: Array<[number, number]> = [
  [-2090, 0.85], [-2108, 0.66], [-2186, 0.62], [-2206, 0.48], [-2230, 0.4], [-2272, 0.42], [-2290, 0.58], [-2326, 0.58],
  [-2340, 0.5], [-2404, 0.5], [-2420, 0.7],
];

export const CAPTIONS: Array<[number, string]> = [
  [-2110, 'Under the sea in the Deep Search'],
  [-2226, 'The jaguar shark. I wonder if it remembers me.'],
  [-2338, 'The Belafonte, at sundown'],
];
