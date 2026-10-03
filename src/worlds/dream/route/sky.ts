/*
 * Route above the clouds. Keep the first and last points fixed (see garden.ts).
 *
 * The Catbus bounds across a floor of cloud tops (about y 42 to 44) at sunrise, then heads into the
 * wall of the Dragon's Nest storm. The wall's inner face is reached at about z -1225.
 */
export const PTS: [number, number, number][] = [
  [0, 40, -920], [0, 44, -930], [2, 45.5, -950], [4, 46.5, -980], [0, 44.5, -1010], [-6, 46, -1040], [-4, 44.5, -1070], [2, 47, -1100],
  [4, 45.5, -1130], [0, 48, -1160], [0, 50, -1190], [0, 52, -1212], [0, 53, -1230],
];

export const SPEED: Array<[number, number]> = [
  [-920, 0.9], [-940, 1.05], [-1150, 1.05], [-1195, 0.9],
];
