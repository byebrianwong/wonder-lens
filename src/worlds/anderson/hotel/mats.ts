import * as THREE from 'three';
import { toon, glow, mesh } from '../../../engine/Builders';
import { boxUV } from '../../../engine/Paint';
import { paving, stucco, fishScales, scallopTrim, stripes, planks } from '../textures';
import { ashlar, GBH, snow, rock } from './textures';

/**
 * Materials shared by every part of the Grand Budapest scene, made once per build (so they merge across the
 * station, the hotel and the lobby).
 */
export function hotelMats() {
  const tex = (t: THREE.Texture, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map: t, ...o });
  const brass = new THREE.MeshStandardMaterial({ color: GBH.gold, metalness: 0.8, roughness: 0.34, emissive: 0x3a2a08, emissiveIntensity: 0.3 });
  return {
    pink: tex(stucco(GBH.pink, 3)),
    pinkDeep: tex(stucco(GBH.pinkDeep, 4)),
    cream: toon(GBH.cream),
    white: toon(GBH.white),
    lavender: toon(GBH.lavender),
    burgundy: toon(GBH.burgundy),
    red: toon(GBH.red),
    iron: toon(0x34383e),
    dark: toon(0x2a2630),
    wood: tex(planks(0x8a5a3e, 61)),
    gold: toon(GBH.gold),
    brass,
    ashlar: tex(ashlar(0xe0cbc6, 7)),
    ashlarDark: tex(ashlar(0xc8b2b2, 8)),
    rock: tex(rock(0x9a8c94, 9)),
    paving: tex(paving(0xe6dcd6, 11)),
    snow: tex(snow(17)),
    roof: tex(fishScales(GBH.burgundy, 5)),
    roofLav: tex(fishScales(GBH.lilac, 6)),
    scallop: new THREE.MeshLambertMaterial({ map: scallopTrim(GBH.cream), alphaTest: 0.5, side: THREE.DoubleSide }),
    awning: new THREE.MeshLambertMaterial({ map: stripes(GBH.pink, GBH.white, 5, true), alphaTest: 0.5, side: THREE.DoubleSide }),
    lamp: glow(0xfff0c8, 1.25),
    lampWarm: glow(0xffd8a0, 1.4),
  };
}
export type HotelMats = ReturnType<typeof hotelMats>;

/** A box whose texture keeps the same size on every face (tile is the world size of one texture repeat). */
export function tbox(w: number, h: number, d: number, mat: THREE.Material, tile: number, x = 0, y = 0, z = 0, tileV = tile) {
  return mesh(boxUV(new THREE.BoxGeometry(w, h, d), tile, tileV), mat, x, y, z);
}

/** Set cast/receive shadow on every mesh under an object. */
export function shade<T extends THREE.Object3D>(o: T, cast = true, receive = true) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = cast && !(m.material as THREE.Material).transparent; m.receiveShadow = receive; } });
  return o;
}

/** A plane facing +z, w x h, with its texture repeated so one repeat covers tile x tileV units. */
export function tplane(w: number, h: number, mat: THREE.Material, tile = w, tileV = h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tileV);
  return new THREE.Mesh(g, mat);
}
