/*
 * Route through the bathhouse. Keep the first and last points fixed (see garden.ts).
 *
 * Out of the castle's door onto the red bridge (deck at y 6), across to the bathhouse, round its side,
 * down the steep outside stairs to the boiler room (floor at about y -16), through it, and up out of
 * its roof on Haku's back.
 */
export const PTS: [number, number, number][] = [
  [0, 6, -1792], [0, 6, -1802], [0, 6, -1820], [0, 6, -1845], [0, 6, -1870], [4, 6, -1890], [14, 5, -1904], [22, 1, -1920],
  [25, -5, -1942], [26, -11, -1962], [25, -16, -1982], [22, -16, -1998], [18, -16, -2014], [14, -16, -2030], [10, -14.5, -2045],
  [6, -11, -2060], [3, -5, -2075], [0, 2, -2090],
];

export const SPEED: Array<[number, number]> = [
  [-1792, 0.45], [-1806, 0.5], [-1875, 0.55], [-1900, 0.7], [-1985, 0.6], [-2040, 0.6], [-2075, 0.9],
];
