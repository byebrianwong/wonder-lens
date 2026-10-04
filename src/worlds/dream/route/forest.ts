/*
 * Route through the Forest Spirit's wood. Keep the first and last points fixed (see garden.ts).
 *
 * Down off the last pole onto a mossy root mound between the two great cedars at the edge of the wood,
 * along the forest floor, up onto a fallen giant cedar (the points from z -662 to -726 lie on one straight
 * line, the log's axis), a leap off its broken end, down the bank to the spirit pool and along its shallows
 * (water at y 0, paws at y 0.4), then up the great root that rises out of the pool and climbs to the trunk
 * of the tallest cedar (no steeper than about 32 degrees), into the mist.
 */
export const PTS: [number, number, number][] = [
  [-3, 5.5, -610], [-3.6, 3.7, -622], [-4, 2.7, -636], [-3.2, 2.5, -649],
  // along the fallen cedar
  [-1.6, 3.0, -662], [0.37, 4.48, -683], [2.34, 5.95, -704], [4.4, 7.5, -726],
  // off its broken end and down the bank
  [3.0, 6.2, -739], [0.6, 3.6, -751], [-1.2, 1.3, -762],
  // the shallows of the spirit pool
  [-1.4, 0.4, -775], [1, 0.4, -790], [3, 0.4, -805], [2.5, 0.4, -820], [1, 0.45, -832],
  // up the great root of the tallest cedar into the mist
  [0.4, 1.2, -841], [0, 3.0, -850], [-0.3, 6.4, -859], [-0.4, 10.6, -868], [-0.4, 15.4, -877], [-0.3, 20.6, -886],
  [-0.2, 26.0, -895], [0, 31.2, -904], [0, 35.8, -912], [0, 40, -920],
];

export const SPEED: Array<[number, number]> = [
  [-610, 0.95], [-640, 0.85], [-700, 0.8], [-740, 0.75], [-766, 0.58], [-836, 0.58], [-860, 0.75], [-880, 0.85],
];
