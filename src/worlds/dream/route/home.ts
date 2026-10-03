/*
 * Route home at dawn. Keep the first point fixed (see garden.ts).
 *
 * The end of the fall, caught by the Catbus inside the cloud, down out of the sky to the garden
 * (ground at y 0), past the seed bed, and to the end, where the camera lets the Catbus go and rises.
 */
export const PTS: [number, number, number][] = [
  [0, 25, -2400], [0, 21, -2414], [0, 15, -2430], [0, 9, -2446], [0, 4, -2462], [0, 1, -2478], [0, 0, -2494], [-2, 0, -2512],
  [-3, 0, -2532], [-2, 0, -2552], [0, 0, -2572], [0, 0, -2590], [0, 0, -2606], [0, 0, -2620],
];

export const SPEED: Array<[number, number]> = [
  [-2400, 0.5], [-2430, 0.55], [-2490, 0.55], [-2540, 0.45], [-2590, 0.4], [-2620, 0.35],
];
