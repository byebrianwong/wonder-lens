import * as THREE from 'three';
import { bark } from '../textures';
import { barrelEnd, barrelStaves, boards, books, bricks, ciderRipples, excavatorPaint, nightGrass, packedEarth, runnerRug, strata, tiles, wallpaper } from './textures';

/*
 * The scene's shared materials, made once. Interiors are lit like a stage set: their painted maps glow a
 * little on their own (emissiveMap = map), so the rooms read warm even where the lamps do not reach.
 */

/** A Lambert material with a painted map that also glows faintly in its own colours. */
export const lit = (map: THREE.Texture, glow = 0.22, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: glow });
export const plain = (color: number, glow = 0) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow });
export const shine = (color: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) });

export function makeMats() {
  const ripples = ciderRipples();
  const m = {
    earth: lit(strata(11), 0.12),
    earthDark: lit(strata(12, true), 0.08),
    floor: lit(packedEarth(0x7a4e2c, 13), 0.08),
    rug: lit(runnerRug(), 0.2),
    bark: lit(bark(0x6a4630, 91), 0.1),
    kitchenWall: lit(wallpaper(0xe8c060, 0xc8783a, 'leaf', 1), 0.3),
    studioWall: lit(wallpaper(0xf0e2c0, 0xd8b080, 'stripe', 2), 0.3),
    studyWall: lit(wallpaper(0x4a6a50, 0x6a8a62, 'diamond', 3), 0.25),
    sittingWall: lit(wallpaper(0xe08a44, 0xf4d090, 'flower', 4), 0.3),
    boysWall: lit(wallpaper(0xd8a860, 0xa84a2a, 'dot', 5), 0.3),
    larderWall: lit(wallpaper(0xe8d8b0, 0xb88a50, 'diamond', 6), 0.25),
    kitchenFloor: lit(tiles(0xf0e0b8, 0xc8603a), 0.2),
    studioFloor: lit(boards(0xc08a50, 19, true), 0.2),
    studyFloor: lit(boards(0x8a5a32, 20), 0.18),
    plaster: plain(0xf8e4b8, 0.55),
    books: lit(books(), 0.2),
    woodDark: plain(0x5a3620, 0.1),
    wood: plain(0x9a6a3e, 0.12),
    woodLight: plain(0xc89a62, 0.12),
    cream: plain(0xf2ead6, 0.15),
    copper: new THREE.MeshStandardMaterial({ color: 0xc8783a, metalness: 0.7, roughness: 0.35, emissive: 0x3a1a08 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.8, roughness: 0.3, emissive: 0x3a2a08 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3634, metalness: 0.6, roughness: 0.5 }),
    red: plain(0xb8402a, 0.12),
    mustard: plain(0xd8a040, 0.12),
    green: plain(0x4a7a4a, 0.12),
    doorGreen: plain(0x3a7a52, 0.1),
    teal: plain(0x3a6a6a, 0.12),
    white: plain(0xf6f2ea, 0.15),
    lampGlow: shine(0xffd890),
    warmGlow: shine(0xffb860),
    glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.5, 0.9) }),
    brick: lit(bricks(), 0.12),
    staves: lit(barrelStaves(), 0.15),
    barrelEnd: lit(barrelEnd(), 0.15),
    cider: new THREE.MeshLambertMaterial({ map: ripples, emissive: 0xffffff, emissiveMap: ripples, emissiveIntensity: 0.55, transparent: true, opacity: 0.94 }),
    grass: lit(nightGrass(), 0.05),
    excavator: lit(excavatorPaint(), 0.05),
  };
  for (const [k, v] of Object.entries(m)) v.name = k;
  return m;
}
export type Mats = ReturnType<typeof makeMats>;
