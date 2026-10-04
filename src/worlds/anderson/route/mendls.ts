/*
 * Route through Mendl's. Keep the first and last points fixed (see hotel.ts).
 *
 * The pastry box rides a conveyor belt at counter height (y 54) down the middle of the giant kitchen, bends
 * left round the tower of Courtesans in the octagonal rotunda (centre z -473), comes back onto the axis
 * through the hatch into the shop, and ends at Agatha's packing table under the storefront window, where the
 * lid closes. See mendls/plan.ts.
 */
export const PTS: [number, number, number][] = [
  [0, 54, -300], [0, 54, -340], [0, 54, -385], [0, 54, -424],
  [-3.2, 54, -443], [-11.5, 54, -461], [-14, 54, -473], [-11.5, 54, -485], [-3.2, 54, -503],
  [0, 54, -522], [0, 54, -541], [0, 54, -560],
];

/** Speed multiplier keys [z, k]: slow through the covers so the cards read, and a little slower at the sights. */
export const SPEED: Array<[number, number]> = [
  [-300, 0.6], [-322, 0.62], [-360, 0.58], [-410, 0.55], [-450, 0.5], [-495, 0.52], [-520, 0.55], [-545, 0.64], [-560, 0.8],
];

/** Story beats [z, text]. */
export const CAPTIONS: Array<[number, string]> = [
  [-316, "Mendl's, at the size of a pastry"],
  [-447, 'The tower of Courtesans au chocolat'],
  [-508, 'Agatha packs the last box'],
];
