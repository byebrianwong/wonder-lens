import * as THREE from 'three';

/*
 * Where everything in the bathhouse scene stands, in world units. The path itself is in
 * ../route/bathhouse.ts; the numbers here are chosen to fit it (the stairs run at x 35, the boiler
 * room door is at z -1994, the high window at z -2066).
 *
 * Plan, seen from above (the ride runs in -z):
 *   z -1757 .. -1795  the gate house round the castle room, with the lantern street on both sides
 *   z -1795 .. -1881  the red bridge over the ravine; water far below at y -30
 *   z -1879 .. -1918  the forecourt in front of the bathhouse (y 6)
 *   z -1909 .. -1947  the bathhouse itself, standing on a stone and timber podium
 *   x  31 .. 39       the outside stairs down the podium's right wall, z -1913 .. -1960
 *   z -1994 .. -2066  the boiler room wing, floor at y -16
 */

/** Height of the bridge deck, the forecourt and the town terraces. */
export const DECK = 6;
/** The still water of the spirit world at the bottom of the ravine. */
export const WATER = -30;

export const BRIDGE = { z0: -1794.5, z1: -1881, half: 5.8 };
/** The ravine's two walls: the town side (near) and the bathhouse side (far). */
export const RAVINE = { near: -1796, far: -1879 };
/** The bathhouse (buildBathhouse, scaled up). Its front faces +z. */
export const BATH = { x: 0, y: DECK, z: -1928, s: 1.25, front: -1909.25, halfW: 27.5, halfD: 18.75 };
/** Centre of the lantern wave: the middle of the bathhouse. */
export const WAVE_CENTER = new THREE.Vector3(0, 32, -1930);

/** The podium the bathhouse stands on: a wide front block (the forecourt) and a back block. */
export const PODIUM = {
  front: { x0: -40, x1: 39.5, z0: -1879, z1: -1912 },
  back: { x0: -40, x1: 31, z0: -1912, z1: -1994 },
  bottom: -33,
};
/** The outside stairs: x range, and the z where the flight starts and ends. */
export const STAIRS = { x0: 31, x1: 39.2, top: -1912, bottom: -1961, pathX: 35 };
/** The boiler room wing. */
export const BOILER = {
  x0: -2, x1: 44, z0: -1994, z1: -2066, floor: -16, ceiling: 3.4, roof: 4.2,
  door: { x0: 31.4, x1: 38.6, top: -8.2 },
  /** the high window in the back wall that the paper birds come in by and Haku leaves by */
  window: { x0: -0.5, x1: 13.5, y0: -13.2, y1: 1.6 },
  /** the open hatch in the roof above the path */
  hatch: { x0: -1, x1: 15, z0: -2040, z1: -2066 },
};
/**
 * Kamaji's low platform against the left wall, with the furnace mouth in its front. It is low and reaches
 * out towards the path, so he sits about ten units from the rider with his face at about eye height.
 */
export const DAIS = { x0: -2, x1: 8.6, z0: -2010, z1: -2033, top: -14.6 };
export const KAMAJI = { x: 3.6, z: -2021.5, yaw: 1.45, scale: 2.56 };
export const FURNACE = new THREE.Vector3(8.65, -15.5, -2021.5);
export const COAL_HEAP = new THREE.Vector3(16.5, -16, -2003);
/** The ramp and loading platform under the high window, which the path climbs before Haku comes. */
export const RAMP = { z0: -2030, z1: -2054, platformZ: -2066 };

/**
 * The gate house built round the room inside Howl's castle (CASTLE_ROOM in ../layout.ts). The room and the
 * castle's shell stay inside x ±7.9 and below y 14.1 (the room's sill reaches z -1759.3), and the room's inner
 * door leaves swing out to z -1795.7 at x ±2.6..3.1, so the doorway is a little wider than that.
 */
export const GATE = { x0: -8.6, x1: 8.6, z0: -1756.5, z1: -1795, doorHalf: 3.25, doorTop: 13.2 };

/** The ferry at the quay under the far wall, on the left; the Kasuga spirits' walk up to the entrance. */
export const FERRY = { x: -30, z: -1866, len: 26, beam: 8, deck: -27.4 };
export const QUAY = { x0: -104, x1: -8, z0: -1871.6, z1: -1879, top: -28.6 };
export const SPIRIT_STAIR = { x0: -98, x1: -20, z: -1877.4, y0: -28.6, y1: DECK };
/** The bathhouse's front entrance (the noren), where the Kasuga spirits go in and the Radish Spirit waits. */
export const ENTRANCE = new THREE.Vector3(0, DECK, -1906.6);

/** No-Face's spot by the left railing of the bridge. */
export const NOFACE = new THREE.Vector3(-4.2, DECK, -1857);
