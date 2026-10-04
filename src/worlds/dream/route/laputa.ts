/*
 * Route through Laputa. Keep the first and last points fixed (see garden.ts).
 *
 * Out of the storm wall into the calm eye, a glide down onto the island's garden terrace (landing on the rim
 * at about z -1295, y 48.7), through the first gateway onto the inner terrace (y 50), under the edge of the
 * great tree's crown and an arching root, past the robot gardener, out through the second gateway, and off
 * the far edge (z -1454) beside the stream's waterfall, falling towards the cloud below.
 */
export const PTS: [number, number, number][] = [
  [0, 53, -1230], [0, 53, -1245], [0, 52, -1262], [0, 50.2, -1280], [1, 48.6, -1298], [4, 48.2, -1314], [5, 49.6, -1330], [3, 50, -1348],
  [-2, 50.2, -1370], [-6, 50.2, -1394], [-5, 49.8, -1412], [-2, 48.4, -1428], [0, 48, -1442], [0, 48, -1452],
  // off the edge
  [0, 43.6, -1464], [0, 36.5, -1476], [0, 29.2, -1488], [0, 22, -1500], [0, 16, -1510],
];

export const SPEED: Array<[number, number]> = [
  [-1230, 0.8], [-1250, 0.75], [-1295, 0.65], [-1395, 0.58], [-1418, 0.58], [-1440, 0.62],
  // slow off the edge, so there is time to look back at the underside and the crystal while falling past
  [-1452, 0.6], [-1478, 0.6], [-1494, 0.85],
];
