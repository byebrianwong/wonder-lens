/*
 * Route home at dawn. Keep the first point fixed (see garden.ts).
 *
 * The end of the fall, caught by the Catbus inside the cloud, a glide down over the rice fields towards
 * the old house (ground at y 0 from z -2494), then along the same dirt lane as at the start (it bends 4 units
 * to the left, see garden/layout.ts `laneX`; the garden's layout is shifted by HOME_OZ = -2552 here), past
 * the house on the left (z -2530) and the seed bed on the right (z -2582). At z -2588 the camera lets the
 * Catbus go and rises; the path bends back to x 0 for the last point.
 */
export const PTS: [number, number, number][] = [
  [0, 25, -2400], [0, 21, -2414], [0, 15, -2430], [0, 9, -2446], [0, 4, -2462], [0, 1, -2478], [0, 0, -2494], [0, 0, -2512],
  [-0.9, 0, -2532], [-2.6, 0, -2552], [-4, 0, -2572], [-4, 0, -2590], [-2, 0, -2606], [0, 0, -2620],
];

export const SPEED: Array<[number, number]> = [
  [-2400, 0.5], [-2430, 0.55], [-2490, 0.55], [-2540, 0.45], [-2590, 0.4], [-2620, 0.4],
];
