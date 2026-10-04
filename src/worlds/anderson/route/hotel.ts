/*
 * Route through the Grand Budapest Hotel scene. Keep the first and last points fixed: the first is where the
 * ride starts, the last is where the Mendl's scene joins on. Reshape the points in between freely, but keep z
 * falling (the ride runs in -z and every lookup assumes z decreases along the path).
 *
 * Nebelsbad station (level, y 2) and the viaduct over the model town; the funicular's trestle straight up to
 * the cliff top (about 0.4 rise per unit); the hotel's terrace and the lobby (level, y 46); the grand
 * staircase (straight, 25 steps) to the landing at y 54. See hotel/plan.ts.
 */
export const PTS: [number, number, number][] = [
  [0, 2, 60], [0, 2, 30], [0, 2, 0], [0, 2, -24], [0, 2.6, -40], [0, 10, -60], [0, 24, -95], [0, 38, -130], [0, 45.4, -150],
  [0, 46, -162], [0, 46, -200], [0, 46, -240], [0, 46, -256], [0, 48.35, -266], [0, 51.65, -280], [0, 54, -290], [0, 54, -300],
];

/** Speed multiplier keys [z, k] (k about 0.4 to 1.6; the ride eases between them). */
export const SPEED: Array<[number, number]> = [
  [60, 0.8], [10, 0.8], [-30, 0.75], [-45, 0.7], [-135, 0.7], [-152, 0.55], [-170, 0.5], [-250, 0.5], [-262, 0.48], [-280, 0.55], [-300, 0.6],
];

/** Story beats [z, text]: shown on screen as the ride passes, and used by the Storybook ride views. */
export const CAPTIONS: Array<[number, string]> = [
  [48, 'Nebelsbad, Republic of Zubrowka, 1932'],
  [-58, 'Up the funicular to the Grand Budapest'],
  [-170, 'The lobby, and M. Gustave at the concierge desk'],
];
