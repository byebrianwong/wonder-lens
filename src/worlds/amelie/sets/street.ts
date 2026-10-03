import * as THREE from 'three';
import { box, cyl, glow, instanced, mesh, type Placement } from '../../../engine/Builders';
import { boxUV, charToon, Painter } from '../../../engine/Paint';
import { TAU, clamp, smoothstep } from '../../../engine/math';
import { SETS, Y } from '../layout';
import { ribbon, shadows, subCurve, wallStrip, type BuiltSet, type SetContext, optimize } from '../common';
import { BAY, GROUND, STOREY, chimneyStacks, mansardRoof, parisBuilding, streetPalette, tiled, zincMat, corniceMat, facadeMaterial, plasterMat } from '../buildings';
import { bistroChair, bistroTable, bollards, enamelLamp, morrisColumn, parisLamps, produceStand, toonE } from '../props';
import { awning, boards, cobbles, css, lettering, panelling, pavement, PAL, burlap, wallAd } from '../textures';
import { lightShaft } from '../lens';

/** Width of the cobbled carriageway and where the facades stand, from the middle of the street. */
const ROAD = 3.6, KERB = 3.95, FRONT = 6.3;
/** The grocer: its front stands across the end of the street. */
export const GROCER = { front: -170, back: -250, halfW: 21, height: 14 };

/** Shelves of jars, tins and bottles for the grocer's walls. One tile = 6 wide x 4 tall. */
function shelvesTexture(seed = 91) {
  const p = new Painter(384, 256, seed).fill(css(0x3a2a1c));
  const g = p.g, rng = p.rng;
  for (let s = 0; s < 4; s++) {
    const y = 20 + s * 60;
    g.fillStyle = css(0x2a1c12); g.fillRect(0, y, 384, 56);
    for (let x = 4; x < 380;) {
      const kind = rng.int(0, 3), w = [16, 22, 12, 26][kind], h = [34, 26, 44, 30][kind];
      const c = rng.pick(['#c8282a', '#f0c040', '#2a6a3a', '#e8e0c8', '#8a3a1a', '#3a5a8a', '#d87a2a', '#6a2a4a']);
      g.fillStyle = c;
      if (kind === 2) { g.fillRect(x + 2, y + 52 - h, w - 4, h); g.fillRect(x + 4, y + 52 - h - 8, w - 8, 8); }
      else g.fillRect(x, y + 52 - h, w - 2, h);
      g.fillStyle = 'rgba(255,255,240,0.6)'; g.fillRect(x + 2, y + 52 - h * 0.6, w - 6, h * 0.25);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 1, y + 52 - h, 2, h);
      x += w + rng.range(0, 3);
    }
    g.fillStyle = css(0x6a4a2a); g.fillRect(0, y + 52, 384, 8);
    g.fillStyle = 'rgba(255,220,160,0.25)'; g.fillRect(0, y + 52, 384, 2);
  }
  return p.texture({ repeat: [1, 1] });
}

/** Fascia lettering for the grocer: gold serif capitals on bottle green, with a fine gold border. */
function grocerSign() {
  const p = new Painter(2048, 160, 93).fill(css(PAL.bottle));
  const g = p.g;
  g.strokeStyle = css(PAL.gold, 0.9); g.lineWidth = 5; g.strokeRect(14, 14, 2020, 132);
  g.lineWidth = 2; g.strokeRect(26, 26, 1996, 108);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 96px Georgia, 'Times New Roman', serif`;
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillText('AU MARCHÉ DE LA BUTTE', 1028, 86);
  const gr = g.createLinearGradient(0, 30, 0, 130);
  gr.addColorStop(0, '#fbe6a0'); gr.addColorStop(0.5, '#e8b04a'); gr.addColorStop(1, '#a8722a');
  g.fillStyle = gr; g.fillText('AU MARCHÉ DE LA BUTTE', 1024, 82);
  for (const x of [80, 1968]) { g.fillStyle = css(PAL.gold); g.beginPath(); g.arc(x, 80, 18, 0, TAU); g.fill(); g.fillStyle = css(PAL.bottle); g.beginPath(); g.arc(x, 80, 10, 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

export function buildStreet(ctx: SetContext): BuiltSet & { grocer: { front: THREE.Vector3; counter: THREE.Vector3; stallLeft: THREE.Vector3; stallRight: THREE.Vector3; door: THREE.Vector3; gnomeSpot: THREE.Vector3 }; pigeonSpot: THREE.Vector3; walkPath: (k: number) => THREE.Vector3 } {
  const { rng, road, lights } = ctx;
  const g = new THREE.Group();
  // solid architecture (blocks photos, merged) and small decor (merged separately, never an occluder)
  const arch = new THREE.Group(), decor = new THREE.Group();
  g.add(arch, decor);
  const occluders: THREE.Object3D[] = [arch];
  const zStart = SETS.street.z0, zEnd = GROCER.front - 2;
  const curve = subCurve(road, zStart, zEnd, 80);
  const segs = 140;

  // ---------- the street surface ----------
  const cob = new THREE.MeshLambertMaterial({ map: cobbles(0x7a6e60) });
  const street = new THREE.Mesh(ribbon(curve, -ROAD, ROAD, segs, 0, 4), cob);
  street.receiveShadow = true; arch.add(street);
  const pave = new THREE.MeshLambertMaterial({ map: pavement(0x9a9282) });
  const kerbTop = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (const s of [-1, 1]) {
    const pv = new THREE.Mesh(ribbon(curve, s > 0 ? KERB : -FRONT - 0.5, s > 0 ? FRONT + 0.5 : -KERB, segs, 0.16, 4), pave);
    pv.receiveShadow = true; arch.add(pv);
    arch.add(new THREE.Mesh(ribbon(curve, s > 0 ? ROAD : -KERB, s > 0 ? KERB : -ROAD, segs, 0.17, 1), kerbTop));
    arch.add(new THREE.Mesh(wallStrip(curve, s * ROAD, 0, 0.17, segs, s < 0, 1), kerbTop));
  }

  // ---------- buildings down both sides ----------
  const pal = streetPalette(rng, { lit: 0.12, glass: 'day', litStrength: 0.5 });
  const chimneys: Placement[] = [];
  const shops = [
    { name: 'BOULANGERIE', paint: 0x6a1a1c, goods: 'bread' as const, sub: 'Pain cuit au feu de bois', awning: [0xb8282a, 0xf0e2c0] as [number, number] },
    { name: 'FROMAGERIE', paint: 0x2f4a3a, goods: 'cheese' as const, awning: [0x2f5a3a, 0xf0e2c0] as [number, number] },
    { name: 'FLEURISTE', paint: 0x4a2a3a, goods: 'flowers' as const, awning: [0x8a2a4a, 0xf4e6cc] as [number, number] },
    { name: 'LIBRAIRIE', paint: 0x2a2a3a, goods: 'books' as const },
    { name: 'TABAC', paint: 0x8a1a1a, goods: 'tabac' as const, letters: 0xf0e2c0, awning: [0x8a1a1a, 0x8a1a1a] as [number, number] },
    { name: 'PÂTISSERIE', paint: 0xd8a8a8, goods: 'cakes' as const, letters: 0x5a1a2a, awning: [0xd890a0, 0xf8eee0] as [number, number] },
    { name: 'CAVE À VINS', paint: 0x3a1a1c, goods: 'bottles' as const },
    { name: 'BRASSERIE', paint: 0x1f4a2e, goods: 'bottles' as const, awning: [0x1f4a2e, 0xe8b04a] as [number, number] },
  ];
  let shopI = 0;
  // gaps for side streets (z ranges) on each side
  const gaps: Record<number, Array<[number, number]>> = { [-1]: [[-52, -64]], [1]: [[-14, -25], [-118, -128]] };
  const fronts: Record<number, Array<{ z0: number; z1: number }>> = { [-1]: [], [1]: [] };
  for (const side of [-1, 1]) {
    let z = zStart + 4;
    let last = -1;
    while (z > GROCER.front + 4) {
      const gap = gaps[side].find(([a, b]) => z <= a + 0.1 && z > b);
      if (gap) { z = gap[1]; continue; }
      let bays = rng.int(2, 5);
      // squeeze the last building against the grocer
      if (z - bays * BAY < GROCER.front + 2) bays = Math.max(2, Math.floor((z - GROCER.front - 1) / BAY));
      if (bays < 2) break;
      const w = bays * BAY;
      const zc = z - w / 2;
      const nextGap = gaps[side].find(([a]) => a < z && a > z - w);
      if (nextGap) { z = nextGap[0]; continue; }
      const p = road.side(zc, side * (FRONT + rng.range(-0.15, 0.35)));
      const yaw = road.faceRoad(zc, side);
      const y = road.at(zc).y + 0.16;
      let wi = pal.pick(); if (wi === last) wi = (wi + 1) % pal.walls.length; last = wi;
      const isShop = rng.chance(0.55) && shopI < shops.length * 2;
      const shop = shops[shopI % shops.length];
      if (isShop) shopI++;
      const storeys = bays <= 2 ? rng.int(2, 3) : rng.int(3, 6);
      const b = parisBuilding({
        bays, storeys, depth: 12, facade: pal.facades[wi], side: pal.sides[wi], shopGlow: 0.25, roof: storeys <= 3 && rng.chance(0.6) ? 'gable' : 'mansard',
        ground: isShop ? { kind: 'shop', shop: { name: shop.name, paint: shop.paint, goods: shop.goods, sub: shop.sub, letters: shop.letters, seed: 200 + shopI, w: 128 * bays * 2, h: 280 }, awning: shop.awning } : { kind: 'door', mat: rng.pick(pal.doors) },
        balconies: rng.chance(0.7) ? [1, 4] : [1], flowers: 0.35, rng, chimneys, place: { x: p.x, y, z: p.z, yaw },
      });
      b.position.set(p.x, y, p.z); b.rotation.y = yaw;
      arch.add(b);
      fronts[side].push({ z0: z, z1: z - w });
      z -= w;
    }
  }
  // ground under everything, and a second row of buildings behind each side so side streets and low roofs show more city
  {
    const ground = new THREE.Mesh(ribbon(curve, -110, 110, 60, -0.3, 6), new THREE.MeshLambertMaterial({ map: cobbles(0x6a6258, 307) }));
    ground.receiveShadow = true; arch.add(ground);
    for (const side of [-1, 1]) {
      let z = zStart + 2;
      while (z > GROCER.front - 10) {
        const bays = rng.int(3, 5), w = bays * BAY, zc = z - w / 2;
        const p = road.side(zc, side * (FRONT + 12.6 + rng.range(0, 1)));
        const yaw = road.faceRoad(zc, side);
        const y = road.at(zc).y;
        const wi = pal.pick();
        const bld = parisBuilding({ bays, storeys: rng.int(4, 6), depth: 11, facade: pal.facades[wi], side: pal.sides[wi], ground: { kind: 'door', mat: rng.pick(pal.doors) }, balconies: [1, 4], flowers: 0.3, rng, chimneys, place: { x: p.x, y, z: p.z, yaw }, footing: 4 });
        bld.position.set(p.x, y, p.z); bld.rotation.y = yaw;
        arch.add(bld);
        z -= w + 0.2;
      }
    }
  }
  // the side streets' own cobbles, sunlit
  for (const side of [-1, 1]) for (const [a, b] of gaps[side]) {
    const zc = (a + b) / 2;
    // the side street's own cobbles and the flanking walls
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(a - b, 14), cob);
    (floor.geometry.attributes.uv as THREE.BufferAttribute).array.forEach((_, i, arr) => { (arr as Float32Array)[i] *= i % 2 ? 3.5 : (a - b) / 4; });
    floor.rotation.x = -Math.PI / 2; floor.rotation.z = road.faceRoad(zc, side) + Math.PI / 2;
    const fp = road.side(zc, side * (FRONT + 6.5));
    floor.position.set(fp.x, road.at(zc).y + 0.05, fp.z);
    floor.receiveShadow = true;
    arch.add(floor);
    // golden light pouring out of the side street across the cobbles
    const from = road.side(zc, side * (FRONT + 18), 14), to = road.side(zc - 6, -side * 2, 0);
    decor.add(lightShaft(from, to, 9, 0xffc878, 0.16));
  }
  decor.add(chimneyStacks(chimneys));
  // old painted advertisements on the blank side walls that face down the street at each side street
  {
    const ads = [
      wallAd('DUBONNET', 'vin au quinquina', { bg: 0xe8c890, fg: 0x8a1a1a, accent: 0x2a3a5a, seed: 301 }),
      wallAd('CHOCOLAT MENIER', 'le plus doux des chocolats', { bg: 0xd8b878, fg: 0x3a2214, accent: 0xb8282a, seed: 303 }),
      wallAd('BYRRH', 'tonique et apéritif', { bg: 0xc84a3a, fg: 0xf0e2c0, accent: 0x1e3a2a, seed: 305 }),
    ];
    let ai = 0;
    for (const side of [-1, 1]) for (const [, b2] of gaps[side]) {
      const r = road.at(b2);
      const p = road.side(b2 + 0.06, side * (FRONT + 6.2));
      const ad = mesh(new THREE.PlaneGeometry(9, 8), new THREE.MeshLambertMaterial({ map: ads[ai++ % ads.length] }), p.x, r.y + GROUND + 6, p.z);
      ad.rotation.y = road.along(b2) + Math.PI;
      ad.userData.keep = true;
      decor.add(ad);
    }
  }

  // ---------- street furniture ----------
  const lampPl: Placement[] = [];
  for (let z = zStart - 6, i = 0; z > GROCER.front + 14; z -= 21, i++) {
    const side = i % 2 ? 1 : -1;
    const p = road.side(z, side * 4.6, 0.16);
    lampPl.push({ x: p.x, y: p.y, z: p.z, scale: 1, rot: 0 });
  }
  decor.add(parisLamps(lampPl));
  const bol: Placement[] = [];
  for (let z = zStart - 2; z > GROCER.front + 6; z -= 2.4) for (const side of [-1, 1]) {
    if (gaps[side].some(([a, b]) => z < a && z > b)) continue;
    if (lampPl.some((l) => Math.abs(l.z - z) < 1.5)) continue;
    const p = road.side(z, side * 4.2, 0.16);
    bol.push({ x: p.x, y: p.y, z: p.z, scale: 1, rot: 0 });
  }
  decor.add(bollards(bol));
  {
    const zc = -14;
    const p = road.side(zc, 4.9, 0.16);
    const mc = morrisColumn(); mc.position.copy(p); mc.scale.setScalar(0.85); decor.add(mc);
  }
  // café tables outside the brasserie on the right
  for (let i = 0; i < 4; i++) {
    const z = -84 - i * 3.2;
    const p = road.side(z, 5.1, 0.16);
    const t = bistroTable(); t.position.copy(p); decor.add(t);
    for (const s of [-1, 1]) { const c = bistroChair(); c.position.copy(p).add(new THREE.Vector3(0, 0, s * 0.75)); c.rotation.y = s > 0 ? Math.PI : 0; decor.add(c); }
  }
  // flower buckets outside the florist
  {
    const fl: Placement[] = [], bk: Placement[] = [];
    for (let i = 0; i < 14; i++) {
      const z = -30 - i * 0.7, side = -1;
      const p = road.side(z, side * (5.4 + (i % 2) * 0.5), 0.16);
      bk.push({ x: p.x, y: p.y, z: p.z, scale: 1, rot: 0 });
      for (let k = 0; k < 8; k++) fl.push({ x: p.x + rng.range(-0.22, 0.22), y: p.y + 0.55 + rng.range(0, 0.35), z: p.z + rng.range(-0.22, 0.22), scale: rng.range(0.7, 1.2), rot: 0 });
    }
    const bucketG = new THREE.CylinderGeometry(0.24, 0.18, 0.5, 10); bucketG.translate(0, 0.25, 0);
    decor.add(instanced(bucketG, toonE(0x8a8a80, 0.1), bk));
    const blooms = instanced(new THREE.IcosahedronGeometry(0.11, 1), charToon({ color: 0xffffff, rim: 0.3 }), fl, (_i, c) => c.set(rng.pick([0xe8304a, 0xf6d040, 0xf4f0f0, 0xe86a2a, 0xc04ad0, 0xf08aa0])));
    decor.add(blooms);
  }

  // ---------- the giant green grocer ----------
  const gf = road.at(GROCER.front);
  const gy = Y.grocer;
  const shop = new THREE.Group(), shopDecor = new THREE.Group();
  shop.position.set(gf.x, gy, GROCER.front);
  shop.rotation.y = road.along(GROCER.front) + Math.PI; // local +z faces back down the street
  shopDecor.position.copy(shop.position); shopDecor.rotation.copy(shop.rotation);
  arch.add(shop); decor.add(shopDecor);
  const W = GROCER.halfW * 2, D = GROCER.front - GROCER.back, H = GROCER.height;
  const green = charToon({ color: PAL.bottle, rim: 0.3, emissive: new THREE.Color(PAL.bottle).multiplyScalar(0.12) });
  const greenL = charToon({ color: 0x2f6a40, rim: 0.3, emissive: new THREE.Color(0x2f6a40).multiplyScalar(0.12) });
  const gold = charToon({ color: PAL.gold, rim: 0.5, emissive: new THREE.Color(PAL.gold).multiplyScalar(0.2) });
  {
    // upper storeys at double scale above the shop, so the whole building towers over the street
    const wall = 0xead2a6;
    const upF = facadeMaterial({ wall, shutters: 0x2f5a3a, bays: 3, storeys: 2, lit: 0.2, flowers: 0.5, ashlar: true, seed: 140 }, 0.6);
    const upper = tiled(W, STOREY * 2 * 3, 18, [plasterMat(wall), plasterMat(wall), plasterMat(wall), plasterMat(wall), upF, plasterMat(wall)], BAY * 3 * 2, STOREY * 2 * 2, 0, H + 1 + STOREY * 3, -9);
    upper.castShadow = true;
    shop.add(upper);
    const top = H + 1 + STOREY * 6;
    shop.add(box(W + 1.2, 1.2, 19.2, corniceMat(0xf2e6cc), 0, top + 0.4, -9));
    const roof = mesh(mansardRoof(W + 0.6, 18.6, 6, 2.6, 4), zincMat(), 0, top + 0.9, -9); roof.castShadow = true; shop.add(roof);
    for (let i = 0; i < 6; i++) { const dg = box(2.6, 3.2, 2.4, corniceMat(0xf2e6cc), -W / 2 + (W / 6) * (i + 0.5), top + 3.4, -1.6); shop.add(dg); shop.add(box(1.6, 2.2, 0.1, new THREE.MeshLambertMaterial({ color: 0x3a4440 }), -W / 2 + (W / 6) * (i + 0.5), top + 3.3, -0.36)); }
    // the side walls of the shop storey and the back (the interior is a separate shell)
    for (const s of [-1, 1]) { const sw = box(1.2, H + 1, D, plasterMat(wall), s * (W / 2 - 0.6), (H + 1) / 2, -D / 2); sw.castShadow = true; shop.add(sw); }
    // fascia with the name, and a cornice
    const fascia = box(W, 3.2, 0.9, [green, green, green, green, new THREE.MeshBasicMaterial({ map: grocerSign() }), green] as unknown as THREE.Material, 0, H - 1.0, 0.3);
    shop.add(fascia);
    shop.add(box(W + 0.8, 0.5, 1.5, gold, 0, H + 0.8, 0.4));
    shop.add(box(W + 0.4, 0.3, 1.2, green, 0, H - 2.7, 0.4));
    // pilasters at the corners and either side of the great doorway
    for (const x of [-W / 2 + 0.8, -7.6, 7.6, W / 2 - 0.8]) {
      const pl = box(1.6, H - 2.6, 1.0, green, x, (H - 2.6) / 2, 0.4); pl.castShadow = true; shop.add(pl);
      shop.add(box(1.9, 0.5, 1.3, gold, x, H - 2.7, 0.4));
      shop.add(box(1.9, 0.4, 1.3, greenL, x, 0.2, 0.4));
    }
    // display windows in the two side bays (low walls with glass above, the stalls stand in front)
    for (const s of [-1, 1]) {
      const x = s * (7.6 + (W / 2 - 8.4) / 2 + 0.4), ww = W / 2 - 8.4 - 1.6;
      shop.add(box(ww, 2.2, 0.8, greenL, x, 1.1, 0.2));
      const glass = mesh(new THREE.PlaneGeometry(ww, H - 5.2), new THREE.MeshLambertMaterial({ color: 0x2a3a30, emissive: 0xffc070, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 }), x, 2.2 + (H - 5.2) / 2, 0.05);
      shop.add(glass);
      for (let k = 1; k < 4; k++) shop.add(box(0.15, H - 5.2, 0.2, green, x - ww / 2 + (ww * k) / 4, 2.2 + (H - 5.2) / 2, 0.1));
    }
    // the striped awning over the stalls (not over the doorway, so the facade shows)
    const awMat = new THREE.MeshLambertMaterial({ map: awning(0x2a6a3a, 0xf0e8d0, 95), side: THREE.DoubleSide });
    (awMat.map as THREE.Texture).repeat.set(4, 1);
    for (const s of [-1, 1]) {
      const ww = W / 2 - 8.4;
      const a = mesh(new THREE.PlaneGeometry(ww, 6), awMat, s * (8.4 + ww / 2 - 0.4), H - 4.6, 2.8);
      a.rotation.x = -Math.PI / 2 + 0.5; a.castShadow = true; shop.add(a);
      shop.add(mesh(new THREE.PlaneGeometry(ww, 0.8), awMat, s * (8.4 + ww / 2 - 0.4), H - 6.4, 5.4));
      // bulbs strung under the awning
      for (let k = 0; k < 6; k++) shopDecor.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xffd890, 1.8), s * (9.2 + k * (ww - 1.8) / 5), H - 6.2, 4.6));
    }
  }
  // the stalls in front: towers of giant fruit on tiered crates
  for (const s of [-1, 1]) {
    const st = produceStand(rng, { w: 11, d: 5.5, h: 3.2, tiers: 3, kinds: s < 0 ? ['apple', 'orange', 'lemon', 'greenApple'] : ['tomato', 'pear', 'plum', 'artichoke', 'cabbage'], fruit: 0.36, prices: ['2,40 F', '3,10 F', '1,95 F', '4,50 F'] });
    st.position.set(s * 14.4, 0, 6.2);
    shopDecor.add(st);
  }
  // sacks of grain and lentils on the pavement by the door (Amélie's favourite: her hand in a sack of grain)
  {
    const sackMat = charToon({ map: burlap(0xc8a878), rim: 0.3 });
    const grainMat = charToon({ color: 0xd8b060, rim: 0.2 });
    for (const [x, z, c] of [[-9.6, 4.2, 0xd8b060], [-10.6, 2.8, 0x8a5a3a], [9.8, 3.6, 0xe0c890]] as const) {
      const sack = mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.5, 12, 1, true), sackMat, x, 0.75, z); shopDecor.add(sack);
      shopDecor.add(mesh(new THREE.TorusGeometry(0.76, 0.12, 6, 14), sackMat, x, 1.5, z).rotateX(Math.PI / 2));
      const top = mesh(new THREE.CircleGeometry(0.74, 14), c === 0xd8b060 ? grainMat : charToon({ color: c, rim: 0.2 }), x, 1.42, z); top.rotation.x = -Math.PI / 2; shopDecor.add(top);
    }
  }
  shop.updateMatrixWorld(true);
  const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(shop.matrixWorld);

  // ---------- inside the grocer ----------
  const inside = new THREE.Group(), insideDecor = new THREE.Group();
  // the interior's fruit, lamps and fittings are their own group, drawn only once the moped is close to the shop
  const interior = new THREE.Group();
  interior.position.copy(shop.position); interior.rotation.copy(shop.rotation);
  g.add(interior);
  shop.add(inside); interior.add(insideDecor);
  {
    const floor = new THREE.Mesh(boxUV(new THREE.BoxGeometry(W - 2.4, 0.4, D), 4), new THREE.MeshLambertMaterial({ map: boards(0x9a6a40) }));
    floor.position.set(0, -0.2, -D / 2); floor.receiveShadow = true; inside.add(floor);
    const lower = new THREE.MeshLambertMaterial({ map: panelling(0x2a5a38) });
    const shelves = new THREE.MeshLambertMaterial({ map: shelvesTexture(), emissive: 0x3a2a10, emissiveIntensity: 0.3 });
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 1.3);
      const lw = tiled(0.3, 4, D, lower, 3, 4, x, 2, -D / 2); lw.receiveShadow = true; inside.add(lw);
      const sw = tiled(0.3, H - 4, D, shelves, 6, 4, x, 4 + (H - 4) / 2, -D / 2); inside.add(sw);
    }
    const backWall = new THREE.MeshLambertMaterial({ map: panelling(0x2a5a38) });
    // the back wall with the doorway to the café in the middle
    for (const s of [-1, 1]) inside.add(tiled((W - 2.4) / 2 - 3, H, 0.4, backWall, 3, 4, s * ((W - 2.4) / 4 + 1.5), H / 2, -D));
    inside.add(tiled(6, H - 7.5, 0.4, backWall, 3, 4, 0, 7.5 + (H - 7.5) / 2, -D));
    inside.add(box(6.6, 0.5, 0.8, gold, 0, 7.6, -D + 0.2));
    // ceiling with dark beams
    const ceil = box(W - 2.4, 0.4, D, toonE(0x5a3a22, 0.1), 0, H + 0.2, -D / 2); ceil.castShadow = true; inside.add(ceil);
    for (let z = -4; z > -D; z -= 6) inside.add(box(W - 2.4, 0.8, 0.7, toonE(0x3a2414, 0.06), 0, H - 0.4, z));
    // produce canyons along both sides
    const kindsA: string[][] = [['apple', 'orange'], ['lemon', 'greenApple'], ['tomato', 'aubergine'], ['pear', 'plum'], ['cabbage', 'artichoke'], ['orange', 'apple'], ['lemon', 'tomato'], ['plum', 'pear']];
    let ki = 0;
    // tall tiered stands against the walls
    for (const s of [-1, 1]) for (const z of [-9, -27, -45, -63]) {
      if (s > 0 && z < -60) continue; // the counter stands there
      const st = produceStand(rng, { w: 16, d: 8, h: 5.6, tiers: 4, kinds: kindsA[ki++ % kindsA.length] as never, fruit: 0.36, prices: ['2,40 F', '3,10 F', '1,95 F', '6,20 F'] });
      st.position.set(s * 11.4, 0, z); st.rotation.y = -s * Math.PI / 2;
      insideDecor.add(st);
    }
    // low market tables lining the aisle, so the moped rides down a canyon of fruit
    for (const s of [-1, 1]) for (const z of [-6, -22, -38, -54]) {
      const st = produceStand(rng, { w: 12, d: 2.8, h: 1.4, tiers: 2, kinds: kindsA[ki++ % kindsA.length] as never, fruit: 0.42, prices: ['2,40 F', '3,10 F', '1,95 F', '6,20 F'] });
      st.position.set(s * 4.8, 0, z - 6); st.rotation.y = -s * Math.PI / 2;
      insideDecor.add(st);
    }
    // the counter with the till, on the right near the back
    const counter = new THREE.Group(); counter.position.set(10.5, 0, -66); insideDecor.add(counter);
    counter.add(box(9, 2.4, 2.4, green, 0, 1.2, 0));
    counter.add(box(9.4, 0.25, 2.8, toonE(0x6a4a2a, 0.1), 0, 2.5, 0));
    const till = new THREE.Group(); till.position.set(-2.4, 2.6, 0); counter.add(till);
    till.add(box(1.6, 1.0, 1.2, charToon({ color: 0xc8a04a, rim: 0.6 }), 0, 0.5, 0));
    till.add(box(1.4, 0.6, 0.5, charToon({ color: 0xd8b05a, rim: 0.6 }), 0, 1.2, -0.3));
    till.add(mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshBasicMaterial({ map: lettering('1,95 F', { fg: '#fbe6a0', bg: '#1a1a14', w: 128, h: 40 }) }), 0, 1.3, -0.04));
    for (let k = 0; k < 4; k++) till.add(cyl(0.08, 0.08, 0.2, toonE(0xf0e8d8, 0.2), -0.5 + k * 0.33, 1.05, 0.45, 8));
    // a set of brass scales
    counter.add(cyl(0.6, 0.6, 0.08, charToon({ color: 0xc8a04a, rim: 0.6 }), 2.4, 2.7, 0, 16));
    counter.add(cyl(0.06, 0.06, 1.0, charToon({ color: 0xc8a04a, rim: 0.6 }), 2.4, 3.2, 0, 6));
    // hanging garlic braids and baskets
    for (let i = 0; i < 8; i++) {
      const x = (i % 2 ? 1 : -1) * (W / 2 - 3.5), z = -6 - i * 8;
      const braid = new THREE.Group(); braid.position.set(x, H - 1, z); insideDecor.add(braid);
      braid.add(cyl(0.03, 0.03, 2.4, toonE(0x8a6a3a, 0.1), 0, -1.2, 0, 4));
      for (let k = 0; k < 7; k++) braid.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), toonE(0xf0e8d8, 0.15), Math.sin(k * 2.1) * 0.12, -0.6 - k * 0.32, Math.cos(k * 2.1) * 0.12));
    }
  }
  // rows of green enamel lamps over the aisle
  for (let z = -8; z > -D + 4; z -= 9) for (const x of [-5, 5]) insideDecor.add(enamelLamp(3.5, 2.6).translateX(x).translateY(H).translateZ(z));
  inside.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.castShadow === false && !(m.material as THREE.Material).transparent) m.receiveShadow = true; });

  // the bead curtain in the back doorway: strings of glass beads that part as the moped rides through
  const beads = { strings: [] as { x: number; ang: number; vel: number }[], mesh: null as THREE.InstancedMesh | null, perString: 24, top: 7.4, hinge: new THREE.Vector3() };
  {
    const n = 15;
    for (let i = 0; i < n; i++) beads.strings.push({ x: -2.8 + (i / (n - 1)) * 5.6, ang: 0, vel: 0 });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), charToon({ color: 0xffffff, rim: 0.7, emissive: new THREE.Color(0x401808) }), n * beads.perString);
    const c = new THREE.Color();
    for (let i = 0; i < n * beads.perString; i++) im.setColorAt(i, c.set([0xc82a2a, 0xe8b04a, 0x2a6a3a, 0xf0e2c0][(Math.floor(i / beads.perString) + (i % beads.perString)) % 4]));
    im.frustumCulled = false; im.userData.keep = true;
    beads.mesh = im;
    insideDecor.add(im);
  }
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(1, 1, 1), bp = new THREE.Vector3();
  const updateBeads = (dt: number, riderLocal: THREE.Vector3) => {
    const im = beads.mesh!;
    let i = 0;
    for (const s of beads.strings) {
      // the moped pushes the strings it passes through, outward from its line and forwards
      const dz = riderLocal.z - (-D), dx = riderLocal.x - s.x;
      const push = Math.abs(dz) < 1.2 && Math.abs(dx) < 1.4 ? (1 - Math.abs(dx) / 1.4) * 1.1 : 0;
      const target = push * (dz < 0 ? 1 : -1);
      s.vel += ((target - s.ang) * 30 - s.vel * 3.2) * dt;
      s.ang += s.vel * dt;
      for (let k = 0; k < beads.perString; k++) {
        const r = 0.12 + k * 0.3;
        bp.set(s.x + Math.sin(s.ang * 0.3) * 0.05 * k, beads.top - Math.cos(s.ang) * r, -D - Math.sin(s.ang) * r);
        bm.compose(bp, bq, bs);
        im.setMatrixAt(i++, bm);
      }
    }
    im.instanceMatrix.needsUpdate = true;
  };

  // light: sun pouring in through the open front, and warm lamps inside
  const uIn = road.u(GROCER.front + 30), uOut = road.u(GROCER.back - 4);
  lights.add({ from: uIn, to: uOut, pos: toWorld(0, 9, -20), color: 0xffc070, intensity: 60, distance: 40, flicker: 0.3 });
  lights.add({ from: uIn, to: uOut, pos: toWorld(0, 9, -50), color: 0xffb860, intensity: 60, distance: 40, flicker: 0.3 });
  for (const s of [-1, 1]) insideDecor.add(lightShaft(new THREE.Vector3(s * 4, H - 1, 4), new THREE.Vector3(s * 3, 0, -16), 7, 0xffd8a0, 0.12));

  // where the characters go
  const out = {
    front: toWorld(0, 0, 0),
    counter: toWorld(10.5, 0, -68.6),
    stallLeft: toWorld(-9.2, 0, 7.6),
    stallRight: toWorld(9.6, 0, 7.4),
    door: toWorld(0, 0, -D),
    gnomeSpot: toWorld(-14.4, 3.2 + 0.36 * 2.4 + 0.9, 4.1),
  };

  // floor for thrown items: the street surface, the shop floor beyond its front
  const floor = (x: number, z: number) => {
    if (z < GROCER.front) return gy;
    const r = road.at(z);
    const lat = Math.abs((x - r.x) * r.rx + (z - r.z) * r.rz);
    return r.y + (lat > ROAD ? 0.16 : 0);
  };
  optimize(arch);
  optimize(decor);
  // the bead curtain animates, so it stays out of the merge
  const beadMesh = beads.mesh!; insideDecor.remove(beadMesh);
  optimize(interior);
  interior.add(beadMesh); beadMesh.position.set(0, 0, 0);
  void shadows;
  const riderLocal = new THREE.Vector3();
  const invShop = new THREE.Matrix4().copy(shop.matrixWorld).invert();
  return {
    id: 'street', group: g, show: [0, road.u(SETS.cafe.z0 - 30)], occluders, subjects: [],
    floor,
    grocer: out,
    pigeonSpot: road.side(-112, -1.4, 0),
    walkPath: (k: number) => road.side(clamp(-20 - k * 70, -95, -20), -5.1, 0.16),
    update(dt, _t, ride) {
      interior.visible = ride.position.z < GROCER.front + 70;
      riderLocal.copy(ride.position).applyMatrix4(invShop);
      if (riderLocal.z < 2 && riderLocal.z > -D - 6) updateBeads(dt, riderLocal);
      void smoothstep;
    },
  };
}

export { GROUND };
