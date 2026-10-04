/*
 * Route through the curtain call. Keep the first point fixed (it joins the Life Aquatic scene); the last
 * point is the end of the ride.
 *
 * Under the iris the sub becomes the train; the iris opens in the theatre's centre aisle (floor y 2), the train
 * rolls down the aisle between the stalls towards the closed curtain, which rises as it comes; it crosses the
 * orchestra pit on a ramp up to the stage (y 3.4), passes under the proscenium and stops at centre stage in
 * front of the cast, lined up at z -2620. See finale/plan.ts.
 */
export const PTS: [number, number, number][] = [
  [0, 0.6, -2420], [0, 2, -2436], [0, 2, -2452], [0, 2, -2490], [0, 2, -2530], [0, 2, -2542],
  [0, 3.4, -2554], [0, 3.4, -2566], [0, 3.4, -2586], [0, 3.4, -2604],
];

export const SPEED: Array<[number, number]> = [[-2420, 0.8], [-2444, 0.62], [-2530, 0.55], [-2560, 0.5], [-2604, 0.45]];

export const CAPTIONS: Array<[number, string]> = [
  [-2446, 'Curtain call'],
];
