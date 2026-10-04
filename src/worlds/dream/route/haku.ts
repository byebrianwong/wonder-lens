/*
 * Route on Haku's back. Keep the first and last points fixed (see garden.ts).
 *
 * Out of the boiler room's back window and over the night sea of spirits (sea at y -30, the same water the
 * bathhouse stands in): a gentle swoop down to about 27 above the water past Ponyo racing in the moon's path, then a
 * long climb with the sea train far below on the right, to the top (y 62, z -2302) where the scales burst,
 * then a slow fall towards the floor of cloud (y 15-30).
 */
export const PTS: [number, number, number][] = [
  [0, 2, -2090], [0, 1, -2108], [1, -3, -2130], [3, -2, -2150], [8, 6, -2176], [12, 17, -2204], [6, 29, -2232], [-4, 41, -2258],
  [-5, 52, -2280], [-3, 59, -2294], [-2, 62, -2302], [0, 56, -2322], [0, 46, -2342], [0, 37, -2362], [0, 30, -2382], [0, 25, -2400],
];

export const SPEED: Array<[number, number]> = [
  [-2090, 0.9], [-2104, 1.0], [-2160, 1.0], [-2250, 1.05], [-2280, 0.5], [-2300, 0.42], [-2318, 0.45], [-2340, 0.5], [-2385, 0.5],
];
