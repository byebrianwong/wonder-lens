import { fbm, smoothstep, lerp, clamp } from '../../../engine/math';

/*
 * Where everything in "Part One: The Grand Budapest Hotel" goes. The path runs straight down x = 0, so the
 * whole scene is built symmetric about the track wherever it can be.
 *
 *  z  60 ..   6  Nebelsbad station: two platforms under pink canopies, twin clock towers at the far end,
 *                the station hall behind the train
 *  z   6 .. -42  a stone viaduct over the miniature spa town in the valley
 *  z -42 ..-150  the funicular: a trestle and a rack rail straight up the cliff, the red car on the other track
 *  z -146..-160  the hotel's terrace on top of the cliff, the front doors at z -160
 *  z -162..-256  the lobby, a dollhouse set: galleries, the concierge desk (left), the lift (right)
 *  z -256..-290  the grand staircase, a rack rail up its middle, the doors at the top
 */

/** rail level in the station and on the viaduct */
export const Y0 = 2;
/** the valley floor, where the streets of the model town are */
export const TOWN_Y = -8;

export const STATION = {
  /** platform top, and the platform edges either side of the track */
  top: Y0 + 0.78, edge: 2.3, outer: 10.6, z0: 74, z1: 6,
  /** the terrace the station stands on */
  terraceHalf: 17, terraceZ0: 92, terraceZ1: 4,
  /** canopy columns, and the canopies' height */
  colX: 6.4, colZ: [66, 58, 50, 42, 34], canopyY: Y0 + 7.4, canopyZ0: 72, canopyZ1: 30,
  /** the twin clock towers at the platforms' far end */
  towerX: 13.6, towerZ: 8, towerW: 4.6, towerTop: Y0 + 15.2,
  /** the station hall behind the train */
  hallZ: 80,
};

export const VIADUCT = { z0: 6, z1: -44, half: 3.4 };

export const FUNI = {
  /** the red car's track, right of the train's */
  x: 4.6, z0: -40, z1: -150,
  /** where the cliff meets the valley floor, and where its top edge is */
  cliffFoot: -122, cliffTop: -148,
};

export const TERRACE = { y: 46, z0: -150, z1: -160, half: 44 };

export const HOTEL = {
  /** the front wall (the doors are in it), the back, the half width of the main block */
  front: -160, back: -304, half: 38.4,
  /** ground floor arcade, the storeys above, the cornice */
  base: 46, gf: 8, storey: 3.4, storeys: 5,
  /** central pavilion half width and how far it stands forward */
  pav: 12, pavOut: 2.2,
  /** the doorway */
  doorHalf: 4.2, doorH: 7.2,
};
export const CORNICE = HOTEL.base + HOTEL.gf + HOTEL.storey * HOTEL.storeys;

export const LOBBY = {
  front: -162.6, back: -298, half: 22, floor: 46,
  /** the column rows between the nave and the aisles */
  aisle: 11,
  /** the two galleries' floors, and the aisles' top ceiling */
  g1: 54, g2: 61, ceil: 68,
  /** the stained glass over the nave */
  glass: 70.4,
  /** columns along z */
  colZ: [-172, -187, -202, -217, -232, -247],
};

export const STAIRS = { z0: -256, z1: -290, y0: 46, y1: 54, half: 5.2, landing: -298 };

/** the concierge desk (left aisle) and the lift (right aisle) */
export const DESK = { x: -15.5, z: -209.5, len: 9 };
export const LIFT = { x: 17, z: -209.5 };

/** z where the hotel's front doors start to open and are fully open; and where they close behind the train */
export const DOORS = { open0: -138, open1: -150, close0: -184, close1: -190 };
/** the doors at the top of the stairs open as the whip pan starts */
export const TOP_DOORS = { open0: -279, open1: -287 };

/** z of the foot of the cliff at a given x: it curves forward at the sides, like the wall of a bowl round the town. */
export const cliffFootAt = (x: number) => FUNI.cliffFoot + x * x * 0.0011;
/** z of the cliff's top edge at a given x. */
export const cliffTopAt = (x: number) => FUNI.cliffTop + 2 + x * x * 0.0011;

/**
 * The rock face: z of the face at a height y and an x, sheer with overhangs and buttresses. The terrain's
 * own slope is kept just behind it.
 */
export function cliffFaceZ(x: number, y: number) {
  const v = clamp((y - TOWN_Y) / (TERRACE.y - TOWN_Y), 0, 1);
  const zf = cliffFootAt(x), zt = cliffTopAt(x);
  // mostly sheer, steepening at the top, with a bulge of rock in the middle
  const k = Math.pow(v, 0.85);
  const bulge = Math.sin(v * Math.PI) * 2.5;
  const ribs = Math.sin(x * 0.21 + Math.sin(x * 0.05) * 3) * 1.4 + fbm(x * 0.07, y * 0.12, 3) * 4 - 2;
  return lerp(zf, zt, k) + bulge + ribs;
}

/**
 * Ground height outside: the valley floor with the town, the cliff (nearly sheer) up to the hotel's terrace,
 * mountains either side and behind. The funicular climbs on a trestle over the town, so its corridor is
 * kept below the rails.
 */
export function groundHeight(x: number, z: number, railY: (z: number) => number) {
  const ax = Math.abs(x);
  const n = fbm(x * 0.02 + 3.1, z * 0.02 - 1.7, 4);
  const crag = fbm(x * 0.09 - 7.3, z * 0.05 + 2.2, 3);
  // the valley floor, gently rolling
  let h = TOWN_Y + (n - 0.5) * 1.4;
  // the cliff: a steep face from its foot to its top edge (the rock face mesh stands just in front of it)
  const foot = cliffFootAt(x) - 3 + (crag - 0.5) * 4;
  const top = cliffTopAt(x) - 1;
  if (z < foot) {
    const k = clamp((foot - z) / (foot - top), 0, 1);
    const face = smoothstep(0, 1, k) * 0.8 + 0.2 * smoothstep(0.2, 0.45, k) + 0.08 * smoothstep(0.6, 0.8, k) - 0.08;
    h = Math.max(h, lerp(TOWN_Y, TERRACE.y - 2, clamp(face, 0, 1)) + (crag - 0.5) * 10 * Math.sin(k * Math.PI));
  }
  // above the cliff: the plateau rises into the mountain behind the hotel
  if (z < top) h = Math.max(h, TERRACE.y - 2 + smoothstep(HOTEL.back - 4, HOTEL.back - 240, z) * 130 * smoothstep(20, 60, ax + Math.max(0, HOTEL.back - 20 - z)) + (n - 0.5) * 8 * smoothstep(top, top - 40, z));
  // the valley's sides rise into mountains
  const side = smoothstep(110, 290, ax);
  h += side * (150 + (n - 0.5) * 80) * (0.6 + 0.4 * smoothstep(100, -100, z));
  // behind the station the valley rises gently towards the far hills
  h += smoothstep(150, 330, z) * 60 * (0.7 + n * 0.6);
  // the hotel stands on a level plateau: keep the ground under its footprint below the lobby's floor
  if (z < top + 2 && z > HOTEL.back - 8 && ax < HOTEL.half + 8) h = Math.min(h, TERRACE.y - 2.5);
  // the funicular's corridor: never higher than 1.5 below the rails
  if (z < FUNI.z0 + 6 && z > FUNI.cliffTop - 2) {
    const cut = railY(z) - 1.5;
    const w = 1 - smoothstep(6, 12, Math.abs(x - 2.3));
    if (h > cut) h = lerp(h, cut, w);
  }
  return h;
}
