/*
 * Route through the garden scene: [x, y, z] control points and [z, speed multiplier] keys.
 * The ride runs in -z. Keep the first point and the last point where they are: the neighbouring
 * scenes start and end there. Everything in between may move to fit the scenery.
 *
 * On foot from the gate to where the Catbus waits (z 60 to 40), then on the Catbus past the house and
 * the seed bed, up the tree that grows from it, across the top of the crown, and off into the air.
 */
export const PTS: [number, number, number][] = [
  [0, 0, 60], [0, 0, 52], [0, 0, 44], [0, 0, 36], [-1, 0, 24], [-2, 0, 10], [-3, 0, -4], [-4, 0, -20], [-4, 0, -34],
  // up a root and the great limbs of the tree
  [-5, 1.5, -50], [-8, 8, -64], [-9, 16, -78], [-4, 24, -92], [6, 31, -104], [16, 38, -116], [20, 46, -130], [16, 54, -144],
  [8, 61, -158], [2, 67, -172],
  // the top of the crown, above the clouds, past Totoro's branch
  [0, 72, -186], [0, 73, -198], [0, 71, -212], [0, 64, -230],
];

export const SPEED: Array<[number, number]> = [
  [60, 0.22], [44, 0.22], [38, 0.4], [-20, 0.45], [-40, 0.62], [-60, 0.75], [-160, 0.75], [-175, 0.5], [-198, 0.5], [-215, 0.95],
];
