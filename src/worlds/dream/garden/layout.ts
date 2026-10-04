/*
 * Where things are in Totoro's garden. The garden is built twice: at midnight at the start of the ride
 * (the "garden" scene) and at dawn at the end (the "home" scene). Both use the same local layout; the
 * home scene shifts it along z by `HOME_OZ`, so the rider passes the same house and seed bed.
 *
 * Local frame: the dirt lane runs along -z (the direction of the ride) near x = 0. The Kusakabe house is
 * on the left of the lane with its veranda facing the lane; fields and the meadow are on the right; the
 * camphor wood climbs the hillside behind the house on the left.
 */

import { smoothstep } from '../../../engine/math';

/** z offset of the layout in each scene (world z = local z + offset). */
export const GARDEN_OZ = 0;
export const HOME_OZ = -2552;

/** Centre x of the dirt lane at a local z: straight, then easing 4 units to the left past the house. */
export const laneX = (lz: number) => -4 * smoothstep(40, -24, lz);
export const LANE_HALF = 1.7;

/** The old house: centre and turn (its veranda side faces +x, towards the lane). */
export const HOUSE = { x: -17, z: 22, yaw: Math.PI / 2 };
/** The yard round the house, kept flat. */
export const YARD = { x0: -34, x1: -3, z0: 4, z1: 40 };
/** The hand pump on its stone slab, between the house and the lane. */
export const PUMP = { x: -6.6, z: 7 };
/** The washing line: two bamboo poles. */
export const LINE = { x: -9, z0: 33, z1: 45 };
/** Vegetable patches: near the house, and further along on the left of the lane. */
export const PATCHES = [{ x0: -27, x1: -12, z0: -13, z1: 2 }, { x0: -29, x1: -13, z0: -94, z1: -66 }];
/**
 * The seed bed the girls planted acorns in: in the meadow on the right of the lane, 13.5 units from it.
 * They dance on its near side, towards the lane, 7 to 14 units from the rider passing by. The tree grows
 * from it.
 */
export const BED = { x: 9.5, z: -30, w: 3.8, d: 2.8 };
/** The mown, flat patch where they dance (in front of the bed, on the lane side). */
export const DANCE_FLOOR = { x: BED.x - 2.5, z: BED.z + 5, r: 11 };

/** Rice paddies: blocks of cells, [x0, x1, z0, z1] in local units, with the cell size. */
export interface PaddyBlock { x0: number; x1: number; z0: number; z1: number; cw: number; cd: number }
export const PADDIES_BACK: PaddyBlock[] = [
  { x0: 14, x1: 112, z0: 56, z1: 156, cw: 14, cd: 10 },
  { x0: -38, x1: -12, z0: 46, z1: 156, cw: 13, cd: 10 },
];
export const PADDIES_FRONT_LEFT: PaddyBlock = { x0: -38, x1: -12, z0: -212, z1: -104, cw: 13, cd: 9 };
/** Garden only: cells beyond the meadow on the right (the home scene has its hill there). */
export const PADDIES_FRONT_RIGHT: PaddyBlock = { x0: 28, x1: 140, z0: -204, z1: -84, cw: 14, cd: 10 };

/** The near ground grid (local units) and its resolution. */
export const NEAR = { x0: -220, x1: 240, z0: -290, z1: 180, res: 2 };
