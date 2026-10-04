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
  colX: 6.4, colZ: [62, 54, 46, 38, 30, 22, 14], canopyY: Y0 + 7.4,
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
  cliffFoot: -46, cliffTop: -148,
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
  glass: 72,
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

/**
 * Ground height outside: the valley floor with the town, the cliff up to the hotel's terrace, mountains
 * either side and behind. The funicular's corridor is cut down below the rails so the trestle shows.
 */
export function groundHeight(x: number, z: number, railY: (z: number) => number) {
  const ax = Math.abs(x);
  const n = fbm(x * 0.02 + 3.1, z * 0.02 - 1.7, 4);
  // the valley floor, gently rolling
  let h = TOWN_Y + (n - 0.5) * 1.4;
  // the cliff: its foot curves forward at the sides, like the walls of a bowl round the town
  const foot = FUNI.cliffFoot + ax * ax * 0.0016;
  const k = clamp((foot - z) / (foot - FUNI.cliffTop - 6 + ax * 0.05), 0, 1.6);
  // a steep face with a couple of ledges
  const face = smoothstep(0, 1, Math.min(k, 1)) * 0.82 + 0.18 * smoothstep(0.15, 0.55, k) + 0.1 * smoothstep(0.65, 0.95, k);
  const cliffH = lerp(TOWN_Y, TERRACE.y - 2, Math.min(1.1, face)) + (n - 0.5) * 6 * Math.sin(Math.min(k, 1) * Math.PI);
  if (z < foot) h = Math.max(h, cliffH);
  // above the cliff: the plateau rises into the mountain behind the hotel
  if (z < FUNI.cliffTop) h = Math.max(h, TERRACE.y - 2 + smoothstep(FUNI.cliffTop - 20, FUNI.cliffTop - 260, z) * 120 + (n - 0.5) * 10);
  // the valley's sides rise into mountains
  const side = smoothstep(120, 300, ax);
  h += side * (150 + (n - 0.5) * 80) * (0.6 + 0.4 * smoothstep(100, -100, z));
  // behind the station the valley rises gently towards the far hills
  h += smoothstep(150, 330, z) * 60 * (0.7 + n * 0.6);
  // the funicular's corridor: never higher than 2.5 below the rails
  if (z < FUNI.z0 + 6 && z > FUNI.cliffTop - 2) {
    const cut = railY(z) - 2.5;
    const w = 1 - smoothstep(6, 16, Math.abs(x - 2));
    if (h > cut) h = lerp(h, cut, w);
  }
  return h;
}
