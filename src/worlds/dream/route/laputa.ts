/*
 * Route through Laputa. Keep the first and last points fixed (see garden.ts).
 *
 * Out of the storm wall into the calm eye, a glide down onto the island's outer terrace (about y 48),
 * through the gardens and ruins past the robot gardener, and off the far edge beside a waterfall.
 */
export const PTS: [number, number, number][] = [
  [0, 53, -1230], [0, 53, -1245], [0, 52, -1262], [0, 50, -1280], [1, 48.5, -1298], [5, 48, -1318], [4, 48.5, -1345], [-2, 50, -1370],
  [-6, 50, -1395], [-4, 49, -1420], [0, 48, -1440], [0, 48, -1452],
  // off the edge
  [0, 44, -1468], [0, 34, -1484], [0, 24, -1498], [0, 16, -1510],
];

export const SPEED: Array<[number, number]> = [
  [-1230, 0.8], [-1250, 0.75], [-1295, 0.62], [-1440, 0.62], [-1458, 0.95],
];
