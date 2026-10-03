/*
 * Route through the Forest Spirit's wood. Keep the first and last points fixed (see garden.ts).
 *
 * Down onto the forest floor, along a fallen giant cedar, down to the spirit pool and across its
 * shallows (water at y 0), then up the roots and trunk of the tallest cedar into the mist.
 */
export const PTS: [number, number, number][] = [
  [-3, 5.5, -610], [-3.5, 3, -624], [-4, 2.5, -640], [-2, 2.5, -660], [2, 4, -684], [5, 7, -706], [4, 7.5, -726], [0, 4, -744],
  [-3, 1.2, -762], [-2, 0.4, -780], [2, 0.4, -805], [4, 0.4, -830], [1, 0.5, -852], [-2, 1.5, -868],
  // up the tallest cedar into the mist
  [-2, 6, -882], [-1, 15, -895], [0, 26, -907], [0, 36, -916], [0, 40, -920],
];

export const SPEED: Array<[number, number]> = [
  [-610, 0.95], [-640, 0.85], [-740, 0.8], [-760, 0.68], [-860, 0.68], [-880, 0.85],
];
