/*
 * Route over Trash Island (Isle of Dogs). Keep the first and last points fixed (see hotel.ts).
 *
 * The rider hangs in a trash gondola: level through the loading station, up the cable over the trash
 * mountains (two humps over the pylons at z -1945 and -2008, a sag between), then the grip lets go at the
 * island's edge (z -2034) and the car dives into the bay.
 */
export const PTS: [number, number, number][] = [
  [0, 2, -1800], [0, 2.2, -1812], [0, 3.6, -1828], [0, 9, -1848], [0, 16.5, -1868], [0, 23, -1890], [0, 28, -1916],
  [0, 30.6, -1945], [0, 29.6, -1976], [0, 31.4, -2008], [0, 31.2, -2028], [0, 28.6, -2042], [0, 19, -2058], [0, 7, -2074], [0, -1, -2090],
];
export const SPEED: Array<[number, number]> = [
  [-1800, 0.9], [-1816, 0.7], [-1832, 0.62], [-2020, 0.62], [-2034, 0.85], [-2050, 1.5], [-2080, 1.6], [-2090, 0.9],
];
export const CAPTIONS: Array<[number, string]> = [
  [-1828, 'Trash Island'],
  [-1930, 'Over the trash mountains, with the dogs below'],
  [-2036, 'The cable lets go'],
];
