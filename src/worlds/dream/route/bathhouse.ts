/*
 * Route through the bathhouse. Keep the first and last points fixed (see garden.ts).
 *
 * Out of the castle's door onto the red bridge (deck at y 6), across to the forecourt, right round the
 * front corner of the bathhouse, down one steep flight of outside stairs along the podium's right wall
 * (x 35, about 29 degrees), along the boardwalk at the bottom (y -16) to the boiler room door (z -1994),
 * across the boiler room past Kamaji, up the ramp under the high window, and out of it on Haku's back.
 * The scenery in ../bathhouse/plan.ts is placed to fit these points.
 */
export const PTS: [number, number, number][] = [
  [0, 6, -1792], [0, 6, -1802], [0, 6, -1820], [0, 6, -1844], [0, 6, -1866],
  // off the bridge and right across the forecourt, round the bathhouse's front corner
  [3, 6, -1880], [12, 6, -1890], [24, 6, -1898], [33.5, 6, -1906], [35, 5.3, -1915],
  // the stairs
  [35, 0.6, -1924], [35, -5, -1934], [35, -10.6, -1944], [35, -14.8, -1953], [35, -16, -1962],
  // the boardwalk to the boiler room door
  [35, -16, -1974], [35, -16, -1986], [34, -16, -1998],
  // across the boiler room, up the ramp under the high window
  [24, -16, -2008], [15, -16, -2020], [12, -16, -2033], [10, -14.5, -2046],
  // on Haku, out of the window
  [7, -11, -2060], [3, -5, -2075], [0, 2, -2090],
];

export const SPEED: Array<[number, number]> = [
  [-1792, 0.45], [-1806, 0.5], [-1866, 0.52], [-1882, 0.62], [-1908, 0.55], [-1960, 0.55], [-1985, 0.5], [-2036, 0.5], [-2060, 0.75], [-2080, 0.9],
];
