/*
 * Route on Haku's back. Keep the first and last points fixed (see garden.ts).
 *
 * Up out of the boiler room roof, out over the night sea of spirits (sea at y 0), climbing high, where
 * the scales burst (about z -2300), then a slow fall towards the cloud below.
 */
export const PTS: [number, number, number][] = [
  [0, 2, -2090], [0, 10, -2104], [0, 20, -2122], [2, 28, -2146], [8, 32, -2176], [12, 34, -2206], [4, 40, -2236], [-6, 50, -2264],
  [-4, 60, -2288], [-2, 62, -2302], [0, 56, -2322], [0, 46, -2342], [0, 37, -2362], [0, 30, -2382], [0, 25, -2400],
];

export const SPEED: Array<[number, number]> = [
  [-2090, 0.9], [-2110, 1.15], [-2270, 1.15], [-2296, 0.55], [-2385, 0.5],
];
