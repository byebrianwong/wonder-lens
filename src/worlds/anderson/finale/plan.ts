/*
 * Where the parts of the curtain call sit. The theatre is symmetrical about x = 0 (the centre aisle, where
 * the track runs). The stage faces +z, towards the audience and the arriving train.
 */
export const FLOOR = 2;
export const STAGE_Y = 3.4;
/** the auditorium: back wall (with the doors the train came through) to the front of the orchestra pit */
export const HALL = { back: -2436, front: -2543, halfW: 24, ceiling: 25 };
/** the orchestra pit, crossed by the ramp up to the stage */
export const PIT = { z0: -2543, z1: -2553, floor: -0.6 };
/** the proscenium arch at the front of the stage: its opening */
export const PROSC = { z: -2554, halfW: 14, height: 15 };
/** the stage behind the arch */
export const STAGE = { front: -2553, back: -2668, halfW: 30 };
/** the cast's line at the curtain call */
export const LINE = { z: -2620, spacing: 2.25 };
/** the dollhouse: its open front faces the audience */
export const HOUSE = { z: -2630, halfW: 21, rooms: 5, floors: 3, roomH: 5.2, depth: 5 };
/** the aisle: the seats start this far either side of the track */
export const AISLE = 3.4;
