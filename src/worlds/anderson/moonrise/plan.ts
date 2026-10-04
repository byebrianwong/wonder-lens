/*
 * Where everything in New Penzance stands (Moonrise Kingdom). The route in ../route/moonrise.ts is shaped to
 * fit these places, so change both together.
 *
 *  z -1192  the whip pan clears on Summer's End, the Bishops' red house, shut, straight ahead
 *  z -1193  the house parts down the middle like a dollhouse on stage wagons and the train runs between
 *           its two halves: the rooms pass on both sides like a lateral tracking shot
 *  z -1272  the lighthouse at the end of the point, with Suzy on its gallery; the track swings round it
 *  z -1306  under the gate of Camp Ivanhoe: tents in rows on platforms, the flagpole, the troop marching,
 *           Scout Master Ward, the treehouse at an alarming height, the lookout tower
 *  z -1360  Mile 3.25 Tidal Inlet: the cove, Sam and Suzy dancing on the beach, their tent, the sign
 *  z -1405  the storm rolls in: rain, wind, the flood rises to the rails; the Noye's Fludde ark adrift
 *  z -1478  lightning strikes the steeple of St. Jack's, dead ahead; the white flash is the next cover
 */

/** height of the path (the top of the track bed) all the way across the island */
export const PY = 2;

export const HOUSE = {
  /** z of the front and back walls */
  front: -1218, back: -1248,
  /** half the gap between the two halves once they have parted */
  gap: 4.8,
  /** depth of each half, out from its cut face */
  depth: 6.4,
  /** floor levels: ground floor, first floor, attic; the ridge */
  floors: [PY + 0.15, PY + 3.65, PY + 7.15] as const,
  storey: 3.3,
  ridge: PY + 11.4,
  /** rider z over which the halves slide apart */
  openZ0: -1193, openZ1: -1209,
};

export const LIGHTHOUSE = { x: 1.6, z: -1274, r: 2.5, gallery: PY + 10.2, top: PY + 15.4 };

export const CAMP = {
  gate: -1306,
  z0: -1310, z1: -1352,
  /** the parade ground (right of the track), round the flagpole */
  parade: { x0: 7.5, x1: 19, z0: -1318, z1: -1342 },
  flag: { x: 13.2, z: -1330 },
  treehouse: { x: -15, z: -1334, h: 30 },
  tower: { x: 22, z: -1352, h: 11 },
};

export const COVE = {
  z0: -1356, z1: -1414,
  /** the sea's surface in fine weather */
  sea: PY - 1.35,
  /** where Sam and Suzy dance (on a low dune left of the track) */
  dance: { x: -8.2, z: -1384, y: PY + 0.2 },
  tent: { x: -12.5, z: -1396 },
  sign: { x: -4.2, z: -1366 },
};

export const STORM = {
  /** rider z over which the storm rolls in, and the flood rises to the rails */
  z0: -1398, z1: -1446,
  flood: PY + 0.12,
  church: { x: 0, z: -1538, steeple: -1529 },
  /** the strike on the steeple */
  strike: -1479,
};

/** the bounds of the ground */
export const LAND = { xMin: -240, xMax: 240, zMin: -1600, zMax: -1150 };
