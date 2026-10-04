/*
 * The plan of "Underneath the Hill" (Fantastic Mr. Fox): where each part of the scene sits along the ride.
 * The ride runs straight down the middle (x = 0) so every room is framed square to the track.
 *
 *  z  -880  under the white cover: a round burrow tunnel, out of the snowdrift
 *  z  -906  the Fox family's home under the great tree: rooms open to the track on both sides like a
 *           dollhouse (kitchen and studio on the left, study and sitting room on the right), the boys'
 *           bedroom and the larder cut into the earth above, and at the far end the foot of the tree with
 *           its round green door, Mr. Fox on the balcony above it
 *  z  -958  a tunnel through striped earth, roots hanging, lanterns in a row
 *  z  -970  the animals' underground town: burrow fronts cut into the cross-section of the hill on both
 *           sides, open to the dusk sky where the farmers' excavators chew down from the rims
 *  z -1020  through a broken brick wall into Bean's cider cellar: barrel racks, the Rat on guard, and the
 *           flood of cider the train rides through
 *  z -1084  up a steep tunnel, Boggis's chicken house and Bunce's storehouse seen through holes
 *  z -1118  out onto the hilltop at night: the excavators, the moon, and the black wolf on the far ridge
 */

export const Z = {
  start: -880,
  end: -1180,
  /** the round door at the foot of the tree, at the end of the home */
  home: { z0: -906, z1: -956 },
  tunnel: { z0: -956, z1: -970 },
  town: { z0: -970, z1: -1018 },
  /** the brick wall the animals broke through */
  wall: -1022,
  cellar: { z0: -1022, z1: -1084 },
  climb: { z0: -1084, z1: -1118 },
  hill: { z0: -1118, z1: -1180 },
};

/** Floor heights. */
export const Y = {
  home: -6,
  /** the rooms stand a little above the track, like little stages */
  room: -5.4,
  town: -6.6,
  cellar: -8.8,
  /** the cider flood's surface */
  cider: -8.15,
  hill: 2,
};

/** Half-widths and heights of the spaces round the track. */
export const HOME = {
  /** the rooms' open fronts */
  front: 4.6,
  /** the rooms' back walls */
  back: 14,
  /** room height above the room floor */
  roomH: 4.4,
  /** the slab of earth between the rooms and the chambers above */
  slab: 0.9,
  /** the earth walls rise to this height above Y.home */
  top: 15,
  /** the partition between the two rooms on each side */
  split: -931,
  /** the tree's door (centre at the path) */
  doorR: 3.3,
};

export const TOWN = { half: 13, wallTop: 15, rim: 15.5 };
export const CELLAR = { half: 11, vault: 9.5 };
