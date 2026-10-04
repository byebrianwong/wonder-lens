import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../../engine/math';
import { makeRoad, type Road } from '../amelie/layout';
import * as hotel from './route/hotel';
import * as mendls from './route/mendls';
import * as ski from './route/ski';
import * as fox from './route/fox';
import * as moonrise from './route/moonrise';
import * as asteroid from './route/asteroid';
import * as isle from './route/isle';
import * as aquatic from './route/aquatic';
import * as finale from './route/finale';

/**
 * The route of the Zubrowka Express: a film in nine parts, each part a scene from a Wes Anderson film, built
 * like his sets (dollhouse cutaways, painted backdrops, miniatures made big) and joined by his transitions
 * (whip pans, title cards, a theatre curtain). The ride runs in -z. Each scene ("set") owns a stretch of z;
 * sets are built separately and drawn only near the rider, and most scene changes happen while the screen
 * is covered (see COVERS).
 *
 *  hotel     Nebelsbad station, up the funicular, into the lobby of the Grand Budapest Hotel (1932)
 *  mendls    Mendl's patisserie at giant scale, riding in an open pink box along the conveyor
 *  ski       Gabelmeister's Peak and the toboggan chase down the mountain
 *  fox       under the hill: the Fox family's burrow, the tunnels and Bean's cider cellar (Fantastic Mr. Fox)
 *  moonrise  New Penzance: Summer's End, Camp Ivanhoe, the cove, and the storm (Moonrise Kingdom)
 *  asteroid  Asteroid City staged as a play: the desert, the crater, the stargazing (Asteroid City)
 *  isle      over Trash Island in a trash gondola (Isle of Dogs)
 *  aquatic   under the sea in the Deep Search, up to the Belafonte at sundown (The Life Aquatic)
 *  finale    the curtain call
 *
 * Heights run on from one set to the next (the path is one continuous curve). Each scene's path points,
 * speed keys and captions live in route/<id>.ts so a scene can reshape its own stretch; the first and last
 * point of each file are where its neighbours join.
 */

export type SetId = 'hotel' | 'mendls' | 'ski' | 'fox' | 'moonrise' | 'asteroid' | 'isle' | 'aquatic' | 'finale';
export const SET_ORDER: SetId[] = ['hotel', 'mendls', 'ski', 'fox', 'moonrise', 'asteroid', 'isle', 'aquatic', 'finale'];

const ROUTES: Record<SetId, { PTS: [number, number, number][]; SPEED: Array<[number, number]>; CAPTIONS: Array<[number, string]> }> = {
  hotel, mendls, ski, fox, moonrise, asteroid, isle, aquatic, finale,
};

/** z where each set begins (the ride enters it) and ends: the first and last points of its route. */
export const SETS = Object.fromEntries(SET_ORDER.map((id) => {
  const p = ROUTES[id].PTS;
  return [id, { z0: p[0][2], z1: p[p.length - 1][2] }];
})) as Record<SetId, { z0: number; z1: number }>;

/** All control points in order; a point shared by two neighbouring sets appears once. */
function allPoints() {
  const out: [number, number, number][] = [];
  for (const id of SET_ORDER) for (const p of ROUTES[id].PTS) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6 && Math.abs(last[2] - p[2]) < 1e-6) continue;
    out.push(p);
  }
  return out;
}

export function makeCurve() {
  const c = new THREE.CatmullRomCurve3(allPoints().map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  c.arcLengthDivisions = 8000;
  return c;
}

/** Story beats along the whole ride, [z, text], in ride order. */
export const CAPTIONS_Z: Array<[number, string]> = SET_ORDER.flatMap((id) => ROUTES[id].CAPTIONS).sort((a, b) => b[0] - a[0]);

/** The index of the last caption at or before a z (for Storybook ride views and the dev screenshot page). */
export function captionIndexAtZ(z: number) {
  let i = 0;
  while (i < CAPTIONS_Z.length - 1 && CAPTIONS_Z[i + 1][0] >= z) i++;
  return i;
}

const SPEED: Array<[number, number]> = SET_ORDER.flatMap((id) => ROUTES[id].SPEED).sort((a, b) => b[0] - a[0]);

/**
 * A pace for each whole scene, on top of the scene's own speed keys, so the ride's length can be tuned in
 * one place. It blends over 30 units at each join.
 */
const SET_PACE: Record<SetId, number> = {
  hotel: 1, mendls: 1, ski: 1, fox: 1, moonrise: 1, asteroid: 1, isle: 1, aquatic: 1, finale: 1,
};

function paceStep(z: number) {
  for (const id of SET_ORDER) if (z <= SETS[id].z0 && z > SETS[id].z1) return SET_PACE[id];
  return z > SETS.hotel.z0 ? SET_PACE.hotel : SET_PACE.finale;
}
function paceAtZ(z: number) {
  let sum = 0;
  for (let i = -3; i <= 3; i++) sum += paceStep(z + i * 5);
  return sum / 7;
}

/** Speed multiplier for a z along the ride. */
export function speedAtZ(z: number) {
  let k = SPEED[SPEED.length - 1][1];
  if (z > SPEED[0][0]) k = SPEED[0][1];
  else for (let i = 0; i < SPEED.length - 1; i++) {
    const [za, a] = SPEED[i], [zb, b] = SPEED[i + 1];
    if (z <= za && z >= zb) { k = lerp(a, b, smoothstep(za, zb, z)); break; }
  }
  return clamp(k * paceAtZ(z), 0.3, 1.8);
}

/**
 * A title card, in the style of the films' chapter cards: a small line above a large title, centred on a
 * flat colour with a thin border.
 */
export interface Card { kicker: string; title: string; sub?: string; bg: number; fg: number }

/**
 * Screen covers between scenes, in z: the cover rises from `a` to full at `b`, holds to `c` and clears by `d`.
 *  whip     a whip pan: the camera swings away in a blur and swings back into the next scene
 *  black    a fade to black (the lid of a box closing)
 *  white    a fade to white (snow, a lightning flash)
 *  curtain  a red theatre curtain closes across the screen and opens again
 *  splash   a wash of sea water and bubbles
 *  iris     a circle closing to black, as in an old film
 * A card, if any, shows while the cover is full.
 */
export type CoverKind = 'whip' | 'black' | 'white' | 'curtain' | 'splash' | 'iris';
export interface Cover {
  a: number; b: number; c: number; d: number; kind: CoverKind; color: number; color2?: number; card?: Card;
  /** units of ride over which the card fades in once the cover is full (default 3) */
  cardIn?: number;
}

export const COVERS: Cover[] = [
  // the opening card, already up when the ride starts
  { a: 999, b: 998, c: 54, d: 45, kind: 'black', color: 0xf6d6dc, card: { kicker: 'Part One', title: 'The Grand Budapest Hotel', sub: 'aboard the Zubrowka Express', bg: 0xf6d6dc, fg: 0x7a2a3c } },
  // up the grand staircase and through the door at the top: a whip pan into Mendl's
  { a: -287, b: -295, c: -305, d: -313, kind: 'whip', color: 0xe8a0b4, color2: 0xf6e6c8, card: { kicker: 'Part Two', title: "Mendl's", sub: 'Patisserie, Nebelsbad', bg: 0xf4c4d0, fg: 0x3a6a9a } },
  // the lid of the box closes over the rider
  { a: -538, b: -552, c: -574, d: -586, kind: 'black', color: 0x1a0a10, card: { kicker: 'Part Three', title: "Gabelmeister's Peak", bg: 0xe8eef6, fg: 0x2a3a6a } },
  // into the snowdrift at the bottom of the run, and out under the hill
  { a: -858, b: -870, c: -890, d: -904, kind: 'white', color: 0xf8f4f2, card: { kicker: 'Part Four', title: 'Underneath the Hill', sub: 'Fantastic Mr. Fox', bg: 0xf0b048, fg: 0x5a2a10 } },
  // out of the earth: a whip pan to the island
  { a: -1164, b: -1172, c: -1184, d: -1192, kind: 'whip', color: 0x8a6a3a, color2: 0xe8d8a0, card: { kicker: 'Part Five', title: 'New Penzance', sub: 'Moonrise Kingdom', bg: 0xe8d070, fg: 0x8a2a1a } },
  // the lightning strike: a white flash, out of which the stage appears
  { a: -1486, b: -1494, c: -1506, d: -1518, kind: 'white', color: 0xffffff, card: { kicker: 'Part Six', title: 'Asteroid City', sub: 'a play in three acts', bg: 0x9ad0cc, fg: 0x8a3a2a } },
  // the curtain comes down on the play
  { a: -1778, b: -1792, c: -1810, d: -1824, kind: 'curtain', color: 0x8a1020, card: { kicker: 'Part Seven', title: 'Trash Island', sub: 'Isle of Dogs', bg: 0xd8d0c0, fg: 0x2a2a2a } },
  // the gondola drops into the sea
  { a: -2076, b: -2085, c: -2096, d: -2108, kind: 'splash', color: 0x4aa8c0, card: { kicker: 'Part Eight', title: 'The Deep', sub: 'The Life Aquatic', bg: 0x7ac0d8, fg: 0xc8202a } },
  // the last iris, into the curtain call
  { a: -2402, b: -2414, c: -2430, d: -2442, kind: 'iris', color: 0x000000, card: { kicker: 'Part Nine', title: 'Curtain Call', bg: 0x8a1020, fg: 0xf4d890 } },
  // the end: the curtain comes down for good as the train stops on the stage
  { a: -2597, b: -2601, c: -9000, d: -9001, kind: 'curtain', color: 0x8a1020, cardIn: 1.5, card: { kicker: 'The End', title: 'The Zubrowka Express', sub: 'a fan-made tribute to the films of Wes Anderson', bg: 0x8a1020, fg: 0xf4d890 } },
];

/**
 * The frame's shape by z: [z, aspect, amount]. The opening is framed like the 1930s part of The Grand
 * Budapest Hotel (1.37 : 1, black bars at the sides) and opens out to the full screen on the way up the
 * funicular. amount 0 is the full screen.
 */
export const FRAME: Array<[number, number, number]> = [[999, 1.37, 1], [-10, 1.37, 1], [-60, 1.37, 0]];

/**
 * What the rider rides on, by z, when no scene supplies its own mount for that stretch: the Zubrowka Express.
 * Scenes supply the others (BuiltSet.mounts): the funicular car, the pastry box, the toboggan, the trash
 * gondola, the Deep Search.
 */
export type MountKind = 'train' | 'funicular' | 'box' | 'sled' | 'gondola' | 'sub' | 'free';

export { makeRoad, type Road };
