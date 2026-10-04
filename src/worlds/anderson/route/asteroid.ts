/*
 * Route through Asteroid City, staged as a play. Keep the first and last points fixed (see hotel.ts).
 */
export const PTS: [number, number, number][] = [
  [0, 2, -1500], [0, 2, -1540], [0, 2, -1600], [0, 2, -1660], [0, 2, -1720], [0, 2, -1770], [0, 2, -1800],
];
export const SPEED: Array<[number, number]> = [[-1500, 0.85], [-1520, 0.8], [-1780, 0.8], [-1800, 0.9]];
export const CAPTIONS: Array<[number, string]> = [
  [-1518, 'Asteroid City, pop. 87'],
  [-1690, 'The stargazing'],
];
