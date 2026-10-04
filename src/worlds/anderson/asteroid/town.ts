import * as THREE from 'three';
import { buildDetailedTrack, glow, mergeStatic, mesh, type Placement } from '../../../engine/Builders';
import { boxUV, repeatUV } from '../../../engine/Paint';
import { Rng, TAU, lerp } from '../../../engine/math';
import { subCurve, type Road } from '../common';
import { chunkedParts } from '../kit';
import { stripes as stripesTex } from '../textures';
import { FUTURA } from '../film';
import {
  AC, BERM, BOOTH, COWBOYS, CRATER, bermY, DINER, GAS, HOUSE, MOTEL, OBSERVATORY, OVERPASS, PATH_Y, PODIUM, ROAD, SIGN, STAGE_Y, STARGAZERS, TRACK, VENDING,
} from './plan';
import { bunting, cactusRibs, dinerBack, dinerFloor, floorCloth, lettering, mushroomCloud, notice, plaster, plywood, roadTex, townSign, vendFace } from './textures';
import { boxAt, castAll, cylAt, merge, poly, rodGeometry, sandbagGeometry, slab, SignAtlas } from './kit';

/**
 * The town of Asteroid City, life size on the stage: the track and the road, the town sign, the motor court's
 * cabins and its vending machines, the gas station, the telephone booth, the diner cut away like a doll's
 * house, the overpass that stops in mid-air, the Asteroid Day podium, the observatory and its dish, and the
 * crater with the meteorite in its cage. Buildings are built facing +z and turned to face the track.
 */

export interface Town {
  statics: THREE.Group;
  live: THREE.Group;
  occluders: THREE.Object3D[];
  /** where the subjects' photographic centres sit */
  anchors: Record<'diner' | 'vending' | 'overpass' | 'meteorite' | 'crater', THREE.Object3D>;
  /** the meteorite (a child of the cage until the alien takes it) and the cage's lid */
  meteorite: THREE.Mesh;
  cageLid: THREE.Group;
  /** the radio dish's head, which turns to follow the UFO */
  dish: THREE.Group;
  /** the vending machines dispense: a martini or a deed */
  dispense(kind: 'martini' | 'deed'): void;
  /** the mushroom cloud's flat, raised from below the stage on a cue */
  cloud: THREE.Group;
  /** every sign and window in town flickers on for a few seconds (the whistle at the diner) */
  flicker(): void;
  /** the meteorite's flecks glow (0..1) */
  glowRock(k: number): void;
  update(dt: number, t: number, night: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function buildTown(road: Road, rng: Rng): Town {
  const statics = new THREE.Group(), live = new THREE.Group();
  const occluders: THREE.Object3D[] = [];

  // ---------- shared materials ----------
  const lam = new Map<string, THREE.MeshLambertMaterial>();
  const mat = (color: number, o: THREE.MeshLambertMaterialParameters = {}) => {
    const k = `${color}|${JSON.stringify(o)}`;
    let m = lam.get(k);
    if (!m) { m = new THREE.MeshLambertMaterial({ color, ...o }); lam.set(k, m); }
    return m;
  };
  // pastel plaster: one white texture tinted by the colour (unifyColours turns the tint into vertex colours)
  const plasterTex = plaster(0xffffff, 701);
  const plasterMats = new Map<number, THREE.MeshLambertMaterial>();
  const pl = (c: number) => { let m = plasterMats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ map: plasterTex, color: c }); m.userData.tintable = true; plasterMats.set(c, m); } return m; };
  const chrome = new THREE.MeshStandardMaterial({ color: AC.chrome, metalness: 0.7, roughness: 0.28, emissive: 0x30343a, emissiveIntensity: 0.6 });
  const white = mat(AC.white), dark = mat(AC.dark), red = mat(AC.red);
  const wood = mat(0xc8a878);
  // painted textures used in several places are made once
  const stripeCache = new Map<string, THREE.Texture>();
  const stripes = (a: number, b: number, n = 4, scallop = false) => { const k = `${a}|${b}|${n}|${scallop}`; let t = stripeCache.get(k); if (!t) { t = stripesTex(a, b, n, scallop); stripeCache.set(k, t); } return t; };
  const plyTex = plywood(477);
  const plyMat = new THREE.MeshLambertMaterial({ map: plyTex });
  /** emissive materials that brighten at night: [material, day intensity, night intensity] */
  const nightGlow: Array<[THREE.MeshLambertMaterial | THREE.MeshStandardMaterial, number, number]> = [];
  // every lettered sign shares one atlas: one material for plain signs, one for signs that light up at night
  const atlas = new SignAtlas(2048);
  const signMat = new THREE.MeshLambertMaterial({ map: atlas.texture });
  const signGlow = new THREE.MeshLambertMaterial({ map: atlas.texture, emissive: 0xffffff, emissiveMap: atlas.texture, emissiveIntensity: 0.1 });
  nightGlow.push([signGlow, 0.1, 0.95]);
  /** a sign panel facing +z from the atlas */
  const sign = (tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, glowing = false, k = 1) => mesh(atlas.plane(atlas.put(tex, k), w, h), glowing ? signGlow : signMat, x, y, z);
  /** the same picture on several panels */
  const signRect = (tex: THREE.Texture, k = 1) => atlas.put(tex, k);
  const tiledBox = (w: number, h: number, d: number, m: THREE.Material, tile: number, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), tile), m, x, y, z);
  /** a flat panel facing +z with a texture */
  const panel = (w: number, h: number, m: THREE.Material, x: number, y: number, z: number) => mesh(new THREE.PlaneGeometry(w, h), m, x, y, z);

  // =====================================================================================================
  // THE TRACK: brass-bright rails on sleepers down the runway, then a gravel bed across the stage, ending
  // at a buffer stop on the crater's rim
  // =====================================================================================================
  {
    const z0 = HOUSE.z0 - 1, z1 = TRACK.runwayEnd, len = z0 - z1;
    for (const s of [-1, 1]) statics.add(mesh(boxAt(0.1, 0.15, len, s * 0.75, PATH_Y + 0.215, (z0 + z1) / 2), mat(0xc8c8cc)));
    const sl: THREE.BufferGeometry[] = [];
    for (let z = z0 - 0.6; z > z1; z -= 1.2) sl.push(boxAt(2.4, 0.14, 0.38, 0, PATH_Y + 0.07, z));
    statics.add(mesh(merge(sl), mat(0x3a3a3c)));
    const bed = buildDetailedTrack(subCurve(road, TRACK.bedStart, TRACK.buffer + 0.5, 40));
    live.add(bed);
    // the buffer stop: a striped beam on two posts with a red lamp, braced back into the crater's rim
    const bz = TRACK.buffer;
    const stripe = new THREE.MeshLambertMaterial({ map: stripes(AC.red, AC.white, 4) });
    statics.add(mesh(boxAt(2.8, 0.5, 0.4, 0, PATH_Y + 1.0, bz), stripe));
    for (const s of [-1, 1]) {
      statics.add(mesh(boxAt(0.3, 1.3, 0.3, s * 1.1, PATH_Y + 0.6, bz - 0.1), dark));
      const brace = new THREE.BoxGeometry(0.22, 1.9, 0.22); brace.rotateX(-0.75); brace.translate(s * 1.1, PATH_Y + 0.6, bz - 0.8);
      statics.add(mesh(brace, dark));
    }
    statics.add(mesh(cylAt(0.18, 0.18, 0.3, 0, PATH_Y + 1.5, bz, 10), dark), mesh(new THREE.SphereGeometry(0.16, 10, 8).translate(0, PATH_Y + 1.62, bz + 0.02), glow(0xff4a3a, 1.4)));
  }

  // =====================================================================================================
  // THE ROAD, with a turn off into the wings at the far end, and telegraph poles along it
  // =====================================================================================================
  {
    const rt = new THREE.MeshLambertMaterial({ map: roadTex() });
    const len = ROAD.z0 - ROAD.z1;
    const r = mesh(repeatUV(new THREE.PlaneGeometry(ROAD.half * 2, len), 1, len / 10), rt, ROAD.x, STAGE_Y + 0.03, (ROAD.z0 + ROAD.z1) / 2);
    r.rotation.x = -Math.PI / 2; r.receiveShadow = true; statics.add(r);
    const tl = 44, tg = repeatUV(new THREE.PlaneGeometry(ROAD.half * 2, tl), 1, tl / 10);
    tg.rotateX(-Math.PI / 2); tg.rotateY(Math.PI / 2); tg.translate(ROAD.x - ROAD.half - tl / 2, STAGE_Y + 0.031, ROAD.z1 - ROAD.half);
    const turn = mesh(tg, rt); turn.receiveShadow = true; statics.add(turn);
    // telegraph poles along the far side of the road, wired together
    const poles: THREE.BufferGeometry[] = [], wires: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    const px = ROAD.x - ROAD.half - 2.4;
    let prev: THREE.Vector3[] | null = null;
    for (let z = ROAD.z0 - 4; z > ROAD.z1 + 2; z -= 24) {
      poles.push(cylAt(0.13, 0.17, 9, px, STAGE_Y + 4.5, z, 7), boxAt(2.6, 0.16, 0.16, px, STAGE_Y + 8.3, z), boxAt(1.8, 0.14, 0.14, px, STAGE_Y + 7.5, z));
      const tops = [-1.1, -0.4, 0.4, 1.1].map((dx) => V(px + dx, STAGE_Y + 8.55, z));
      for (const tp of tops) glass.push(new THREE.CylinderGeometry(0.06, 0.08, 0.18, 6).translate(tp.x, tp.y - 0.05, tp.z));
      if (prev) tops.forEach((tp, i) => { const a = prev![i]; const mid = a.clone().lerp(tp, 0.5); mid.y -= 0.6; wires.push(rodGeometry(a, mid, 0.025, 3), rodGeometry(mid, tp, 0.025, 3)); });
      prev = tops;
    }
    statics.add(castAll(mesh(merge(poles), mat(0x8a6a50)), true, false), mesh(merge(wires), dark), mesh(merge(glass), mat(0x8ad0c8, { emissive: 0x2a4a48 })));
  }

  // =====================================================================================================
  // THE TOWN SIGN, by the track just inside the arch
  // =====================================================================================================
  {
    const g = new THREE.Group();
    g.add(sign(townSign(), 10, 5, 0, 6.1, 0.12, true));
    g.add(mesh(boxAt(10.5, 5.5, 0.2, 0, 6.1, 0), mat(AC.coral)));
    for (const s of [-1, 1]) g.add(mesh(cylAt(0.16, 0.2, 9, s * 3.6, 4.0, -0.15, 8), white), mesh(boxAt(0.6, 0.12, 0.6, s * 3.6, 0.06, -0.15), white));
    // bulbs along the top, as on a roadside sign
    const bulbs: THREE.BufferGeometry[] = [];
    for (let x = -4.8; x <= 4.81; x += 0.6) bulbs.push(new THREE.SphereGeometry(0.1, 6, 4).translate(x, 8.95, 0.18));
    const bulbM = new THREE.MeshLambertMaterial({ color: 0xfff2c8, emissive: 0xffe6a0, emissiveIntensity: 0.5 });
    nightGlow.push([bulbM, 0.5, 1.6]);
    g.add(mesh(merge(bulbs), bulbM));
    g.position.set(SIGN.x, STAGE_Y, SIGN.z);
    g.rotation.y = -0.5;
    castAll(g, true, false);
    statics.add(g);
  }

  // =====================================================================================================
  // THE MOTOR COURT: a row of pastel cabins facing the track, the office, the sign on its pole
  // =====================================================================================================
  const curtains = (seed: number) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f8e8c0'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = seed % 2 ? '#f2b8b0' : '#bfe0d0';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(46, 48, 0, 96); g.fill();
    g.beginPath(); g.moveTo(128, 0); g.quadraticCurveTo(82, 48, 128, 96); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(62, 0, 4, 96); g.fillRect(0, 46, 128, 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const winRects = [signRect(curtains(0)), signRect(curtains(1))];
  const win = (i: number, w: number, h: number, x: number, y: number, z: number) => mesh(atlas.plane(winRects[i % 2], w, h), signGlow, x, y, z);
  {
    const cols = [AC.mint, AC.coral, AC.butter, AC.pink, AC.turquoise];
    const trims = [AC.coral, AC.turquoise, AC.coral, AC.turquoise, AC.butter];
    for (let i = 0; i < MOTEL.n; i++) {
      const c = new THREE.Group();
      const W = 6.2, D = 6, Hh = 3.7;
      c.add(tiledBox(W, Hh, D, pl(cols[i]), 4, 0, Hh / 2, 0));
      c.add(mesh(boxAt(W + 0.9, 0.36, D + 0.9, 0, Hh + 0.18, 0), white), mesh(boxAt(W + 0.95, 0.18, D + 0.95, 0, Hh + 0.02, 0), mat(trims[i])));
      // door, its frame and knob; the window with its curtains; the cabin's number
      c.add(mesh(boxAt(1.1, 2.3, 0.12, -1.6, 1.15, D / 2 + 0.03), mat(trims[i])), mesh(boxAt(1.4, 2.5, 0.06, -1.6, 1.25, D / 2 + 0.01), white));
      c.add(mesh(new THREE.SphereGeometry(0.07, 6, 4).translate(-1.2, 1.15, D / 2 + 0.12), chrome));
      c.add(mesh(boxAt(2.2, 1.5, 0.08, 1.3, 2.0, D / 2 + 0.02), white), win(i, 1.9, 1.25, 1.3, 2.0, D / 2 + 0.07));
      c.add(sign(lettering([{ text: String(i + 1), font: `bold 80px ${FUTURA}`, color: '#2a2c30', y: 0.55 }], { w: 128, h: 128, bg: '#fbf6ec', round: 64 }), 0.5, 0.5, -1.6, 2.75, D / 2 + 0.1));
      // a stoop, a porch lamp, a metal lawn chair
      c.add(mesh(boxAt(2.2, 0.25, 1.4, -1.6, 0.12, D / 2 + 0.7), mat(0xe8e0d4)));
      c.add(mesh(new THREE.SphereGeometry(0.16, 8, 6).translate(-0.6, 2.9, D / 2 + 0.2), glow(0xfff0c8, 1.2)));
      const chair = merge([boxAt(0.7, 0.08, 0.7, 0, 0.5, 0), boxAt(0.7, 0.7, 0.08, 0, 0.85, -0.33), boxAt(0.06, 0.5, 0.06, -0.3, 0.25, 0.3), boxAt(0.06, 0.5, 0.06, 0.3, 0.25, 0.3), boxAt(0.06, 0.5, 0.06, -0.3, 0.25, -0.3), boxAt(0.06, 0.5, 0.06, 0.3, 0.25, -0.3)]);
      chair.rotateY(0.4 + i * 0.3); chair.translate(1.6, 0, D / 2 + 1.6);
      c.add(mesh(chair, mat(trims[(i + 2) % 5])));
      c.position.set(MOTEL.x, STAGE_Y, MOTEL.z0 - i * MOTEL.step);
      c.rotation.y = -Math.PI / 2;
      castAll(c, true, true);
      statics.add(c);
    }
    // the office, nearest the arch, and the MOTOR COURT sign on a tall pole with an arrow
    const o = new THREE.Group();
    o.add(tiledBox(8, 4.2, 7, pl(AC.cream), 4, 0, 2.1, 0));
    o.add(mesh(boxAt(9.2, 0.4, 8.2, 0, 4.4, 0), mat(AC.coral)));
    o.add(mesh(boxAt(5.2, 2.2, 0.1, 0.8, 2.0, 3.52), white), win(0, 4.9, 1.9, 0.8, 2.0, 3.58));
    const offTex = notice('OFFICE', null, { bg: AC.white, fg: AC.red, w: 256, h: 80 });
    o.add(sign(offTex, 2.6, 0.8, -2.2, 3.4, 3.56));
    o.position.set(MOTEL.x + 1, STAGE_Y, MOTEL.office);
    o.rotation.y = -Math.PI / 2;
    castAll(o, true, true);
    statics.add(o);
    const pole = new THREE.Group();
    pole.add(mesh(cylAt(0.2, 0.24, 13, 0, 6.5, 0, 8), white));
    const signTex = lettering([
      { text: 'MOTOR COURT', font: `bold 64px ${FUTURA}`, color: hex(AC.white), y: 0.36 },
      { text: 'Asteroid City', font: 'italic 46px Georgia, serif', color: hex(AC.butter), y: 0.7 },
    ], { w: 512, h: 256, bg: hex(AC.turquoise), border: hex(AC.white), borderW: 8 });
    pole.add(sign(signTex, 5, 2.5, 0, 11.6, 0.14, true), mesh(boxAt(5.3, 2.8, 0.22, 0, 11.6, 0), mat(AC.coral)));
    const vac = lettering([{ text: 'VACANCY', font: `bold 58px ${FUTURA}`, color: hex(AC.red), y: 0.55 }], { w: 384, h: 96, bg: hex(AC.butter) });
    pole.add(sign(vac, 3.2, 0.8, 0, 9.6, 0.12, true), mesh(boxAt(3.4, 1.0, 0.18, 0, 9.6, 0), mat(AC.coral)));
    const arrow = poly([[0, 0], [3.8, 0], [3.8, -0.5], [5.2, 0.5], [3.8, 1.5], [3.8, 1], [0, 1]]);
    const ar = slab(arrow, 0.2, mat(AC.butter), mat(AC.butter), mat(AC.butter), 1, 4); ar.position.set(-2.4, 7.4, -0.1); pole.add(ar);
    pole.position.set(11.5, STAGE_Y, -1599);
    pole.rotation.y = -0.45;
    castAll(pole, true, false);
    statics.add(pole);
  }

  // =====================================================================================================
  // THE VENDING MACHINES by the track: martinis, deeds to land, cold milk, cigarettes
  // =====================================================================================================
  const vend = new THREE.Group(), vendLive = new THREE.Group();
  const dispensed: THREE.Object3D[] = [];
  {
    const machines: Array<[string, string, number, string[]]> = [
      ['MARTINIS', 'dry, with a twist', AC.pink, ['GIN', 'VODKA', 'OLIVE', 'TWIST']],
      ['DEED TO LAND', 'one acre, $25 in quarters', AC.mint, ['LOT 12', 'LOT 13', 'LOT 14', 'LOT 15']],
      ['COLD MILK', 'pasteurized', AC.white, ['WHOLE', 'BUTTER', 'CHOCOLATE', 'MALTED']],
      ['CIGARETTES', 'twenty-five cents', AC.butter, ['FILTER', 'PLAIN', 'MENTHOL', 'CIGAR']],
    ];
    machines.forEach(([label, sub, col, items], i) => {
      const x = (i - 1.5) * 1.45;
      vend.add(mesh(boxAt(1.3, 2.2, 0.95, x, 1.1, 0), pl(col)));
      const cap = new THREE.CylinderGeometry(0.65, 0.65, 0.95, 14, 1, false, -Math.PI / 2, Math.PI); cap.rotateX(Math.PI / 2); cap.scale(1, 0.4, 1); cap.translate(x, 2.2, 0);
      vend.add(mesh(cap, pl(col)));
      vend.add(sign(vendFace(label, sub, col, items, 460 + i), 1.12, 2.0, x, 1.12, 0.481, true));
      vend.add(mesh(boxAt(1.34, 0.08, 1.0, x, 0.04, 0), chrome), mesh(boxAt(0.06, 2.2, 0.06, x - 0.64, 1.1, 0.48), chrome), mesh(boxAt(0.06, 2.2, 0.06, x + 0.64, 1.1, 0.48), chrome));
    });
    // a little striped awning over them on chrome posts
    const aw = mesh(repeatUV(new THREE.PlaneGeometry(6.6, 1.8), 2, 1), new THREE.MeshLambertMaterial({ map: stripes(AC.turquoise, AC.white, 4, true), side: THREE.DoubleSide, alphaTest: 0.5 }), 0, 3.1, 0.7);
    aw.rotation.x = -0.6; vend.add(aw);
    for (const s of [-1, 1]) vend.add(mesh(cylAt(0.05, 0.05, 3.2, s * 3.2, 1.6, 1.3, 6), chrome));
    vend.add(mesh(boxAt(6.6, 0.12, 0.12, 0, 3.4, 0.05), chrome));
    // a paved pad and a trash can
    vend.add(mesh(boxAt(7.2, 0.12, 3.2, 0, 0.06, 0.6), mat(0xe8e0d4)));
    vend.add(mesh(cylAt(0.35, 0.3, 0.9, 3.7, 0.45, 0.4, 10), chrome));
    // what comes out: a martini glass and a folded deed, waiting in the trays
    const martini = new THREE.Group();
    martini.add(mesh(new THREE.ConeGeometry(0.16, 0.18, 10, 1, true).rotateX(Math.PI).translate(0, 0.2, 0), mat(0xe8f4f4, { transparent: true, opacity: 0.6, side: THREE.DoubleSide })));
    martini.add(mesh(cylAt(0.012, 0.012, 0.16, 0, 0.06, 0, 4), mat(0xe8f4f4)), mesh(cylAt(0.07, 0.07, 0.01, 0, 0, 0, 10), mat(0xe8f4f4)));
    martini.add(mesh(new THREE.SphereGeometry(0.03, 6, 4).translate(0.03, 0.24, 0), mat(0x6a9a3a)));
    martini.position.set(-1.5 * 1.45, 0.27, 0.62);
    const deed = mesh(atlas.remap(boxAt(0.36, 0.02, 0.24, 0, 0, 0), signRect(lettering([{ text: 'DEED', font: `bold 40px Georgia, serif`, color: '#3a5a4a', y: 0.5 }], { w: 128, h: 80, bg: '#f4ecd0', border: '#3a5a4a', borderW: 4 }))), signMat);
    const dg = new THREE.Group(); dg.add(deed); dg.position.set(-0.5 * 1.45, 0.27, 0.62);
    for (const d of [martini, dg]) { d.visible = false; vendLive.add(d); dispensed.push(d); }
    for (const g of [vend, vendLive]) { g.position.set(VENDING.x, STAGE_Y, VENDING.z); g.rotation.y = -Math.PI / 2; }
    castAll(vend, true, true);
    statics.add(vend);
    live.add(vendLive);
  }

  // =====================================================================================================
  // THE GAS STATION, across the road: office and service bay, the canopy over two pumps, a station wagon
  // with its hood up
  // =====================================================================================================
  {
    const g = new THREE.Group();
    g.add(tiledBox(6, 4.2, 6, pl(AC.butter), 4, -4, 2.1, -2));
    g.add(tiledBox(7, 4.8, 7, pl(AC.cream), 4, 3.0, 2.4, -2.5));
    g.add(mesh(boxAt(6.6, 0.4, 6.6, -4, 4.4, -2), mat(AC.coral)), mesh(boxAt(7.6, 0.4, 7.6, 3, 5.0, -2.5), mat(AC.turquoise)));
    const door = new THREE.MeshLambertMaterial({ map: stripes(0xf0ece4, 0xd8d4cc, 8) });
    const dg = new THREE.PlaneGeometry(4.6, 3.6); dg.rotateZ(Math.PI / 2);
    g.add(mesh(dg, door, 3, 1.8, 1.02));
    g.add(mesh(boxAt(4.4, 2.0, 0.08, -4, 2.1, 1.02), white), win(1, 4.0, 1.7, -4, 2.1, 1.08));
    const svc = notice('SERVICE', null, { bg: AC.turquoise, fg: AC.white, w: 512, h: 112 });
    g.add(sign(svc, 5.5, 1.2, 3, 4.2, 1.03));
    // the canopy and the pumps
    g.add(mesh(boxAt(11, 0.5, 6, -0.5, 5.2, 4.2), white), mesh(boxAt(11.1, 0.3, 6.1, -0.5, 4.9, 4.2), mat(AC.coral)));
    for (const x of [-4.5, 3.5]) g.add(mesh(cylAt(0.2, 0.2, 4.7, x, 2.35, 6.4, 8), white));
    g.add(mesh(boxAt(7.5, 0.3, 1.6, -0.5, 0.15, 5.2), mat(0xe8e0d4)));
    for (const x of [-3, 2]) {
      g.add(mesh(boxAt(0.9, 1.7, 0.7, x, 1.15, 5.2), red), mesh(boxAt(0.7, 0.5, 0.06, x, 1.45, 5.56), white));
      const globe = new THREE.MeshLambertMaterial({ color: 0xfff6e8, emissive: 0xfff0d0, emissiveIntensity: 0.3 });
      nightGlow.push([globe, 0.3, 1.2]);
      g.add(mesh(new THREE.SphereGeometry(0.36, 12, 8).translate(x, 2.35, 5.2), globe));
      const hose = new THREE.TorusGeometry(0.35, 0.04, 4, 12, Math.PI); hose.rotateY(Math.PI / 2); hose.translate(x + 0.47, 1.1, 5.2);
      g.add(mesh(hose, dark));
    }
    // the sign: a disc on a tall pole, and the price
    const gasTex = lettering([{ text: 'GAS', font: `bold 120px ${FUTURA}`, color: hex(AC.white), y: 0.55 }], { w: 256, h: 256, bg: hex(AC.red), round: 128 });
    const disc = new THREE.Mesh(atlas.remap(new THREE.CircleGeometry(1.6, 28), signRect(gasTex)), signGlow);
    disc.position.set(-7.5, 9.0, 6.6); g.add(disc);
    g.add(mesh(new THREE.TorusGeometry(1.6, 0.12, 6, 28).translate(-7.5, 9.0, 6.6), chrome), mesh(cylAt(0.14, 0.16, 9, -7.5, 4.5, 6.4, 8), white));
    const price = lettering([{ text: '29.9¢', font: `bold 64px ${FUTURA}`, color: '#2a2c30', y: 0.55 }], { w: 256, h: 96, bg: '#fbf6ea' });
    g.add(sign(price, 2.0, 0.75, -7.5, 6.9, 6.62));
    // tyres and oil cans
    const tyre = new THREE.TorusGeometry(0.42, 0.18, 6, 14); tyre.rotateX(Math.PI / 2);
    for (let k = 0; k < 4; k++) g.add(mesh(tyre.clone().translate(6.4, 0.18 + k * 0.36, 2), dark));
    for (let k = 0; k < 5; k++) g.add(mesh(cylAt(0.22, 0.22, 0.6, -6.6 + (k % 3) * 0.5, 0.3 + Math.floor(k / 3) * 0.6, 1.4 + (k % 2) * 0.3, 8), mat(k % 2 ? AC.turquoise : AC.red)));
    // the station wagon at the pump, hood up
    const car = new THREE.Group();
    const paint = pl(AC.mint);
    car.add(mesh(boxAt(2.1, 0.8, 5.0, 0, 0.8, 0), paint), mesh(boxAt(1.9, 0.7, 3.0, 0, 1.55, -0.6), paint));
    car.add(mesh(boxAt(1.92, 0.5, 2.8, 0, 1.58, -0.6), mat(0xcfe8f0, { emissive: 0x203038 })));
    for (const s of [-1, 1]) car.add(mesh(boxAt(0.05, 0.5, 2.8, s * 1.06, 0.85, -0.9), plyMat));
    car.add(mesh(boxAt(1.94, 0.12, 3.1, 0, 1.94, -0.6), white), mesh(boxAt(2.2, 0.18, 0.3, 0, 0.5, 2.5), chrome), mesh(boxAt(2.2, 0.18, 0.3, 0, 0.5, -2.5), chrome));
    for (const s of [-1, 1]) for (const z of [-1.6, 1.6]) { const w = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12); w.rotateZ(Math.PI / 2); w.translate(s * 1.0, 0.4, z); car.add(mesh(w, dark)); }
    const hood = new THREE.Group(); hood.add(mesh(boxAt(2.0, 0.08, 1.5, 0, 0, -0.75), paint)); hood.position.set(0, 1.22, 2.4); hood.rotation.x = -1.1; car.add(hood);
    car.add(mesh(boxAt(1.4, 0.4, 1.0, 0, 1.1, 1.8), mat(0x5a5a60)));
    car.position.set(-0.5, 0, 8.4); car.rotation.y = Math.PI / 2 + 0.06;
    g.add(car);
    g.position.set(GAS.x, STAGE_Y, GAS.z);
    g.rotation.y = Math.PI / 2;
    castAll(g, true, true);
    statics.add(g);
    occluders.push(g);
  }

  // =====================================================================================================
  // THE TELEPHONE BOOTH
  // =====================================================================================================
  {
    const g = new THREE.Group();
    const frame: THREE.BufferGeometry[] = [];
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) frame.push(boxAt(0.1, 2.6, 0.1, x, 1.3, z));
    frame.push(boxAt(1.4, 0.3, 1.4, 0, 2.75, 0), boxAt(1.3, 0.12, 1.3, 0, 0.06, 0), boxAt(1.2, 0.08, 0.08, 0, 1.0, 0.6), boxAt(1.2, 0.08, 0.08, 0, 1.0, -0.6), boxAt(0.08, 0.08, 1.2, 0.6, 1.0, 0), boxAt(0.08, 0.08, 1.2, -0.6, 1.0, 0));
    g.add(mesh(merge(frame), mat(AC.turquoise)));
    const glassM = new THREE.MeshLambertMaterial({ color: 0xdff2f2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z, ry] of [[0, 0.6, 0], [0, -0.6, 0], [0.6, 0, Math.PI / 2], [-0.6, 0, Math.PI / 2]] as const) { const p = panel(1.1, 2.4, glassM, x, 1.4, z); p.rotation.y = ry; g.add(p); }
    g.add(mesh(boxAt(0.4, 0.55, 0.2, 0, 1.5, -0.48), dark), mesh(boxAt(0.1, 0.35, 0.1, 0.14, 1.65, -0.38), dark));
    const tel = lettering([{ text: 'TELEPHONE', font: `bold 44px ${FUTURA}`, color: hex(AC.white), y: 0.55 }], { w: 320, h: 64, bg: hex(AC.coral) });
    const telR = signRect(tel);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const p = mesh(atlas.plane(telR, 1.3, 0.26), signGlow, Math.sin(ry) * 0.71, 2.75, Math.cos(ry) * 0.71); p.rotation.y = ry; g.add(p); }
    const bulb = new THREE.MeshLambertMaterial({ color: 0xfff6e0, emissive: 0xfff0c0, emissiveIntensity: 0.2 });
    nightGlow.push([bulb, 0.2, 1.4]);
    g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 2.5, 0), bulb));
    g.position.set(BOOTH.x, STAGE_Y, BOOTH.z);
    g.rotation.y = Math.PI / 2;
    statics.add(g);
  }

  // =====================================================================================================
  // THE DINER, its front cut away like a doll's house: checkered floor, the counter and its stools, booths,
  // the menu, pies; its name in lights on the roof
  // =====================================================================================================
  const dinerAnchor = new THREE.Object3D();
  {
    const g = new THREE.Group();
    const L = DINER.len, D = DINER.depth, Hh = 4.8;
    const floorM = new THREE.MeshLambertMaterial({ map: dinerFloor() });
    g.add(mesh(boxUV(new THREE.BoxGeometry(L, 0.4, D), 2.4), floorM, 0, 0.2, 0));
    // back wall (inside painted), side walls with their cut edges, the roof with a chrome band
    g.add(tiledBox(L, Hh, 0.4, pl(AC.cream), 4, 0, 0.4 + Hh / 2, -D / 2 + 0.2));
    g.add(sign(dinerBack(), L - 0.8, Hh - 0.2, 0, 0.4 + Hh / 2, -D / 2 + 0.41, true));
    for (const s of [-1, 1]) g.add(tiledBox(0.4, Hh, D, pl(AC.mint), 4, s * (L / 2 - 0.2), 0.4 + Hh / 2, 0));
    g.add(mesh(boxAt(L + 1.2, 0.6, D + 1.2, 0, Hh + 0.7, 0), white), mesh(boxAt(L + 1.3, 0.22, D + 1.3, 0, Hh + 0.42, 0), chrome), mesh(boxAt(L + 1.25, 0.3, D + 1.25, 0, Hh + 1.1, 0), mat(AC.coral)));
    g.add(mesh(boxAt(L + 0.2, 0.25, 0.25, 0, 0.55, D / 2 - 0.1), chrome));
    // the cut edges of the walls, painted raw like a set
    for (const s of [-1, 1]) g.add(mesh(boxAt(0.42, Hh, 0.05, s * (L / 2 - 0.2), 0.4 + Hh / 2, D / 2 + 0.01), mat(0xb8a890)));
    // counter with a chrome edge and a row of stools
    const cz = -D / 2 + 2.6;
    g.add(mesh(boxAt(L - 4, 1.1, 1.0, 0, 0.95, cz), mat(AC.turquoise)), mesh(boxAt(L - 3.8, 0.12, 1.3, 0, 1.56, cz), white), mesh(boxAt(L - 3.8, 0.1, 0.06, 0, 1.45, cz + 0.66), chrome));
    for (let k = 0; k < 4; k++) g.add(mesh(boxAt(L - 4, 0.05, 0.03, 0, 0.6 + k * 0.22, cz + 0.52), chrome));
    const stools: THREE.BufferGeometry[] = [], seatsG: THREE.BufferGeometry[] = [];
    for (let x = -L / 2 + 3; x <= L / 2 - 3; x += 1.5) { stools.push(cylAt(0.06, 0.06, 0.75, x, 0.78, cz + 1.25, 6), cylAt(0.3, 0.34, 0.06, x, 0.42, cz + 1.25, 10)); seatsG.push(cylAt(0.32, 0.3, 0.16, x, 1.2, cz + 1.25, 12)); }
    g.add(mesh(merge(stools), chrome), mesh(merge(seatsG), red));
    // a pie case and a coffee urn on the counter; globe lamps overhead
    g.add(mesh(boxAt(1.6, 0.7, 0.8, -3.5, 1.97, cz), mat(0xe0f2f4, { transparent: true, opacity: 0.45 })));
    for (let k = 0; k < 3; k++) g.add(mesh(cylAt(0.28, 0.28, 0.1, -4 + k * 0.5, 1.75, cz, 12), mat(k % 2 ? 0xe8a860 : 0xd8705a)));
    g.add(mesh(cylAt(0.35, 0.3, 0.9, 4.2, 2.07, cz, 12), chrome), mesh(new THREE.SphereGeometry(0.2, 8, 6).translate(4.2, 2.6, cz), chrome));
    const globes: THREE.BufferGeometry[] = [];
    for (let x = -L / 2 + 3; x <= L / 2 - 3; x += 4) { globes.push(new THREE.SphereGeometry(0.34, 12, 8).translate(x, Hh - 0.4, -0.5)); g.add(mesh(cylAt(0.02, 0.02, 0.9, x, Hh + 0.05, -0.5, 4), dark)); }
    const globeM = new THREE.MeshLambertMaterial({ color: 0xfff8e8, emissive: 0xfff0c8, emissiveIntensity: 0.5 });
    nightGlow.push([globeM, 0.5, 1.5]);
    g.add(mesh(merge(globes), globeM));
    // two booths at the near end, a jukebox at the far end
    for (const x of [-L / 2 + 2.4]) {
      g.add(mesh(boxAt(2.6, 0.5, 1.0, x, 0.65, 1.2), mat(AC.coral)), mesh(boxAt(2.6, 1.2, 0.3, x, 1.2, 0.8), mat(AC.coral)));
      g.add(mesh(boxAt(2.6, 0.5, 1.0, x, 0.65, 3.6), mat(AC.coral)), mesh(boxAt(2.6, 1.2, 0.3, x, 1.2, 4.0), mat(AC.coral)));
      g.add(mesh(boxAt(2.2, 0.1, 1.1, x, 1.4, 2.4), white), mesh(cylAt(0.08, 0.08, 1.0, x, 0.9, 2.4, 6), chrome));
    }
    const juke = new THREE.Group();
    juke.add(mesh(boxAt(1.2, 1.4, 0.8, 0, 1.1, 0), mat(0x8a4a2a)));
    const arch = new THREE.CylinderGeometry(0.6, 0.6, 0.8, 14, 1, false, -Math.PI / 2, Math.PI); arch.rotateX(Math.PI / 2); arch.translate(0, 1.8, 0);
    const jm = new THREE.MeshLambertMaterial({ color: 0xffd0a0, emissive: 0xffa060, emissiveIntensity: 0.5 });
    nightGlow.push([jm, 0.5, 1.3]);
    juke.add(mesh(arch, jm));
    juke.position.set(L / 2 - 1.6, 0, 2.5); juke.rotation.y = -0.6;
    g.add(juke);
    // the name in lights on the roof, and EAT on a blade sign at the corner
    const nameTex = lettering([{ text: 'DINER', font: `bold 150px ${FUTURA}`, color: hex(AC.coral), y: 0.56 }], { w: 768, h: 192, bg: hex(AC.white), border: hex(AC.turquoise), borderW: 12 });
    g.add(sign(nameTex, 9, 2.25, 0, Hh + 2.7, 0.62, true), mesh(boxAt(9.4, 2.6, 0.3, 0, Hh + 2.7, 0.4), mat(AC.turquoise)));
    for (const s of [-1, 1]) g.add(mesh(boxAt(0.15, 1.5, 0.15, s * 3.8, Hh + 1.4, 0.4), dark));
    const eat = lettering([{ text: 'EAT', font: `bold 110px ${FUTURA}`, color: hex(AC.butter), y: 0.55 }], { w: 256, h: 160, bg: '#2f4a5e' });
    const eatR = signRect(eat);
    const blade = new THREE.Group();
    blade.add(mesh(boxAt(0.2, 1.6, 2.4, 0, 0, 0), mat(0x2f4a5e)));
    for (const s of [-1, 1]) { const p = mesh(atlas.plane(eatR, 2.3, 1.45), signGlow, s * 0.11, 0, 0); p.rotation.y = s * Math.PI / 2; blade.add(p); }
    blade.position.set(L / 2 + 0.3, Hh - 0.5, D / 2 - 1.4);
    g.add(blade);
    dinerAnchor.position.set(0, 2.6, 0);
    g.add(dinerAnchor);
    g.position.set(DINER.x, STAGE_Y, DINER.z);
    g.rotation.y = Math.PI / 2;
    castAll(g, true, true);
    statics.add(g);
    occluders.push(g);
  }

  // =====================================================================================================
  // THE OVERPASS that stops in mid-air: a ramp up from the right, a deck over the track and the road,
  // and a broken end with its reinforcing bars sticking out
  // =====================================================================================================
  const overAnchor = new THREE.Object3D();
  {
    const O = OVERPASS, top = O.deck, th = 1.3, w = O.half * 2;
    const conc = pl(0xe6d8c8), concD = pl(0xcdbcaa);
    const deckX0 = O.end, deckX1 = 30, dl = deckX1 - deckX0;
    statics.add(tiledBox(dl, th, w, conc, 4, (deckX0 + deckX1) / 2, top - th / 2, O.z));
    // parapets and a painted lane line along the side (seen from below as a white stripe)
    for (const s of [-1, 1]) statics.add(tiledBox(dl, 1.0, 0.4, conc, 4, (deckX0 + deckX1) / 2, top + 0.5, O.z + s * (O.half - 0.2)));
    statics.add(mesh(boxAt(dl, 0.18, 0.06, (deckX0 + deckX1) / 2, top - th + 0.2, O.z + O.half + 0.01), white));
    // the ramp down to the floor on the right
    const rl = O.x0 - deckX1, rh = top - STAGE_Y, slen = Math.hypot(rl, rh), ang = Math.atan2(rh, rl);
    const ramp = new THREE.Group();
    ramp.add(tiledBox(slen, th, w, conc, 4, slen / 2, -th / 2, 0));
    for (const s of [-1, 1]) ramp.add(tiledBox(slen, 1.0, 0.4, conc, 4, slen / 2, 0.5, s * (O.half - 0.2)));
    ramp.position.set(deckX1, top, O.z); ramp.rotation.z = -ang;
    statics.add(ramp);
    // girders under the deck, piers on round columns with a cap
    for (const s of [-1, 1]) statics.add(tiledBox(dl - 2, 0.9, 0.6, concD, 4, (deckX0 + deckX1) / 2 + 1, top - th - 0.45, O.z + s * 2.4));
    for (const x of [22, 8.5, -6.5]) {
      statics.add(mesh(repeatUV(new THREE.CylinderGeometry(0.85, 0.95, top - th - 0.9 - STAGE_Y, 14), 2, 3), concD, x, (top - th - 0.9 + STAGE_Y) / 2, O.z));
      statics.add(tiledBox(1.6, 0.8, w - 0.6, conc, 4, x, top - th - 1.2, O.z));
    }
    for (const x of [44, 60, 74]) {
      const h = top - (x - deckX1) * Math.tan(ang) - th - STAGE_Y;
      if (h > 1) statics.add(mesh(repeatUV(new THREE.CylinderGeometry(0.75, 0.85, h, 12), 2, 2), concD, x, STAGE_Y + h / 2, O.z));
    }
    // the broken end: ragged chunks, rebar, a striped barricade and the notice
    const rebar: THREE.BufferGeometry[] = [];
    const rr = new Rng(91);
    for (let i = 0; i < 14; i++) {
      const z = O.z - O.half + 0.5 + i * (w - 1) / 13, y = top - th + 0.2 + rr.range(0, 0.9);
      const a = V(deckX0 + 0.3, y, z), b = V(deckX0 - rr.range(0.8, 2.2), y + rr.range(-0.8, 0.4), z + rr.range(-0.3, 0.3));
      rebar.push(rodGeometry(a, b, 0.05, 4));
    }
    statics.add(mesh(merge(rebar), mat(0x9a5a44)));
    for (let i = 0; i < 4; i++) statics.add(tiledBox(rr.range(0.6, 1.2), rr.range(0.4, 0.9), rr.range(1.2, 2.2), conc, 4, deckX0 - 0.2, top - th + rr.range(0.1, 0.8), O.z + rr.range(-3, 3)));
    const barr = new THREE.MeshLambertMaterial({ map: stripes(AC.red, AC.white, 5) });
    statics.add(mesh(boxAt(0.25, 0.7, w - 1.4, deckX0 + 1.2, top + 1.0, O.z), barr));
    for (const s of [-1, 1]) statics.add(mesh(boxAt(0.18, 1.3, 0.18, deckX0 + 1.2, top + 0.65, O.z + s * 3.3), white));
    const noteTex = notice('ELEVATED HIGHWAY', 'construction suspended until further notice', { bg: AC.butter, fg: AC.dark, w: 1024, h: 220, border: AC.dark });
    const noteR = signRect(noteTex);
    statics.add(mesh(atlas.plane(noteR, 9, 1.95), signMat, -2, top - th / 2 - 0.1, O.z + O.half + 0.08));
    const note2 = mesh(atlas.plane(noteR, 9, 1.95), signMat, -2, top - th / 2 - 0.1, O.z - O.half - 0.08);
    note2.rotation.y = Math.PI; statics.add(note2);
    overAnchor.position.set(-2, top - 1, O.z);
    statics.add(overAnchor);
  }

  // =====================================================================================================
  // ASTEROID DAY: the podium of the Junior Stargazer convention, bunting, a banner and folding chairs
  // =====================================================================================================
  {
    const g = new THREE.Group();
    g.add(tiledBox(9, 1.2, 5, plyMat, 4, 0, 0.6, 0));
    const bun = new THREE.MeshLambertMaterial({ map: bunting(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    g.add(mesh(repeatUV(new THREE.PlaneGeometry(9, 0.9), 9 / 3, 1), bun, 0, 0.75, 2.52));
    g.add(mesh(boxAt(9.2, 0.12, 5.2, 0, 1.24, 0), white));
    // the lectern with the Junior Stargazers' seal, a microphone
    g.add(mesh(boxAt(1.4, 1.5, 0.8, 0, 1.95, 0.6), mat(0x2f4a7e)));
    const seal = lettering([{ text: 'JUNIOR', font: `bold 34px ${FUTURA}`, color: '#f6dc8a', y: 0.36 }, { text: 'STARGAZERS', font: `bold 26px ${FUTURA}`, color: '#f6dc8a', y: 0.6 }, { text: '★ 1955 ★', font: `22px ${FUTURA}`, color: '#ffffff', y: 0.82 }], { w: 256, h: 256, bg: '#2f4a7e', border: '#f6dc8a', borderW: 8 });
    g.add(sign(seal, 1.2, 1.2, 0, 1.95, 1.01));
    g.add(mesh(cylAt(0.02, 0.02, 0.6, 0.2, 3.0, 0.8, 4), chrome), mesh(new THREE.SphereGeometry(0.08, 8, 6).translate(0.2, 3.32, 0.85), chrome));
    // the banner on two flag poles
    const ban = lettering([{ text: 'ASTEROID DAY', font: `bold 110px ${FUTURA}`, color: hex(AC.white), y: 0.45 }, { text: 'commemorating the meteorite of 3007 B.C.', font: 'italic 40px Georgia, serif', color: hex(AC.butter), y: 0.8 }], { w: 1024, h: 256, bg: hex(AC.coral), border: hex(AC.white), borderW: 10 });
    g.add(sign(ban, 9, 2.25, 0, 6.4, -1.8));
    for (const s of [-1, 1]) {
      g.add(mesh(cylAt(0.08, 0.08, 7.6, s * 4.8, 3.8, -1.8, 6), chrome), mesh(new THREE.SphereGeometry(0.14, 8, 6).translate(s * 4.8, 7.65, -1.8), mat(AC.gold)));
      const flag = mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshLambertMaterial({ map: stripes(AC.red, AC.white, 3), side: THREE.DoubleSide }), s * 4.8 + s * 0.7, 7.1, -1.8);
      g.add(flag);
    }
    // folding chairs in rows, facing the podium
    const chair = merge([boxAt(0.55, 0.06, 0.5, 0, 0.5, 0), boxAt(0.55, 0.5, 0.05, 0, 0.85, -0.25), boxAt(0.04, 0.5, 0.04, -0.25, 0.25, 0.22), boxAt(0.04, 0.5, 0.04, 0.25, 0.25, 0.22), boxAt(0.04, 1.1, 0.04, -0.25, 0.55, -0.24), boxAt(0.04, 1.1, 0.04, 0.25, 0.55, -0.24)]);
    chair.rotateY(Math.PI);
    const cps: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 3; r++) for (let k = -4; k <= 4; k++) if (k !== 0) cps.push(chair.clone().translate(k * 0.85, 0, 4.2 + r * 1.2));
    g.add(mesh(merge(cps), mat(AC.mint)));
    g.position.set(PODIUM.x, STAGE_Y, PODIUM.z);
    g.rotation.y = Math.PI / 2;
    castAll(g, true, true);
    statics.add(g);
  }

  // =====================================================================================================
  // THE OBSERVATORY and its radio dish
  // =====================================================================================================
  const dish = new THREE.Group();
  {
    const g = new THREE.Group();
    g.add(mesh(repeatUV(new THREE.CylinderGeometry(6, 6.2, 6, 28), 6, 1.5), pl(AC.white), 0, 3, 0));
    g.add(mesh(cylAt(6.5, 6.5, 0.4, 0, 6.2, 0, 28), mat(AC.turquoise)));
    const dome = mesh(new THREE.SphereGeometry(6.1, 28, 14, 0, TAU, 0, Math.PI / 2), mat(0xe8ecee), 0, 6.3, 0);
    g.add(dome);
    // the shutter's slit, open: a dark band up the front of the dome, and the telescope inside it
    g.add(mesh(new THREE.SphereGeometry(6.16, 4, 10, Math.PI / 2 - 0.16, 0.32, 0, Math.PI / 2), dark, 0, 6.3, 0));
    const tube = new THREE.Group();
    tube.add(mesh(cylAt(0.7, 0.55, 7, 0, 3.5, 0, 14), white), mesh(cylAt(0.75, 0.75, 0.4, 0, 7, 0, 14), dark));
    tube.position.set(0, 7.2, 1.5); tube.rotation.x = 0.7;
    g.add(tube);
    g.add(mesh(boxAt(1.6, 2.6, 0.2, 0, 1.3, 6.1), mat(AC.turquoise)), mesh(boxAt(3.4, 0.5, 1.6, 0, 0.25, 6.6), mat(0xe8e0d4)));
    const ot = notice('OBSERVATORY', null, { bg: AC.white, fg: 0x2f4a5e, w: 512, h: 96, border: 0x2f4a5e });
    g.add(sign(ot, 4.6, 0.86, 0, 3.5, 6.24));
    g.position.set(OBSERVATORY.x, STAGE_Y, OBSERVATORY.z);
    g.rotation.y = -Math.PI / 2;
    castAll(g, true, true);
    statics.add(g);
    occluders.push(g);
    // the dish: a lattice pedestal, a yoke, a white parabola with a feed on three legs
    const [dx, dz] = OBSERVATORY.dish;
    const base = new THREE.Group();
    const lat: THREE.BufferGeometry[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lat.push(rodGeometry(V(a * 2.2, 0, b * 2.2), V(a * 0.6, 7, b * 0.6), 0.14, 5));
    for (let y = 1.5; y < 7; y += 1.8) { const r = lerp(2.2, 0.6, y / 7); for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) lat.push(rodGeometry(V(a * r, y, b * r), V(c * r, y + 1.8, d * r), 0.07, 4)); }
    base.add(mesh(merge(lat), white));
    base.add(mesh(cylAt(1.0, 1.0, 0.8, 0, 7.2, 0, 12), white));
    base.position.set(dx, STAGE_Y, dz);
    base.scale.set(0.8, 1, 0.8);
    castAll(base, true, false);
    statics.add(base);
    const bowl = new THREE.LatheGeometry(Array.from({ length: 10 }, (_, i) => { const r = (i / 9) * 6.5; return new THREE.Vector2(r, r * r * 0.06); }), 32);
    const head = new THREE.Group();
    head.add(mesh(bowl, mat(AC.white, { side: THREE.DoubleSide })));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; head.add(mesh(rodGeometry(V(Math.cos(a) * 5.6, 1.9, Math.sin(a) * 5.6), V(0, 4.6, 0), 0.06, 4), dark)); }
    head.add(mesh(cylAt(0.4, 0.25, 0.9, 0, 4.7, 0, 8), dark));
    mergeStatic(head);
    head.rotation.x = 0.9;
    dish.add(head);
    dish.position.set(dx, STAGE_Y + 8, dz);
    dish.scale.setScalar(0.72);
    castAll(dish, true, false);
    live.add(dish);
  }

  // =====================================================================================================
  // THE CRATER: a ring of piled sand, the meteorite on its plinth in a wire cage, a rope round it, the sign
  // =====================================================================================================
  const meteorite = new THREE.Mesh();
  const cageLid = new THREE.Group();
  const metAnchor = new THREE.Object3D(), craterAnchor = new THREE.Object3D();
  {
    const C = CRATER, r = C.r;
    const sand = new THREE.MeshLambertMaterial({ map: floorCloth(481), color: 0xf0d0c0 });
    const prof = BERM.map(([d, h]) => new THREE.Vector2(r + d, h - (d >= 8 ? 0.02 : 0)));
    const berm = mesh(repeatUV(new THREE.LatheGeometry(prof.reverse(), 64), 10, 1), sand, C.x, STAGE_Y, C.z);
    berm.receiveShadow = true;
    statics.add(berm);
    const bowl = mesh(repeatUV(new THREE.CircleGeometry(r - 7.5, 40), 1.5, 1.5), new THREE.MeshLambertMaterial({ map: floorCloth(483), color: 0xd8a890 }), C.x, STAGE_Y + 0.05, C.z);
    bowl.rotation.x = -Math.PI / 2; statics.add(bowl);
    // the plinth and its plaque
    const cy = STAGE_Y + 0.05;
    statics.add(mesh(cylAt(0.9, 1.1, 1.6, C.x, cy + 0.8, C.z, 16), pl(AC.white)), mesh(cylAt(1.05, 1.05, 0.15, C.x, cy + 1.66, C.z, 16), mat(AC.gold)));
    const plaque = lettering([{ text: 'THE METEORITE', font: `bold 34px ${FUTURA}`, color: '#3a2a1a', y: 0.4 }, { text: 'fell here 3007 B.C.', font: 'italic 26px Georgia, serif', color: '#3a2a1a', y: 0.72 }], { w: 320, h: 128, bg: '#e8c870' });
    statics.add(sign(plaque, 1.2, 0.48, C.x, cy + 0.9, C.z + 0.96));
    // the cage: four corner posts and bars on a ring, a domed lid that lifts
    const bars: THREE.BufferGeometry[] = [];
    const cr = 0.95, ch = 1.7, cb = cy + 1.72;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; bars.push(cylAt(0.025, 0.025, ch, C.x + Math.cos(a) * cr, cb + ch / 2, C.z + Math.sin(a) * cr, 4)); }
    for (const y of [cb + 0.05, cb + ch * 0.5]) { const t = new THREE.TorusGeometry(cr, 0.04, 4, 24); t.rotateX(Math.PI / 2); t.translate(C.x, y, C.z); bars.push(t); }
    const brass = new THREE.MeshStandardMaterial({ color: AC.gold, metalness: 0.7, roughness: 0.35, emissive: 0x3a2808, emissiveIntensity: 0.4 });
    statics.add(mesh(merge(bars), brass));
    // the lid: a rim ring and eight quarter arcs meeting at a knob on top
    const rimT = new THREE.TorusGeometry(cr, 0.05, 4, 24); rimT.rotateX(Math.PI / 2);
    const arcs: THREE.BufferGeometry[] = [rimT, new THREE.SphereGeometry(0.1, 8, 6).translate(0, cr * 0.75, 0)];
    for (let i = 0; i < 8; i++) { const q = new THREE.TorusGeometry(cr, 0.025, 3, 10, Math.PI / 2); q.scale(1, 0.75, 1); q.rotateY((i / 8) * TAU); arcs.push(q); }
    const lidMesh = mesh(merge(arcs), brass);
    cageLid.add(lidMesh);
    // hinged at the back edge of the rim
    lidMesh.position.set(0, 0, cr);
    cageLid.position.set(C.x, cb + ch, C.z - cr);
    live.add(cageLid);
    // the meteorite: a lumpy dark rock with glinting flecks
    const rock = new THREE.DodecahedronGeometry(0.42, 1);
    const p = rock.attributes.position as THREE.BufferAttribute;
    const rr = new Rng(97);
    const seen = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let f = seen.get(k); if (f === undefined) { f = rr.range(0.82, 1.15); seen.set(k, f); }
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.85, p.getZ(i) * f);
    }
    rock.computeVertexNormals();
    const rockTex = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g2 = c.getContext('2d')!;
      g2.fillStyle = '#3e3a40'; g2.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 400; i++) { g2.fillStyle = rr.pick(['#5a5258', '#2a262c', '#6a5a5a']); g2.fillRect(rr.range(0, 128), rr.range(0, 128), rr.range(2, 6), rr.range(2, 6)); }
      for (let i = 0; i < 40; i++) { g2.fillStyle = rr.pick(['#a8ffe8', '#fff0b0']); g2.fillRect(rr.range(0, 128), rr.range(0, 128), 1.5, 1.5); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    meteorite.geometry = rock;
    meteorite.material = new THREE.MeshLambertMaterial({ map: rockTex, emissive: 0x6af0d0, emissiveIntensity: 0.0 });
    meteorite.position.set(C.x, cb + 0.42, C.z);
    meteorite.castShadow = true;
    live.add(meteorite);
    metAnchor.position.set(0, 0, 0);
    meteorite.add(metAnchor);
    craterAnchor.position.set(C.x, STAGE_Y + 4, C.z);
    statics.add(craterAnchor);
    // a ring of stanchions with a velvet rope round the plinth
    const posts: THREE.BufferGeometry[] = [], rope: THREE.BufferGeometry[] = [];
    const sr = 3.4, n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, b = ((i + 1) / n) * TAU;
      posts.push(cylAt(0.06, 0.06, 1.0, C.x + Math.cos(a) * sr, cy + 0.5, C.z + Math.sin(a) * sr, 6), new THREE.SphereGeometry(0.1, 6, 4).translate(C.x + Math.cos(a) * sr, cy + 1.05, C.z + Math.sin(a) * sr), cylAt(0.25, 0.25, 0.06, C.x + Math.cos(a) * sr, cy + 0.03, C.z + Math.sin(a) * sr, 8));
      const pa = V(C.x + Math.cos(a) * sr, cy + 0.95, C.z + Math.sin(a) * sr), pb = V(C.x + Math.cos(b) * sr, cy + 0.95, C.z + Math.sin(b) * sr);
      const mid = pa.clone().lerp(pb, 0.5); mid.y -= 0.3;
      rope.push(rodGeometry(pa, mid, 0.04, 4), rodGeometry(mid, pb, 0.04, 4));
    }
    statics.add(mesh(merge(posts), brass), mesh(merge(rope), mat(0x9a1a2a)));
    // the sign on the rim by the end of the line
    const sg = new THREE.Group();
    const signTex = lettering([{ text: 'ASTEROID CITY CRATER', font: `bold 50px ${FUTURA}`, color: hex(AC.red), y: 0.32 }, { text: 'please do not touch the meteorite', font: 'italic 34px Georgia, serif', color: '#2f4a5e', y: 0.68 }], { w: 768, h: 192, bg: hex(AC.cream), border: hex(AC.red), borderW: 8 });
    sg.add(sign(signTex, 4.4, 1.1, 0, 1.6, 0.06), mesh(boxAt(4.6, 1.3, 0.1, 0, 1.6, 0), white));
    for (const s of [-1, 1]) sg.add(mesh(boxAt(0.12, 2.3, 0.12, s * 1.9, 1.1, -0.1), white));
    sg.position.set(-3.6, bermY(-3.6, -1801.5) - 0.6, -1801.5); sg.rotation.y = 0.2;
    statics.add(sg);
    // a telescope on a tripod and two blankets on the rim, for the stargazers
    const tel = new THREE.Group();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; tel.add(mesh(rodGeometry(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6), V(0, 1.4, 0), 0.04, 4), wood)); }
    const tt = new THREE.Group(); tt.add(mesh(cylAt(0.16, 0.12, 1.8, 0, 0.5, 0, 10), mat(0x2f4a7e)), mesh(cylAt(0.18, 0.18, 0.2, 0, 1.4, 0, 10), chrome));
    tt.position.y = 1.45; tt.rotation.set(-0.9, 0, 0.3); tel.add(tt);
    tel.position.set(STARGAZERS.x + 2.4, bermY(STARGAZERS.x + 2.4, STARGAZERS.z - 0.6) - 0.1, STARGAZERS.z - 0.6); tel.rotation.y = 2.6;
    statics.add(tel);
    const plaid = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g2 = c.getContext('2d')!;
      g2.fillStyle = '#e8d8b0'; g2.fillRect(0, 0, 64, 64);
      g2.fillStyle = 'rgba(200,50,60,0.55)'; for (let i = 0; i < 64; i += 16) { g2.fillRect(i, 0, 6, 64); g2.fillRect(0, i, 64, 6); }
      g2.fillStyle = 'rgba(40,70,120,0.4)'; for (let i = 8; i < 64; i += 16) { g2.fillRect(i, 0, 2, 64); g2.fillRect(0, i, 64, 2); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    for (const [x, z, ry] of [[12.5, -1796.5, 0.3], [-11.5, -1796.5, -0.4]] as const) {
      const b = mesh(repeatUV(new THREE.PlaneGeometry(2.4, 1.8), 2, 1.5), new THREE.MeshLambertMaterial({ map: plaid }), x, STAGE_Y + 0.06, z);
      b.rotation.set(-Math.PI / 2, 0, ry); statics.add(b);
    }
  }

  // =====================================================================================================
  // THE COWBOYS' CORNER: a low platform with hay bales and a campfire (the cowboys stand on it)
  // =====================================================================================================
  const fire = new THREE.Group();
  {
    const g = new THREE.Group();
    g.add(tiledBox(6, 0.45, 4, plyMat, 4, 0, 0.22, 0));
    const hay = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g2 = c.getContext('2d')!;
      g2.fillStyle = '#e8c870'; g2.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 120; i++) { g2.strokeStyle = rng.pick(['#c8a040', '#f6e0a0', '#b8902e']); g2.lineWidth = 1; const x = rng.range(0, 64), y = rng.range(0, 64); g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x + rng.range(-8, 8), y + rng.range(-3, 3)); g2.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    const hm = new THREE.MeshLambertMaterial({ map: hay });
    for (const [x, z, y] of [[-2, -1.2, 0], [0, -1.3, 0], [2, -1.2, 0], [-1, -1.25, 0.8]] as const) g.add(mesh(boxUV(new THREE.BoxGeometry(1.8, 0.8, 0.9), 1), hm, x, 0.85 + y, z));
    // the campfire on the floor in front: logs and a flame
    const logs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.CylinderGeometry(0.14, 0.14, 1.4, 6); l.rotateZ(Math.PI / 2); l.rotateY((i / 4) * Math.PI); l.translate(0, 0.14, 0); logs.push(l); }
    fire.add(mesh(merge(logs), mat(0x5a3a24)));
    const flameM = glow(0xffa040, 1.6), flameIn = glow(0xfff0a0, 1.8);
    fire.add(mesh(new THREE.ConeGeometry(0.45, 1.3, 7).translate(0, 0.8, 0), flameM), mesh(new THREE.ConeGeometry(0.25, 0.8, 6).translate(0, 0.6, 0), flameIn));
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; stones.push(new THREE.DodecahedronGeometry(0.22, 0).translate(Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85)); }
    fire.add(mesh(merge(stones), mat(0x9a8a80)));
    g.position.set(COWBOYS.x + 2.5, STAGE_Y, COWBOYS.z);
    g.rotation.y = -Math.PI / 2;
    castAll(g, true, true);
    statics.add(g);
    // the fire stands in front of the platform (the platform faces -x)
    fire.position.set(COWBOYS.x + 2.5 - 3.6, STAGE_Y, COWBOYS.z);
    live.add(fire);
  }

  // =====================================================================================================
  // CACTI: saguaros and barrel cacti on the floor cloth, and a few painted cut-out cacti on their stands
  // =====================================================================================================
  {
    const busy = (x: number, z: number) => {
      if (Math.abs(x) < 5.5) return true;
      if (Math.abs(x - ROAD.x) < ROAD.half + 3.5 && z < ROAD.z0 + 2) return true;
      if (x > 12 && x < 30 && z < -1586 && z > -1662) return true;
      if (x > 3 && x < 14 && z < -1580 && z > -1624) return true;
      if (x < -18 && x > -42 && z < -1594 && z > -1660) return true;
      if (x < -18 && x > -40 && z < -1712 && z > -1736) return true;
      if (Math.hypot(x - OBSERVATORY.x, z - OBSERVATORY.z) < 10 || Math.hypot(x - OBSERVATORY.dish[0], z - OBSERVATORY.dish[1]) < 8) return true;
      if (Math.abs(z - OVERPASS.z) < 7 && x > -28) return true;
      if (Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.r + 9) return true;
      if (Math.abs(x - COWBOYS.x - 2) < 5 && Math.abs(z - COWBOYS.z) < 6) return true;
      if (z > -1580) return true;
      return false;
    };
    const ribs = cactusRibs();
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); parts.push(g); };
    add(new THREE.CylinderGeometry(0.42, 0.5, 4.6, 10), 0, 2.3, 0);
    add(new THREE.SphereGeometry(0.42, 10, 6, 0, TAU, 0, Math.PI / 2), 0, 4.6, 0);
    const arm = (s: number, y: number, up: number) => {
      const h = new THREE.CylinderGeometry(0.26, 0.28, 1.1, 8); h.rotateZ(Math.PI / 2); add(h, s * 0.7, y, 0);
      add(new THREE.CylinderGeometry(0.26, 0.28, up, 8), s * 1.25, y + up / 2 - 0.1, 0);
      add(new THREE.SphereGeometry(0.26, 8, 5, 0, TAU, 0, Math.PI / 2), s * 1.25, y + up - 0.1, 0);
    };
    arm(-1, 1.9, 1.8); arm(1, 2.7, 1.3);
    const pls: Placement[] = [];
    const cr = new Rng(503);
    for (let i = 0; i < 400 && pls.length < 60; i++) {
      const x = cr.range(-70, 70), z = cr.range(-1585, -1840);
      if (busy(x, z)) continue;
      if (pls.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
      pls.push({ x, y: STAGE_Y, z, scale: cr.range(0.75, 1.3), rot: cr.range(0, TAU) });
    }
    statics.add(chunkedParts(parts, new THREE.MeshLambertMaterial({ map: ribs }), pls, { castShadow: true, color: (i, c) => c.setHex([0x7fa88a, 0x8fb896, 0x6f9a7e][i % 3]) }));
    const barrel = new THREE.SphereGeometry(0.45, 10, 6); barrel.scale(1, 0.8, 1); barrel.translate(0, 0.32, 0);
    const bp: Placement[] = [];
    for (let i = 0; i < 300 && bp.length < 70; i++) { const x = cr.range(-70, 70), z = cr.range(-1582, -1840); if (!busy(x, z)) bp.push({ x, y: STAGE_Y, z, scale: cr.range(0.6, 1.4), rot: cr.range(0, TAU) }); }
    statics.add(chunkedParts([barrel], new THREE.MeshLambertMaterial({ map: ribs, color: 0x9fb88a }), bp));
    const pebble = new THREE.DodecahedronGeometry(0.32, 0); pebble.scale(1, 0.6, 1); pebble.translate(0, 0.12, 0);
    const pp: Placement[] = [];
    for (let i = 0; i < 400 && pp.length < 160; i++) { const x = cr.range(-72, 72), z = cr.range(-1574, -1842); if (Math.abs(x) > 3.2 && !(Math.abs(x - ROAD.x) < ROAD.half && z > ROAD.z1)) pp.push({ x, y: STAGE_Y, z, scale: cr.range(0.5, 1.8), rot: cr.range(0, TAU) }); }
    statics.add(chunkedParts([pebble], mat(0xe0c0a8), pp));
    // painted cut-out cacti: plywood shapes on little stage jacks, near the track where you can see they are flat
    const cutTex = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256;
      const g2 = c.getContext('2d')!;
      g2.fillStyle = '#6f9a7e'; g2.fillRect(0, 0, 128, 256);
      for (let x = 6; x < 128; x += 14) { g2.fillStyle = '#5a8a6a'; g2.fillRect(x, 0, 4, 256); g2.fillStyle = '#9cc8a4'; g2.fillRect(x + 5, 0, 2, 256); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    const cutPts: Array<[number, number]> = [[-0.5, 0], [-0.5, 1.6], [-1.3, 1.6], [-1.6, 1.9], [-1.6, 3.4], [-1.35, 3.6], [-1.1, 3.4], [-1.1, 2.2], [-0.5, 2.2], [-0.5, 4.6], [-0.2, 5.0], [0.2, 5.0], [0.5, 4.6], [0.5, 2.8], [1.1, 2.8], [1.1, 3.9], [1.35, 4.1], [1.6, 3.9], [1.6, 2.5], [1.3, 2.2], [0.5, 2.2], [0.5, 0]];
    const cutGeo = new THREE.ExtrudeGeometry(poly(cutPts), { depth: 0.12, bevelEnabled: false });
    const cm = new THREE.MeshLambertMaterial({ map: cutTex });
    const cutWood: THREE.BufferGeometry[] = [], cutBags: THREE.BufferGeometry[] = [];
    for (const [x, z, s] of [[7, -1652, 1.1], [-7.5, -1663, 1.25], [6.5, -1735, 1.0], [-7, -1708, 1.2], [-6.8, -1756, 0.9], [7.2, -1764, 1.15]] as const) {
      const g = mesh(cutGeo, cm, x, STAGE_Y, z); g.scale.setScalar(s); g.rotation.y = x > 0 ? -0.5 : 0.5;
      castAll(g, true, false);
      statics.add(g);
      // a little jack and a sandbag behind each
      const jb = new THREE.BoxGeometry(0.12, 2.6 * s, 0.1); jb.rotateX(-0.4); jb.translate(0, 1.2 * s, -0.55 * s);
      jb.rotateY(x > 0 ? -0.5 : 0.5); jb.translate(x, STAGE_Y, z); cutWood.push(jb);
      const sb = sandbagGeometry(0, -1.1 * s, 0); sb.rotateY(x > 0 ? -0.5 : 0.5); sb.translate(x, STAGE_Y, z); cutBags.push(sb);
    }
    statics.add(mesh(merge(cutWood), wood), mesh(merge(cutBags), mat(0xb8a880)));
  }

  // =====================================================================================================
  // THE MUSHROOM CLOUD: a pastel cut-out flat that rises from below the stage, far off on the left
  // =====================================================================================================
  const cloud = new THREE.Group();
  {
    const tex = mushroomCloud();
    const face = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.FrontSide, emissive: 0xffd8c8, emissiveMap: tex, emissiveIntensity: 0.25 });
    cloud.add(mesh(new THREE.PlaneGeometry(36, 45), face, 0, 22.5, 0));
    const backM = new THREE.MeshLambertMaterial({ map: tex, color: 0xb8a080, alphaTest: 0.5 });
    const bk = mesh(new THREE.PlaneGeometry(36, 45), backM, 0, 22.5, -0.15); bk.rotation.y = Math.PI; cloud.add(bk);
    cloud.add(mesh(boxAt(0.4, 40, 0.4, 0, 20, -0.4), wood), mesh(boxAt(16, 0.4, 0.4, 0, 14, -0.4), wood));
    mergeStatic(cloud);
    cloud.position.set(-84, STAGE_Y - 46, -1772);
    cloud.rotation.y = 0.35;
    live.add(cloud);
  }

  // ---------- night: windows, signs and globes come on ----------
  let lastNight = -1;
  let dispT = 9, dispKind = 0, flickT = 9;
  const rockMat = meteorite.material as THREE.MeshLambertMaterial;
  return {
    statics, live, occluders,
    anchors: { diner: dinerAnchor, vending: (() => { const a = new THREE.Object3D(); a.position.set(0, 1.4, 0.3); vendLive.add(a); return a; })(), overpass: overAnchor, meteorite: metAnchor, crater: craterAnchor },
    meteorite, cageLid, dish, cloud,
    dispense(kind) { dispT = 0; dispKind = kind === 'martini' ? 0 : 1; },
    flicker() { flickT = 0; },
    glowRock(k) { rockMat.emissiveIntensity = k * 0.9; },
    update(dt, t, night) {
      flickT += dt;
      const fl = flickT < 3.5 ? (Math.sin(flickT * 23) > -0.3 ? 1 : 0.3) * Math.min(1, (3.5 - flickT) * 2) : 0;
      if (Math.abs(night - lastNight) > 1e-3 || fl > 0 || flickT - dt < 3.5) {
        lastNight = night;
        for (const [m, d, n] of nightGlow) m.emissiveIntensity = lerp(d, n, Math.max(night, fl));
      }
      // the fire flickers
      fire.children[1].scale.set(1 + Math.sin(t * 11) * 0.08, 1 + Math.sin(t * 7.3) * 0.15 + Math.sin(t * 17) * 0.05, 1);
      fire.children[2].scale.set(1, 1 + Math.sin(t * 9.1 + 1) * 0.18, 1);
      // a martini or a deed slides out into the tray and sits there a while
      dispT += dt;
      dispensed.forEach((d, i) => {
        d.visible = i === dispKind && dispT < 6;
        if (d.visible) d.position.z = 0.62 + Math.min(1, dispT * 2) * 0.25;
      });
    },
  };
}
