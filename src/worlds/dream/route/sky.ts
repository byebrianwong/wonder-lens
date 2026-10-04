/*
 * Route above the clouds. Keep the first and last points fixed (see garden.ts).
 *
 * Off the top of the tallest cedar, then the Catbus bounds across the cloud tops at sunrise: each low
 * point of the path (y 44.4) is where its paws come down on a cloud, each high point (y 47.6) is the
 * middle of a leap. After the last bound it makes one long leap up into the wall of the Dragon's Nest
 * storm, whose outer face is reached at about z -1198.
 */
export const PTS: [number, number, number][] = [
  [0, 40, -920], [0, 44, -930],
  [1, 47.2, -940], [2, 44.4, -954], [3, 47.6, -968], [3, 44.4, -982], [1, 47.6, -996], [-2, 44.4, -1010], [-5, 47.6, -1024],
  [-6, 44.4, -1038], [-5, 47.6, -1052], [-3, 44.4, -1066], [0, 47.6, -1080], [3, 44.4, -1094], [4, 47.6, -1108], [4, 44.4, -1122],
  [2, 47.6, -1136], [1, 44.8, -1150],
  // the long leap into the storm wall
  [0, 48.6, -1166], [0, 51, -1190], [0, 52.4, -1212], [0, 53, -1230],
];

/** z of the low points above, where the paws touch a cloud top (the set finds the exact spots on the curve). */
export const TOUCH_Z = [-954, -982, -1010, -1038, -1066, -1094, -1122, -1150];

export const SPEED: Array<[number, number]> = [
  [-920, 0.9], [-945, 0.98], [-1140, 0.98], [-1180, 1.08], [-1212, 0.95],
];
