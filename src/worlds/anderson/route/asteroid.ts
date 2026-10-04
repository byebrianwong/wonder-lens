/*
 * Route through Asteroid City, staged as a play. Keep the first and last points fixed (see hotel.ts).
 * The line runs dead straight down the middle of the theatre and the stage (the town is laid out
 * symmetrically along it): slow through the reveal of the proscenium, steady through town, slow again for
 * the stargazing and the saucer.
 */
export const PTS: [number, number, number][] = [
  [0, 2, -1500], [0, 2, -1540], [0, 2, -1600], [0, 2, -1660], [0, 2, -1720], [0, 2, -1770], [0, 2, -1800],
];
export const SPEED: Array<[number, number]> = [
  [-1500, 0.85], [-1512, 0.68], [-1548, 0.7], [-1576, 0.82], [-1690, 0.8], [-1712, 0.48], [-1788, 0.48], [-1800, 0.9],
];
export const CAPTIONS: Array<[number, string]> = [
  [-1519, 'Asteroid City, pop. 87: a play in three acts'],
  [-1600, 'Act Two: the Junior Stargazer convention'],
  [-1716, 'Act Three: the stargazing'],
];
