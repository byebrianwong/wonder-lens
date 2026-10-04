/*
 * Route through the garden scene: [x, y, z] control points and [z, speed multiplier] keys.
 * The ride runs in -z. Keep the first point and the last point where they are: the neighbouring
 * scenes start and end there. Everything in between may move to fit the scenery.
 *
 * On foot down the dirt lane to where the Catbus waits (z 60 to 40), then on the Catbus slowly along the
 * lane past the house and close by the dancers in front of the seed bed (z -20 to -25; the lane bends 4
 * units to the left, see garden/layout.ts `laneX`). The tree erupts from the bed (z -30) as the rider
 * comes up to it (z -21); at z -42 its great limb bursts
 * out of the lane ahead and the path runs along its top, winding up to the top of the crown (y 72 at
 * z -186), past Totoro's bough, and off into the air at z -207.
 */
export const PTS: [number, number, number][] = [
  [0, 0, 60], [0, 0, 52], [0, 0, 44], [0, 0, 36], [-0.6, 0, 24], [-1.8, 0, 10], [-3.1, 0, -4], [-4, 0, -20], [-4, 0, -32],
  [-4.4, 0, -42],
  // up the great limb of the tree
  [-6, 2.7, -54], [-8, 8.7, -66], [-9, 16, -79], [-4, 24, -92], [6, 31, -104], [16, 38, -116], [20, 46, -130], [16, 54, -144],
  [8, 61, -158], [2, 67, -172],
  // the top of the crown, above the clouds, past Totoro's bough, and the leap
  [0, 72, -186], [0, 73, -198], [0, 71, -212], [0, 64, -230],
];

export const SPEED: Array<[number, number]> = [
  [60, 0.22], [44, 0.22], [38, 0.4], [-22, 0.4], [-46, 0.58], [-68, 0.78], [-150, 0.78], [-172, 0.42], [-200, 0.42], [-215, 0.95],
];
