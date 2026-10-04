import * as THREE from 'three';
import { lerp, smoothstep } from '../../engine/math';
import { makeRoad, type Road } from '../amelie/layout';
import * as garden from './route/garden';
import * as fields from './route/fields';
import * as forest from './route/forest';
import * as sky from './route/sky';
import * as laputa from './route/laputa';
import * as meadow from './route/meadow';
import * as bathhouse from './route/bathhouse';
import * as haku from './route/haku';
import * as home from './route/home';

/**
 * The route of "Catbus to Anywhere": one night of a dream, from Totoro's garden at midnight back to the
 * same garden at dawn. The ride runs in -z. Each scene ("set") owns a stretch of z; sets are built
 * separately and drawn only near the rider, and most scene changes happen while the screen is covered.
 *
 *  garden     Totoro's garden at midnight: the Catbus comes for you, the seed dance, the tree that grows to the sky
 *  fields     a dive off the treetop onto the power lines, over moonlit rice fields, Totoro flying alongside
 *  forest     the Forest Spirit's wood before dawn: Kodama, the Night-Walker, the spirit pool
 *  sky        above the clouds at sunrise with Kiki, towards the storm wall of the Dragon's Nest
 *  laputa     the calm inside the storm: the floating castle, its gardens and the robot gardener
 *  meadow     Howl's flower meadow and lake at golden hour, the walking castle, in at its door
 *  bathhouse  out of the door onto the bathhouse bridge at dusk, the lanterns, down to the boiler room
 *  haku       on Haku's back over the night sea of spirits, until his scales burst and you fall
 *  home       caught by the Catbus, back to the garden at sunrise
 *
 * Heights run on from one set to the next (the path is one continuous curve), so each set is built at
 * whatever height the path reaches it: the "sky" is a floor of cloud at about y 44, not 1,000 units up.
 */

export type SetId = 'garden' | 'fields' | 'forest' | 'sky' | 'laputa' | 'meadow' | 'bathhouse' | 'haku' | 'home';

/** z where each set begins (the ride enters it) and ends. */
export const SETS: Record<SetId, { z0: number; z1: number }> = {
  garden: { z0: 60, z1: -230 },
  fields: { z0: -230, z1: -610 },
  forest: { z0: -610, z1: -920 },
  sky: { z0: -920, z1: -1230 },
  laputa: { z0: -1230, z1: -1510 },
  meadow: { z0: -1510, z1: -1792 },
  bathhouse: { z0: -1792, z1: -2090 },
  haku: { z0: -2090, z1: -2400 },
  home: { z0: -2400, z1: -2620 },
};
export const SET_ORDER: SetId[] = ['garden', 'fields', 'forest', 'sky', 'laputa', 'meadow', 'bathhouse', 'haku', 'home'];

const ROUTES = [garden, fields, forest, sky, laputa, meadow, bathhouse, haku, home];

/** All control points in order; a point shared by two neighbouring sets appears once. */
function allPoints() {
  const out: [number, number, number][] = [];
  for (const r of ROUTES) for (const p of r.PTS) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6 && Math.abs(last[2] - p[2]) < 1e-6) continue;
    out.push(p);
  }
  return out;
}

const SPEED: Array<[number, number]> = ROUTES.flatMap((r) => r.SPEED).sort((a, b) => b[0] - a[0]);

export function makeCurve() {
  const c = new THREE.CatmullRomCurve3(allPoints().map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  c.arcLengthDivisions = 8000;
  return c;
}

/**
 * A pace for each whole scene, on top of the scene's own speed keys, so the ride's length can be tuned in
 * one place (about four and a half minutes in all). It blends over 30 units at each join.
 */
const SET_PACE: Record<SetId, number> = {
  garden: 1, fields: 1, forest: 1.1, sky: 1, laputa: 1.08, meadow: 1, bathhouse: 1.3, haku: 1.18, home: 1.25,
};
const ORDERED = Object.entries(SETS) as Array<[SetId, { z0: number; z1: number }]>;

/** The pace of the scene a z falls in. */
function paceStep(z: number) {
  for (const [id, r] of ORDERED) if (z <= r.z0 && z > r.z1) return SET_PACE[id];
  return z > SETS.garden.z0 ? SET_PACE.garden : SET_PACE.home;
}
/** The scene pace, averaged over 30 units so it changes smoothly across a join. */
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
  return k * paceAtZ(z);
}

/**
 * What the rider sits on, by z. The world places the camera for each kind:
 *  foot    standing in the garden, before the Catbus arrives
 *  catbus  on the Catbus's back, just behind its head
 *  haku    on Haku's neck, between his horns
 *  fall    no mount: falling through the sky after Haku's scales burst
 *  free    the closing shot: the Catbus runs off and the camera rises
 * Changes between kinds happen while the screen is covered, except boarding the Catbus (scripted in the
 * world) and the closing shot.
 */
export type MountKind = 'foot' | 'catbus' | 'haku' | 'fall' | 'free';
export const MOUNTS: Array<{ z0: number; z1: number; kind: MountKind }> = [
  { z0: 999, z1: 40, kind: 'foot' },
  { z0: 40, z1: -2052, kind: 'catbus' },
  { z0: -2052, z1: -2302, kind: 'haku' },
  { z0: -2302, z1: -2410, kind: 'fall' },
  { z0: -2410, z1: -2588, kind: 'catbus' },
  { z0: -2588, z1: -9999, kind: 'free' },
];
export function mountAtZ(z: number): MountKind {
  for (const m of MOUNTS) if (z <= m.z0 && z > m.z1) return m.kind;
  return 'free';
}

/**
 * Screen covers between scenes, in z: the cover rises from `a` to full at `b`, holds to `c` and clears by `d`.
 *  white   mist or cloud
 *  storm   grey cloud and rain inside the storm wall (the sky set adds lightning flashes)
 *  paper   a storm of paper birds (the world adds the birds themselves)
 */
export const COVERS: Array<{ a: number; b: number; c: number; d: number; kind: 'white' | 'storm' | 'paper'; color: number }> = [
  { a: -888, b: -910, c: -926, d: -948, kind: 'white', color: 0xe8f0f0 },
  { a: -1198, b: -1220, c: -1236, d: -1258, kind: 'storm', color: 0x4a5464 },
  { a: -1478, b: -1500, c: -1516, d: -1540, kind: 'white', color: 0xf4f0ea },
  { a: -2026, b: -2044, c: -2058, d: -2076, kind: 'paper', color: 0xf2ead8 },
  { a: -2362, b: -2392, c: -2414, d: -2440, kind: 'white', color: 0xfff0e4 },
];

/**
 * The Dragon's Nest: a ring of storm cloud round Laputa, centred on the island. The sky scene builds it
 * (it is seen from outside there and from inside in the Laputa scene). `inner` is the radius of the calm
 * eye, `outer` the outside of the wall; the path crosses the wall between z -1198 and -1236.
 */
export const NEST = { x: 30, y: 50, z: -1375, inner: 140, outer: 178, top: 460, bottom: -240 };
/** Laputa: the centre of the island; its top terrace is at about y 48. */
export const ISLAND = { x: 30, y: 48, z: -1375 };
/**
 * The room inside Howl's castle: the path enters its front door at z -1762 and reaches the inner door
 * (with the colour dial) at z -1792; floor at y 6. The far side of that door is the bathhouse scene, which
 * builds a gate house round this box, so the room has somewhere to be when you look back at it.
 */
export const CASTLE_ROOM = { z0: -1760, z1: -1793, floorY: 6, halfW: 5.5, height: 7.5 };

export { makeRoad, type Road };
