import * as THREE from 'three';
import { envelope } from '../../../engine/Rig';
import { makeAdult, wear, pillboxCap, beanie, HEAD_R, type Figure } from '../people';

/*
 * The cast of the curtain call, one or two from every scene, in the order they stand across the stage
 * (left to right as the audience sees them). Each scene exports its own builders from <scene>/cast.ts; until
 * a scene's builders exist, a stand-in figure takes its place.
 */

export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

/** A stand-in: a plain figure in the character's colours that bows from the waist. */
function standIn(o: { top: number; bottom: number; hair: number; coat?: number; hat?: (f: Figure) => void; scale?: number; seed: number }): CastMember {
  const f = makeAdult({ hair: o.hair, style: 'short', top: o.top, bottom: { kind: 'trousers', color: o.bottom }, shoes: 0x2a2020, coat: o.coat, scale: o.scale, seed: o.seed });
  o.hat?.(f);
  let t0 = -9;
  return {
    group: f.group,
    bow() { t0 = 0; },
    update(dt, t) {
      t0 += dt;
      const k = envelope(t0, 0, 0.45, 1.3, 2.0);
      f.spine.rotation.x = k * 0.75;
      f.neck.rotation.x = k * 0.2;
      f.shoulder[0].rotation.x = -k * 0.3; f.shoulder[1].rotation.x = -k * 0.3;
      f.tick(dt, t, null);
    },
  };
}

/** Builders for the line, left to right. */
export const CURTAIN_CALL: Array<{ name: string; make: () => CastMember }> = [
  { name: 'Steve Zissou', make: () => standIn({ top: 0x9ac8e8, bottom: 0x9ac8e8, hair: 0x6a5a4a, hat: (f) => { wear(f, beanie(HEAD_R.adult)); }, seed: 11 }) },
  { name: 'Chief', make: () => standIn({ top: 0x2a2a2a, bottom: 0x2a2a2a, hair: 0x1a1a1a, seed: 12 }) },
  { name: 'The alien', make: () => standIn({ top: 0x5a5a5a, bottom: 0x5a5a5a, hair: 0x3a3a3a, scale: 1.5, seed: 13 }) },
  { name: 'Suzy', make: () => standIn({ top: 0xd8607a, bottom: 0xd8607a, hair: 0x8a5a2a, scale: 0.8, seed: 14 }) },
  { name: 'Mr. Fox', make: () => standIn({ top: 0xb8742a, bottom: 0xb8742a, hair: 0xd9782f, seed: 15 }) },
  { name: 'Agatha', make: () => standIn({ top: 0xf4ecdc, bottom: 0x6a8ab8, hair: 0x8a5a3a, seed: 16 }) },
  { name: 'M. Gustave', make: () => standIn({ top: 0xf4f0e8, bottom: 0x5a2a6a, hair: 0x6a5a4a, coat: 0x5a2a6a, seed: 17 }) },
  { name: 'Zero', make: () => standIn({ top: 0x5a2a6a, bottom: 0x5a2a6a, hair: 0x1a1414, hat: (f) => { wear(f, pillboxCap(HEAD_R.adult)); }, scale: 0.92, seed: 18 }) },
  { name: 'Jopling', make: () => standIn({ top: 0x1a1a1a, bottom: 0x1a1a1a, hair: 0x1a1a1a, coat: 0x1a1a1a, seed: 19 }) },
  { name: 'Kylie', make: () => standIn({ top: 0x8a8a7a, bottom: 0x8a8a7a, hair: 0xe8e0d0, scale: 0.8, seed: 20 }) },
  { name: 'Sam', make: () => standIn({ top: 0xb89a5a, bottom: 0xb89a5a, hair: 0x6a4a2a, scale: 0.8, seed: 21 }) },
  { name: 'Augie', make: () => standIn({ top: 0x6a8a9a, bottom: 0x4a4a4a, hair: 0x3a2a1a, seed: 22 }) },
  { name: 'Atari', make: () => standIn({ top: 0xc8c8d0, bottom: 0xc8c8d0, hair: 0x1a1a1a, scale: 0.75, seed: 23 }) },
  { name: 'Pelé', make: () => standIn({ top: 0x9ac8e8, bottom: 0x9ac8e8, hair: 0x1a1414, hat: (f) => { wear(f, beanie(HEAD_R.adult)); }, seed: 24 }) },
];
