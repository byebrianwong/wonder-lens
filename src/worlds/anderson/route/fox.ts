/*
 * Route under the hill (Fantastic Mr. Fox). Keep the first and last points fixed (see hotel.ts).
 *
 * Straight down the middle of every room, so each one is framed square to the track: level through the
 * Fox family's home and the underground town, down into Bean's cellar where the cider has flooded the
 * floor, then a steep climb up a tunnel and out onto the hilltop (see fox/plan.ts).
 */
export const PTS: [number, number, number][] = [
  [0, -4, -880], [0, -5.3, -893], [0, -6, -906], [0, -6, -920], [0, -6, -944], [0, -6, -958],
  [0, -6.4, -972], [0, -6.6, -994], [0, -6.8, -1014], [0, -7.7, -1030], [0, -8.7, -1046], [0, -8.75, -1064],
  [0, -8.2, -1080], [0, -6.2, -1092], [0, -2.2, -1105], [0, 1.2, -1117], [0, 2, -1127], [0, 2, -1150], [0, 2, -1180],
];
export const SPEED: Array<[number, number]> = [
  [-880, 1.0], [-898, 0.7], [-910, 0.55], [-950, 0.55], [-962, 0.7], [-974, 0.6], [-1015, 0.6], [-1026, 0.55],
  [-1076, 0.6], [-1090, 0.8], [-1112, 0.75], [-1124, 0.5], [-1160, 0.5], [-1180, 0.85],
];
export const CAPTIONS: Array<[number, string]> = [
  [-906, "The Fox family's burrow, under the tree"],
  [-1024, "Bean's cider cellar"],
  [-1121, 'The top of the hill, at night'],
];
