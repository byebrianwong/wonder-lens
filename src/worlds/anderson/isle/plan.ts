import * as THREE from 'three';

/*
 * The plan of Trash Island: where everything stands, in world units. The ride runs straight down x = 0
 * (rider's right is +x) from the loading station at z -1800 over the trash mountains to the island's edge,
 * where the gondola's grip lets go and it dives into the bay.
 */

/** sea level */
export const SEA = 0;
/** the bales the island is stacked from: cell size across and layer height */
export const BALE = 2;
/** the cable above the gondola's floor (the grip on its carriage) */
export const CABLE_H = 5.3;
/** the return cable, to the rider's right */
export const RETURN_X = 9;
/** the pylons' lattice columns stand between the two cables */
export const PYLON_X = 4.6;
/** the gondola's grip lets go here */
export const ZSNAP = -2034;
/** the pylons on the island (z), and the tall ones out in the bay */
export const PYLONS = [-1862, -1905, -1945, -2008];
export const SEA_PYLONS = [-2150, -2290];

/** the loading station: a long iron shed the rider starts in */
export const STATION = { z0: -1786, z1: -1830, cx: 4.5, half: 11.5, eave: 12, ridge: 16, floor: 0.5 };

/** the island's edge: a cliff of bales down to the sea */
export const EDGE_Z = -2046;
/** the island's far side and its two flanks (the island narrows a little towards its edge) */
export const ISLAND = { back: -1774, halfW: 150 };

/** the crashed plane, the pack in front of it, Atari on its wing */
export const PLANE = { x: -15, z: -1858, y: 6 };
export const PACK = { x: -10.5, z: -1847, y: 4 };
/** Chief alone on a bale peak beside the cable */
export const CHIEF = { x: -5, z: -1892, y: 22 };
/** Spots in his cage on a heap to the right */
export const SPOTS = { x: 13.5, z: -1934, y: 22 };
/** Nutmeg poised on an old sake barrel to the left */
export const NUTMEG = { x: -7, z: -1972, y: 24 };
/** the abandoned amusement park in the valley on the right */
export const PARK = { x: 66, z: -1995, y: 2, wheelR: 23 };
/** the sake factory in the valley on the left */
export const SAKE = { x: -64, z: -1990, y: 2 };
/** the animal-testing lab, further out on the left */
export const LAB = { x: -92, z: -1905, y: 6 };
/** the taiko drummers' stage, floating in the bay ahead, under the cable */
export const TAIKO = { x: 0, z: -2128, y: SEA + 1.2 };
/** Megasaki City across the bay: the centre of its symmetrical skyline */
export const CITY = { x: 0, z: -2470 };

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
