/*
 * Route through the Grand Budapest Hotel scene. Keep the first and last points fixed: the first is where the
 * ride starts, the last is where the Mendl's scene joins on. Reshape the points in between freely, but keep z
 * falling (the ride runs in -z and every lookup assumes z decreases along the path).
 *
 * Draft: Nebelsbad station platform, the funicular straight up the cliff, the hotel lobby, the grand staircase.
 */
export const PTS: [number, number, number][] = [
  [0, 2, 60], [0, 2, 30], [0, 2, 0], [0, 2, -24], [0, 2.6, -40], [0, 10, -60], [0, 24, -95], [0, 38, -130], [0, 45.4, -150],
  [0, 46, -162], [0, 46, -200], [0, 46, -240], [0, 46, -256], [0, 50, -273], [0, 54, -290], [0, 54, -300],
];

/** Speed multiplier keys [z, k] (k about 0.4 to 1.6; the ride eases between them). */
export const SPEED: Array<[number, number]> = [[60, 0.85], [-30, 0.8], [-45, 0.7], [-150, 0.7], [-165, 0.55], [-255, 0.55], [-300, 0.6]];

/** Story beats [z, text]: shown on screen as the ride passes, and used by the Storybook ride views. */
export const CAPTIONS: Array<[number, string]> = [
  [56, 'Nebelsbad, Republic of Zubrowka, 1932'],
  [-62, 'The funicular to the Grand Budapest'],
  [-168, 'The lobby of the Grand Budapest Hotel'],
];
