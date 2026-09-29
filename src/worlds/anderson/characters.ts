import * as THREE from 'three';
import { glow, sphere, ellipsoid, cyl, cone, capsule, box, mesh, textTexture, canvasTexture, mergeStatic } from '../../engine/Builders';
import { charToon, repeatUV, boxUV } from '../../engine/Paint';
import { clamp, damp, lerp, Rng, TAU } from '../../engine/math';
import { alienSkin, cabinWall, candyShell, cloth, faceTexture, foxHead, furTexture, hairTexture, hullTexture, jaguarSkin, knit, legTexture, lobbyBoyCap, opossumHead, outfitTexture, paintedMetal, roadrunnerFeathers, subTexture, type Outfit, type PuppetFace } from './characterTextures';
import { planks } from './textures';

/** Characters face +z in local space. Every builder returns a group plus update(dt, t) and its pose methods. */
export interface Character {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Textures and materials shared between figures that look alike (a troop of scouts, a ship's crew). */
const cache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = cache.get(key);
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}
const flat = (c: number, rim = 0.3) => mat(`flat${c}_${rim}`, () => charToon({ color: c, rim }));

/** A thin rod from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 5) {
  const d = b.clone().sub(a);
  const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return o;
}

// ---------------- shared figure builder ----------------
// A simple articulated person. Arms and legs are pivot groups so poses only need rotations.
// arm.rotation.x negative = raise forward; straight up is about -3.0.
export interface FigureOpts {
  h?: number;
  skin: number; hair: number; top: number; bottom: number; shoes?: number;
  hairStyle?: 'short' | 'slick' | 'bob' | 'braids' | 'none';
  hat?: { kind: 'cap' | 'beanie' | 'pillbox' | 'coonskin' | 'brim'; color: number; band?: number; lobby?: boolean };
  glasses?: boolean; beard?: number;
  skirt?: number;
  /** bare legs under shorts or a skirt, with socks */
  legs?: { shorts?: number; socks?: number };
  /** painted details on the jacket or shirt */
  outfit?: Partial<Outfit>;
  /** painted details on the face */
  face?: Partial<PuppetFace>;
  /** corduroy trousers */
  cord?: boolean;
  /** use this material for the head instead of painting a face (animal heads) */
  headMat?: THREE.Material;
  /** use this one material for every part (the alien) */
  allMat?: THREE.Material;
}
export interface Figure {
  group: THREE.Group; body: THREE.Group; head: THREE.Group; torso: THREE.Mesh; headMesh: THREE.Mesh;
  armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  handL: THREE.Group; handR: THREE.Group;
  h: number; hipY: number; armLen: number;
}
export function makeFigure(o: FigureOpts): Figure {
  const h = o.h ?? 1.7;
  const g = new THREE.Group();
  const style = o.hairStyle ?? 'short';
  // short and slicked hair is painted on the head; bobs and braids also get a cap for their volume
  const faceO: PuppetFace = { skin: o.skin, hair: o.hair, hairPaint: style === 'short' || style === 'slick' ? style : undefined, ...o.face };
  const all = o.allMat;
  const skin = all ?? flat(o.skin, 0.25);
  const outfit: Outfit = { color: o.top, ...o.outfit };
  const top = all ?? mat(`top${JSON.stringify(outfit)}`, () => charToon({ map: outfitTexture(outfit) }));
  const sleeve = all ?? mat(`sleeve${o.top}${outfit.cord}`, () => charToon({ map: cloth(o.top, { cord: outfit.cord }) }));
  // under a skirt the legs are bare to the top
  const shorts = o.skirt !== undefined ? o.skin : o.legs?.shorts ?? o.bottom;
  const legKey = o.legs ? `legs${shorts}_${o.skin}_${o.legs.socks}` : `trousers${o.bottom}${o.cord}`;
  const legMat = all ?? mat(legKey, () => charToon({ map: o.legs ? legTexture({ shorts, skin: o.skin, socks: o.legs.socks }) : cloth(o.bottom, { cord: o.cord }) }));
  const shoes = all ?? flat(o.shoes ?? 0x2a2420, 0.2);
  const hairM = mat(`hair${o.hair}${o.hairStyle}`, () => charToon({ map: hairTexture(o.hair, 31, o.hairStyle === 'slick'), rim: 0.3 }));
  const headR = h * 0.105;
  const legLen = h * 0.42, torsoH = h * 0.32, armLen = h * 0.34;
  const hipY = legLen;
  const hipX = h * 0.07, shoulderX = h * 0.13;
  // legs
  const leg = (s: number) => {
    const p = new THREE.Group();
    p.position.set(s * hipX, hipY, 0);
    p.add(capsule(h * 0.045, legLen - h * 0.09, legMat, 0, -legLen / 2, 0));
    p.add(box(h * 0.075, h * 0.05, h * 0.13, shoes, 0, -legLen + h * 0.02, h * 0.02));
    g.add(p);
    return p;
  };
  const legL = leg(-1), legR = leg(1);
  // body pivot at the hips
  const body = new THREE.Group();
  body.position.set(0, hipY, 0);
  const torso = capsule(h * 0.105, torsoH - h * 0.2, top, 0, torsoH * 0.5, 0);
  torso.scale.set(1.25, 1, 0.85);
  body.add(torso);
  if (o.skirt !== undefined) body.add(cone(h * 0.17, h * 0.3, mat(`skirt${o.skirt}`, () => charToon({ map: cloth(o.skirt!, { hem: new THREE.Color(o.skirt!).multiplyScalar(0.8).getHex() }), side: THREE.DoubleSide })), 0, h * 0.06, 0, 16));
  // arms
  const arm = (s: number) => {
    const p = new THREE.Group();
    p.position.set(s * shoulderX, torsoH * 0.92, 0);
    p.add(capsule(h * 0.036, armLen - h * 0.07, sleeve, 0, -armLen / 2, 0));
    const hand = new THREE.Group();
    hand.position.set(0, -armLen, 0);
    hand.add(sphere(h * 0.04, skin, 0, 0, 0, 10, 8));
    p.add(hand);
    p.rotation.z = s * 0.08;
    body.add(p);
    return { p, hand };
  };
  const aL = arm(-1), aR = arm(1);
  // head: one sphere with the face painted on
  const head = new THREE.Group();
  head.position.set(0, torsoH + headR * 0.95, 0);
  const headMesh = sphere(headR, all ?? o.headMat ?? mat(`face${JSON.stringify(faceO)}`, () => charToon({ map: faceTexture(faceO), rim: 0.25 })), 0, 0, 0, 24, 16);
  head.add(headMesh);
  // hair with volume
  if (style === 'bob') {
    const cap = sphere(headR * 1.12, hairM, 0, headR * 0.05, -headR * 0.1, 20, 14);
    cap.scale.set(1, 1.05, 1);
    head.add(cap);
    head.add(box(headR * 1.6, headR * 0.42, headR * 0.5, hairM, 0, headR * 0.78, headR * 0.72)); // fringe
  } else if (style === 'braids') {
    const cap = sphere(headR * 1.06, hairM, 0, headR * 0.12, -headR * 0.12, 20, 14);
    cap.scale.set(1, 0.85, 1);
    head.add(cap);
    for (const s of [-1, 1]) {
      const b = capsule(headR * 0.22, headR * 1.6, hairM, s * headR * 0.95, -headR * 0.9, headR * 0.1);
      b.rotation.z = -s * 0.15;
      head.add(b);
      head.add(sphere(headR * 0.16, flat(0xd23c5a), s * headR * 1.05, -headR * 1.75, headR * 0.15, 6, 5));
    }
  }
  if (o.glasses) {
    const ring = new THREE.TorusGeometry(headR * 0.3, headR * 0.035, 6, 14);
    const gm = flat(0x2a2420, 0);
    for (const s of [-1, 1]) head.add(mesh(ring, gm, s * headR * 0.3, headR * 0.0, headR * 0.96));
    head.add(box(headR * 0.14, headR * 0.05, headR * 0.05, gm, 0, headR * 0.02, headR * 1.0));
  }
  if (o.beard !== undefined) head.add(ellipsoid(headR * 0.62, headR * 0.42, headR * 0.4, mat(`beard${o.beard}`, () => charToon({ map: hairTexture(o.beard!, 37), rim: 0.1 })), 0, -headR * 0.62, headR * 0.62));
  if (o.hat) {
    const hk = o.hat;
    if (hk.kind === 'cap') {
      const hm = mat(`cap${hk.color}`, () => charToon({ map: cloth(hk.color) }));
      head.add(cyl(headR * 1.05, headR * 1.05, headR * 0.6, hm, 0, headR * 0.85, 0, 16));
      head.add(box(headR * 1.2, headR * 0.08, headR * 0.7, hm, 0, headR * 0.6, headR * 1.1));
    } else if (hk.kind === 'beanie') {
      const hm = mat(`beanie${hk.color}`, () => charToon({ map: knit(hk.color) }));
      const b = sphere(headR * 1.08, hm, 0, headR * 0.3, -headR * 0.05, 18, 12);
      b.scale.set(1, 0.95, 1);
      head.add(b);
      head.add(mesh(repeatUV(new THREE.CylinderGeometry(headR * 1.1, headR * 1.1, headR * 0.35, 18), 2, 1), hm, 0, headR * 0.35, -headR * 0.05));
    } else if (hk.kind === 'pillbox') {
      const hm = hk.lobby ? mat('lobbyCap', () => charToon({ map: lobbyBoyCap() })) : flat(hk.color);
      head.add(cyl(headR * 0.72, headR * 0.72, headR * 0.72, hm, 0, headR * 1.15, 0, 20));
      head.add(cyl(headR * 0.74, headR * 0.74, headR * 0.05, flat(hk.band ?? 0xd8b25a), 0, headR * 1.52, 0, 20));
    } else if (hk.kind === 'coonskin') {
      const hm = mat(`coon${hk.color}`, () => charToon({ map: furTexture(hk.color, 39) }));
      const c = sphere(headR * 1.15, hm, 0, headR * 0.35, -headR * 0.05, 16, 12);
      c.scale.set(1, 0.7, 1);
      head.add(c);
      const tail = capsule(headR * 0.2, headR * 1.3, hm, 0, -headR * 0.4, -headR * 1.2);
      tail.rotation.x = 0.5;
      head.add(tail);
      for (let i = 0; i < 3; i++) head.add(cyl(headR * 0.21, headR * 0.21, headR * 0.16, flat(0x2a2420, 0.1), 0, -headR * (0.2 + i * 0.45), -headR * (1.1 + i * 0.2), 8));
    } else if (hk.kind === 'brim') {
      const hm = mat(`brim${hk.color}`, () => charToon({ map: cloth(hk.color) }));
      head.add(cyl(headR * 0.75, headR * 0.8, headR * 0.75, hm, 0, headR * 1.1, 0, 16));
      head.add(cyl(headR * 1.5, headR * 1.5, headR * 0.06, hm, 0, headR * 0.78, 0, 20));
      if (hk.band !== undefined) head.add(cyl(headR * 0.77, headR * 0.82, headR * 0.15, flat(hk.band), 0, headR * 0.85, 0, 16));
    }
  }
  body.add(head);
  g.add(body);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, body, head, torso, headMesh, armL: aL.p, armR: aR.p, legL, legR, handL: aL.hand, handR: aR.hand, h, hipY, armLen };
}

/** Breathing and a little weight shift. */
function figureIdle(f: Figure, t: number, phase = 0) {
  f.torso.scale.y = 1 + Math.sin(t * 1.3 + phase) * 0.012;
  f.body.position.y = f.hipY + Math.sin(t * 1.3 + phase) * 0.004;
  f.head.rotation.y = damp(f.head.rotation.y, Math.sin(t * 0.4 + phase) * 0.08, 2, 0.016);
}
/** Marching / walking cycle. */
function figureWalk(f: Figure, t: number, rate = 7, amp = 0.55, phase = 0) {
  const ph = t * rate + phase;
  f.legL.rotation.x = Math.sin(ph) * amp; f.legR.rotation.x = -Math.sin(ph) * amp;
  f.armL.rotation.x = -Math.sin(ph) * amp * 0.7; f.armR.rotation.x = Math.sin(ph) * amp * 0.7;
  f.body.position.y = f.hipY + Math.abs(Math.cos(ph)) * 0.03;
}
function relaxArms(f: Figure, dt: number, k = 6) {
  f.armL.rotation.x = damp(f.armL.rotation.x, 0, k, dt); f.armR.rotation.x = damp(f.armR.rotation.x, 0, k, dt);
  f.armL.rotation.z = damp(f.armL.rotation.z, -0.08, k, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.08, k, dt);
  f.armL.rotation.y = damp(f.armL.rotation.y, 0, k, dt); f.armR.rotation.y = damp(f.armR.rotation.y, 0, k, dt);
}
function relaxLegs(f: Figure, dt: number, k = 6) {
  f.legL.rotation.x = damp(f.legL.rotation.x, 0, k, dt); f.legR.rotation.x = damp(f.legR.rotation.x, 0, k, dt);
}

let mendlsFace: THREE.Texture | null = null;
/**
 * A Mendl's box: pink card with Mendl's printed in red, tied on top with blue string (the film's prop).
 * Used on the kiosk counter, in the train and as the thrown item.
 */
export function makeMendlsBox(s = 1) {
  const g = new THREE.Group();
  const face = mendlsFace ??= canvasTexture(128, 128, (c) => {
    c.fillStyle = '#f4bccb'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, 128, 10);
    c.fillStyle = '#c8323c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'italic bold 30px Georgia, serif'; c.fillText("Mendl's", 64, 56);
    c.font = '11px Georgia, serif'; c.fillText('NEBELSBAD', 64, 82);
    c.fillStyle = '#6a9fd8'; c.fillRect(61, 0, 6, 20); c.fillRect(61, 108, 6, 20);
  });
  const card = mat('mendlsCard', () => charToon({ map: face, rim: 0.2 }));
  const blue = flat(0x6a9fd8, 0.2);
  g.add(box(0.34 * s, 0.26 * s, 0.34 * s, card, 0, 0.13 * s, 0));
  g.add(box(0.345 * s, 0.012 * s, 0.03 * s, blue, 0, 0.262 * s, 0), box(0.03 * s, 0.012 * s, 0.345 * s, blue, 0, 0.262 * s, 0));
  const bow = new THREE.Group();
  bow.add(ellipsoid(0.06 * s, 0.03 * s, 0.025 * s, blue, -0.05 * s, 0, 0, 8, 6), ellipsoid(0.06 * s, 0.03 * s, 0.025 * s, blue, 0.05 * s, 0, 0, 8, 6), sphere(0.02 * s, blue, 0, 0, 0, 6, 4));
  bow.position.set(0, 0.28 * s, 0);
  g.add(bow);
  return g;
}

// ---------------- M. Gustave & Zero ----------------
export function makeGustaveZero() {
  const g = new THREE.Group();
  const purple = 0x5d3a8a;
  const gustave = makeFigure({ h: 1.88, skin: 0xf1cfb4, hair: 0x9a9aa2, hairStyle: 'slick', top: purple, bottom: 0x24222a, shoes: 0x1a1a1a, outfit: { lapels: 0x6d4a9a, shirt: 0xf6f2ea, tie: 0x2a2030, buttons: 0xd8b25a, double: true, keys: true, trim: 0xd8b25a }, face: { moustache: 0x8a8a90, mouth: 'line' } });
  // Zero's purple lobby-boy uniform and pillbox cap with LOBBY BOY across the front, and the moustache he draws on
  const zero = makeFigure({ h: 1.58, skin: 0xa86a48, hair: 0x1a1414, hairStyle: 'short', top: purple, bottom: purple, shoes: 0x1a1a1a, outfit: { buttons: 0xd8b25a, trim: 0xd8b25a }, face: { moustache: 'pencil', eyes: 0x1a1210 }, hat: { kind: 'pillbox', color: purple, lobby: true, band: 0xd8b25a } });
  gustave.group.position.set(-0.75, 0, 0);
  zero.group.position.set(0.75, 0, 0);
  // hands behind the back
  for (const f of [gustave, zero]) { f.armL.rotation.x = 0.55; f.armR.rotation.x = 0.55; f.armL.rotation.y = 0.4; f.armR.rotation.y = -0.4; }
  // Gustave's pointing finger (hidden until he raises it)
  const finger = cyl(0.014, 0.014, 0.12, flat(0xf1cfb4), 0, 0.08, 0, 5);
  finger.visible = false;
  gustave.handR.add(finger);
  g.add(gustave.group, zero.group);
  let bowT = 0, fingerT = 0;
  const lookTarget = new THREE.Vector3();
  let hasLook = false;
  const tmp = new THREE.Vector3();
  const ch: Character & { bow(): void; finger(): void; setLook(p: THREE.Vector3 | null): void } = {
    group: g,
    bow() { bowT = 2.6; },
    finger() { fingerT = 2.8; },
    setLook(p) { if (p) { lookTarget.copy(p); hasLook = true; } else hasLook = false; },
    update(dt, t) {
      figureIdle(gustave, t, 0); figureIdle(zero, t, 1.7);
      // both turn as one to follow the train
      if (hasLook) {
        tmp.copy(lookTarget); g.worldToLocal(tmp);
        const a = Math.atan2(tmp.x, tmp.z);
        g.rotation.y += clamp(a, -0.6, 0.6) * (1 - Math.exp(-dt * 1.5));
      } else g.rotation.y = damp(g.rotation.y, 0, 1.5, dt);
      if (bowT > 0) {
        bowT -= dt;
        const p = clamp(1 - bowT / 2.6, 0, 1);
        const k = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        for (const f of [gustave, zero]) {
          f.body.rotation.x = damp(f.body.rotation.x, 0.62 * k, 9, dt);
          f.head.rotation.x = damp(f.head.rotation.x, 0.25 * k, 9, dt);
        }
      } else {
        for (const f of [gustave, zero]) { f.body.rotation.x = damp(f.body.rotation.x, 0, 5, dt); f.head.rotation.x = damp(f.head.rotation.x, 0, 5, dt); }
      }
      if (fingerT > 0) {
        fingerT -= dt;
        gustave.armR.rotation.x = damp(gustave.armR.rotation.x, -2.75, 9, dt);
        gustave.armR.rotation.y = damp(gustave.armR.rotation.y, 0, 9, dt);
        gustave.armR.rotation.z = damp(gustave.armR.rotation.z, 0.35, 9, dt);
        finger.visible = gustave.armR.rotation.x < -2.0;
        gustave.head.rotation.z = damp(gustave.head.rotation.z, -0.12, 6, dt);
        zero.head.rotation.y = damp(zero.head.rotation.y, -0.5, 6, dt);
      } else {
        finger.visible = false;
        gustave.armR.rotation.x = damp(gustave.armR.rotation.x, 0.55, 5, dt);
        gustave.armR.rotation.y = damp(gustave.armR.rotation.y, -0.4, 5, dt);
        gustave.armR.rotation.z = damp(gustave.armR.rotation.z, 0.08, 5, dt);
        gustave.head.rotation.z = damp(gustave.head.rotation.z, 0, 4, dt);
      }
    },
  };
  return ch;
}

// ---------------- Agatha ----------------
export function makeAgatha() {
  const f = makeFigure({ h: 1.66, skin: 0xf4d6c0, hair: 0xe9c96a, hairStyle: 'braids', top: 0x9fb8cf, bottom: 0x9fb8cf, skirt: 0x9fb8cf, legs: { socks: 0xf7f2ea }, shoes: 0x3a2a24, outfit: { apron: 0xfbf7f2 }, face: { eyes: 0x2a3a5a, birthmark: true, mouth: 'smile' } });
  const g = f.group;
  // she holds a Mendl's box with both hands
  const boxProp = makeMendlsBox(1.1);
  boxProp.position.set(0, 0.12, 0.34);
  f.body.add(boxProp);
  f.armL.rotation.x = -1.15; f.armR.rotation.x = -1.15; f.armL.rotation.z = -0.32; f.armR.rotation.z = 0.32;
  let catchT = 0, liftT = 0;
  const ch: Character & { catchBox(): void; lift(): void } = {
    group: g,
    catchBox() { catchT = 2.4; },
    lift() { liftT = 2.2; },
    update(dt, t) {
      figureIdle(f, t, 0.6);
      f.legL.rotation.x = 0; f.legR.rotation.x = 0;
      if (catchT > 0) {
        catchT -= dt;
        const p = clamp(1 - catchT / 2.4, 0, 1);
        const up = p < 0.25 ? p / 0.25 : p > 0.8 ? (1 - p) / 0.2 : 1;
        f.armL.rotation.x = damp(f.armL.rotation.x, lerp(-1.15, -2.9, up), 12, dt);
        f.armR.rotation.x = damp(f.armR.rotation.x, lerp(-1.15, -2.9, up), 12, dt);
        boxProp.position.set(0, lerp(0.12, 0.98, up), lerp(0.34, 0.1, up));
        f.head.rotation.x = damp(f.head.rotation.x, -0.35 * up, 8, dt);
        f.body.position.y = f.hipY + (p < 0.3 ? Math.sin(p / 0.3 * Math.PI) * 0.12 : 0);
      } else if (liftT > 0) {
        liftT -= dt;
        f.armL.rotation.x = damp(f.armL.rotation.x, -1.55, 8, dt); f.armR.rotation.x = damp(f.armR.rotation.x, -1.55, 8, dt);
        boxProp.position.set(0, damp(boxProp.position.y, 0.4, 8, dt), damp(boxProp.position.z, 0.5, 8, dt));
        f.head.rotation.x = damp(f.head.rotation.x, 0.08, 6, dt);
      } else {
        f.armL.rotation.x = damp(f.armL.rotation.x, -1.15, 5, dt); f.armR.rotation.x = damp(f.armR.rotation.x, -1.15, 5, dt);
        boxProp.position.set(0, damp(boxProp.position.y, 0.12, 5, dt), damp(boxProp.position.z, 0.34, 5, dt));
        f.head.rotation.x = damp(f.head.rotation.x, 0, 4, dt);
      }
    },
  };
  return ch;
}

/** A bicycle, merged into a few meshes. Faces +z. */
function bicycle(frameColor: number) {
  const bike = new THREE.Group();
  const frame = flat(frameColor, 0.3), tyre = flat(0x2a2a2a, 0.1), spoke = flat(0xcfcfcf, 0.2);
  const wheelGeo = new THREE.TorusGeometry(0.42, 0.045, 6, 24);
  for (const z of [-0.65, 0.65]) {
    const w = mesh(wheelGeo, tyre, 0, 0.42, z);
    w.rotation.y = Math.PI / 2;
    bike.add(w);
    for (let i = 0; i < 6; i++) { const sp = cyl(0.008, 0.008, 0.8, spoke, 0, 0.42, z, 4); sp.rotation.x = (i / 6) * Math.PI; bike.add(sp); }
  }
  const bar = (a: THREE.Vector3, b: THREE.Vector3) => bike.add(rod(a, b, 0.025, frame, 6));
  bar(V(0, 0.42, -0.65), V(0, 0.95, -0.25)); bar(V(0, 0.42, -0.65), V(0, 0.45, 0.1)); bar(V(0, 0.95, -0.25), V(0, 0.45, 0.1));
  bar(V(0, 0.95, -0.25), V(0, 0.98, 0.5)); bar(V(0, 0.98, 0.5), V(0, 0.42, 0.65)); bar(V(0, 0.45, 0.1), V(0, 0.42, 0.65));
  bike.add(box(0.5, 0.03, 0.03, frame, 0, 1.05, 0.5)); // handlebar
  bike.add(box(0.22, 0.04, 0.16, flat(0x5a3a2a), 0, 1.02, -0.3)); // saddle
  bike.add(tiledBox(0.36, 0.22, 0.3, mat('wicker', () => charToon({ map: planks(0xc9a86a, 43) })), 0.3, 0.3, 0, 1.05, 0.72)); // basket
  bike.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return mergeStatic(bike);
}
function tiledBox(w: number, h: number, d: number, m: THREE.Material, tu: number, tv: number, x = 0, y = 0, z = 0) {
  return mesh(boxUV(new THREE.BoxGeometry(w, h, d), tu, tv), m, x, y, z);
}

// ---------------- Mr. Fox with his bicycle ----------------
export function makeMrFox() {
  const g = new THREE.Group();
  // double-breasted corduroy in ochre, with a shirt and tie
  const corduroy = 0xc08a3a;
  // a fox's head: fur painted on the round head, a long snout, pointed ears
  const f = makeFigure({ h: 1.72, skin: 0xd9782f, hair: 0xd9782f, hairStyle: 'none', top: corduroy, bottom: corduroy, cord: true, shoes: 0x3a2a20, outfit: { cord: true, lapels: 0xcc9848, shirt: 0xf4e6d2, tie: 0x7a3a2a, buttons: 0x5a3a24, double: true }, headMat: mat('foxHead', () => charToon({ map: foxHead({ base: 0xd9782f, cream: 0xf4e6d2 }), rim: 0.35 })) });
  const orangeFur = mat('foxFur', () => charToon({ map: furTexture(0xd9782f, 45) }));
  const hr = 1.72 * 0.105;
  const snout = ellipsoid(hr * 0.5, hr * 0.42, hr * 0.75, mat('foxSnout', () => charToon({ map: furTexture(0xe89a5a, 47, 0xf4e6d2) })), 0, -hr * 0.2, hr * 0.85);
  f.head.add(snout);
  f.head.add(sphere(hr * 0.15, flat(0x1a1410, 0.4), 0, -hr * 0.12, hr * 1.56, 10, 8));
  for (const s of [-1, 1]) {
    const ear = cone(hr * 0.3, hr * 0.85, orangeFur, s * hr * 0.55, hr * 1.05, -hr * 0.1, 10);
    ear.rotation.z = -s * 0.25;
    f.head.add(ear);
    f.head.add(cone(hr * 0.13, hr * 0.32, flat(0x1a1410), s * hr * 0.67, hr * 1.44, -hr * 0.16, 8));
  }
  // bushy tail with a cream tip
  const tail = capsule(0.11, 0.55, mat('foxTail', () => charToon({ map: furTexture(0xd9782f, 49, 0xf4e6d2) })), 0, 0.05, -0.36);
  tail.rotation.x = 1.2;
  f.body.add(tail);
  g.add(f.group);
  const bike = bicycle(0x2f5d4f);
  bike.position.set(0.95, 0, 0.1);
  bike.rotation.y = Math.PI / 2;
  bike.rotation.z = 0.12;
  g.add(bike);
  // idle: left hand on the handlebar
  f.armL.rotation.x = -0.6; f.armL.rotation.z = -0.5;
  let whistleT = 0, catchT = 0;
  const ch: Character & { whistleClick(): void; catchBox(): void } = {
    group: g,
    whistleClick() { whistleT = 3.2; },
    catchBox() { catchT = 2.0; },
    update(dt, t) {
      figureIdle(f, t, 2.1);
      tail.rotation.z = Math.sin(t * 1.8) * 0.18;
      if (whistleT > 0) {
        whistleT -= dt;
        const p = 1 - whistleT / 3.2;
        // hand up by the head, then two quick clicks of the wrist
        f.armR.rotation.x = damp(f.armR.rotation.x, -2.4, 10, dt);
        f.armR.rotation.z = damp(f.armR.rotation.z, 0.55, 10, dt);
        const click = p > 0.35 && p < 0.7 ? Math.max(0, Math.sin((p - 0.35) / 0.35 * TAU * 2)) : 0;
        f.handR.rotation.x = -click * 0.9;
        f.head.rotation.z = damp(f.head.rotation.z, -0.28, 8, dt);
        f.head.rotation.x = damp(f.head.rotation.x, -0.12, 8, dt);
        snout.scale.z = hr * 0.75 * (1 + click * 0.15);
      } else if (catchT > 0) {
        catchT -= dt;
        const p = 1 - catchT / 2.0;
        const up = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
        f.armR.rotation.x = damp(f.armR.rotation.x, -1.9 * up, 12, dt); f.armL.rotation.x = damp(f.armL.rotation.x, -1.9 * up, 12, dt);
        f.armR.rotation.z = damp(f.armR.rotation.z, 0.25, 12, dt); f.armL.rotation.z = damp(f.armL.rotation.z, -0.25, 12, dt);
        f.head.rotation.x = damp(f.head.rotation.x, -0.3 * up, 8, dt);
        f.body.position.y = f.hipY + (p < 0.25 ? Math.sin(p / 0.25 * Math.PI) * 0.15 : 0);
      } else {
        f.armR.rotation.x = damp(f.armR.rotation.x, 0, 5, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.08, 5, dt);
        f.armL.rotation.x = damp(f.armL.rotation.x, -0.6, 5, dt); f.armL.rotation.z = damp(f.armL.rotation.z, -0.5, 5, dt);
        f.handR.rotation.x = damp(f.handR.rotation.x, 0, 8, dt);
        f.head.rotation.z = damp(f.head.rotation.z, 0, 4, dt); f.head.rotation.x = damp(f.head.rotation.x, 0, 4, dt);
        snout.scale.z = damp(snout.scale.z, hr * 0.75, 8, dt);
      }
    },
  };
  return ch;
}

// ---------------- Kylie the opossum ----------------
/**
 * Kylie, in his fishing vest and shorts, with lures stuck in his hat band. When he zones out his eyes go to
 * glazed swirls and he stands stock still.
 */
export function makeKylie() {
  const grey = 0xb8b4b0;
  const normal = mat('kylieFace', () => charToon({ map: opossumHead(false), rim: 0.35 }));
  const glazed = mat('kylieGlazed', () => charToon({ map: opossumHead(true), rim: 0.35 }));
  const f = makeFigure({ h: 1.3, skin: grey, hair: grey, hairStyle: 'none', top: 0xc8b48a, bottom: 0x8a7a5a, legs: { shorts: 0x8a7a5a }, shoes: 0x5a4a3a, outfit: { pockets: true, shirt: 0xa9c8e8, lapels: 0xb8a47a }, headMat: normal });
  const hr = 1.3 * 0.105;
  const furM = mat('possumFur', () => charToon({ map: furTexture(0xdcd8d2, 51) }));
  // long pointed snout with a pink nose, round thin ears
  const snout = cone(hr * 0.42, hr * 1.1, furM, 0, -hr * 0.25, hr * 1.25, 12); snout.rotation.x = Math.PI / 2; f.head.add(snout);
  f.head.add(sphere(hr * 0.13, flat(0xe89aa8, 0.2), 0, -hr * 0.25, hr * 1.82, 8, 6));
  for (const s of [-1, 1]) { const ear = cyl(hr * 0.38, hr * 0.38, hr * 0.06, flat(0x3a3438), s * hr * 0.72, hr * 0.72, -hr * 0.05, 14); ear.rotation.z = s * 1.2; ear.rotation.x = Math.PI / 2; f.head.add(ear); }
  // a fishing hat with lures in the band
  const hat = new THREE.Group();
  const hatM = mat('kylieHat', () => charToon({ map: cloth(0x9a8a5a) }));
  hat.add(cyl(hr * 0.8, hr * 0.9, hr * 0.6, hatM, 0, 0, 0, 16), cyl(hr * 1.45, hr * 1.45, hr * 0.05, hatM, 0, -hr * 0.28, 0, 20));
  for (let i = 0; i < 4; i++) { const a = 0.4 + i * 0.5; hat.add(ellipsoid(hr * 0.1, hr * 0.06, hr * 0.18, flat([0xe8743a, 0xf2d23a, 0x6fc4c0, 0xd23c5a][i]), Math.sin(a) * hr * 0.88, -hr * 0.12, Math.cos(a) * hr * 0.88, 8, 6)); }
  hat.position.set(0, hr * 1.02, -hr * 0.05);
  f.head.add(hat);
  // a long bare tail
  const tail = capsule(0.035, 0.6, flat(0xe0b8b8, 0.2), 0, 0.02, -0.42);
  tail.rotation.x = 1.3;
  f.body.add(tail);
  let zoneT = 0;
  const ch: Character & { zoneOut(): void } = {
    group: f.group,
    zoneOut() { zoneT = 4.0; },
    update(dt, t) {
      tail.rotation.z = Math.sin(t * 1.4) * 0.2;
      if (zoneT > 0) {
        zoneT -= dt;
        f.headMesh.material = glazed;
        // perfectly still, a slight lean, arms hanging
        relaxArms(f, dt, 8);
        f.head.rotation.x = damp(f.head.rotation.x, 0.08, 6, dt);
        f.head.rotation.z = damp(f.head.rotation.z, 0.12, 6, dt);
        f.body.rotation.z = damp(f.body.rotation.z, -0.04, 6, dt);
      } else {
        f.headMesh.material = normal;
        figureIdle(f, t, 0.9);
        f.head.rotation.z = damp(f.head.rotation.z, 0, 4, dt);
        f.body.rotation.z = damp(f.body.rotation.z, 0, 4, dt);
        // a nervous little look around now and then
        f.head.rotation.y = Math.sin(t * 0.7) * 0.25 + Math.sin(t * 2.9) * 0.05;
        f.armL.rotation.x = damp(f.armL.rotation.x, -0.25, 4, dt); f.armR.rotation.x = damp(f.armR.rotation.x, -0.25, 4, dt);
      }
    },
  };
  return ch;
}

// ---------------- Sam & Suzy ----------------
export function makeSamSuzy() {
  const g = new THREE.Group();
  const khaki = 0xc9b47a;
  const sam = makeFigure({ h: 1.36, skin: 0xf1cfb4, hair: 0x5a3a24, hairStyle: 'short', top: khaki, bottom: khaki, legs: { shorts: khaki, socks: khaki }, shoes: 0x3a2a20, glasses: true, outfit: { neckerchief: 0xf2d23a, pockets: true }, hat: { kind: 'coonskin', color: 0x6a4a30 } });
  // Suzy: pink dress, knee socks, powder-blue eyeshadow
  const suzy = makeFigure({ h: 1.44, skin: 0xf4d6c0, hair: 0x2a2320, hairStyle: 'bob', top: 0xf2a8bc, bottom: 0xf2a8bc, skirt: 0xf2a8bc, legs: { socks: 0xfbf7f2 }, shoes: 0x2a2420, face: { eyes: 0x3a5a8a, shadow: 0x8ab4e0, mouth: 'line' } });
  // Suzy's white collar
  suzy.body.add(cyl(0.1, 0.1, 0.03, flat(0xfbf7f2), 0, 0.44, 0.02, 14));
  // Sam's backpack and canteen
  sam.body.add(box(0.22, 0.28, 0.12, flat(0x6a7a4a), 0, 0.3, -0.16));
  sam.body.add(cyl(0.05, 0.05, 0.08, flat(0x8a8a8a), 0.14, 0.12, -0.05, 8));
  // Suzy's suitcase in the left hand and binoculars in the right
  const suitcase = box(0.42, 0.3, 0.13, flat(0x4f8a8a), 0, -0.16, 0);
  suitcase.add(box(0.1, 0.03, 0.03, flat(0x2a2420), 0, 0.17, 0));
  suzy.handL.add(suitcase);
  const binoc = new THREE.Group();
  binoc.add(cyl(0.035, 0.03, 0.12, flat(0x1a1a1a), -0.04, 0, 0, 8), cyl(0.035, 0.03, 0.12, flat(0x1a1a1a), 0.04, 0, 0, 8));
  binoc.rotation.x = Math.PI / 2;
  binoc.position.set(0, -0.02, 0.05);
  suzy.handR.add(binoc);
  sam.group.position.set(-0.42, 0, 0);
  suzy.group.position.set(0.42, 0, 0);
  g.add(sam.group, suzy.group);
  let moonT = 0, binocT = 0;
  const targetYaw = { v: Math.PI }; // idle: they look out over the lake (away from the track)
  const ch: Character & { moonrise(): void; binoculars(): void } = {
    group: g,
    moonrise() { moonT = 4.5; },
    binoculars() { binocT = 2.8; },
    update(dt, t) {
      figureIdle(sam, t, 0.3); figureIdle(suzy, t, 2.4);
      if (moonT > 0) {
        moonT -= dt;
        targetYaw.v = 0;
        // inner hands join
        sam.armR.rotation.z = damp(sam.armR.rotation.z, 0.55, 6, dt); sam.armR.rotation.x = damp(sam.armR.rotation.x, -0.25, 6, dt);
        suzy.armL.rotation.z = damp(suzy.armL.rotation.z, -0.55, 6, dt); suzy.armL.rotation.x = damp(suzy.armL.rotation.x, -0.25, 6, dt);
        sam.head.rotation.x = damp(sam.head.rotation.x, -0.08, 5, dt); suzy.head.rotation.x = damp(suzy.head.rotation.x, -0.08, 5, dt);
      } else {
        targetYaw.v = Math.PI;
        sam.armR.rotation.z = damp(sam.armR.rotation.z, 0.08, 4, dt); sam.armR.rotation.x = damp(sam.armR.rotation.x, 0, 4, dt);
        suzy.armL.rotation.z = damp(suzy.armL.rotation.z, -0.08, 4, dt); suzy.armL.rotation.x = damp(suzy.armL.rotation.x, 0, 4, dt);
        sam.head.rotation.x = damp(sam.head.rotation.x, 0, 4, dt); suzy.head.rotation.x = damp(suzy.head.rotation.x, 0, 4, dt);
      }
      if (binocT > 0) {
        binocT -= dt;
        suzy.armR.rotation.x = damp(suzy.armR.rotation.x, -2.55, 10, dt);
        suzy.armR.rotation.z = damp(suzy.armR.rotation.z, 0.3, 10, dt);
        suzy.armR.rotation.y = damp(suzy.armR.rotation.y, -0.6, 10, dt);
      } else {
        suzy.armR.rotation.x = damp(suzy.armR.rotation.x, 0, 5, dt);
        suzy.armR.rotation.z = damp(suzy.armR.rotation.z, 0.08, 5, dt);
        suzy.armR.rotation.y = damp(suzy.armR.rotation.y, 0, 5, dt);
      }
      // turn as a pair
      g.rotation.y = damp(g.rotation.y, targetYaw.v, 3, dt);
      suzy.legL.rotation.x = 0; suzy.legR.rotation.x = 0; sam.legL.rotation.x = 0; sam.legR.rotation.x = 0;
    },
  };
  return ch;
}

// ---------------- Khaki Scouts ----------------
export function makeScouts(count: number, rng: Rng) {
  const g = new THREE.Group();
  const scouts: Figure[] = [];
  const spacing = 1.15;
  const khaki = 0xc9b47a;
  for (let i = 0; i < count; i++) {
    const leader = i === 0;
    // the scoutmaster in his ranger hat; the troop in caps, yellow neckerchiefs, merit-badge sashes and knee socks
    const f = makeFigure({
      h: leader ? 1.8 : 1.32 + rng.range(-0.04, 0.04), skin: rng.pick([0xf1cfb4, 0xe9c4a6, 0xc98a62, 0xa86a48]), hair: rng.pick([0x5a3a24, 0x2a2320, 0xd9a860]),
      hairStyle: 'short', top: khaki, bottom: khaki, legs: { shorts: khaki, socks: khaki }, shoes: 0x3a2a20,
      outfit: { neckerchief: 0xf2d23a, sash: !leader, pockets: true },
      hat: leader ? { kind: 'brim', color: khaki, band: 0x7a5a3a } : { kind: 'cap', color: khaki },
      glasses: !leader && rng.chance(0.25),
    });
    f.group.position.set(0, 0, -i * spacing);
    if (leader) {
      // the scoutmaster carries a flag on a pole
      const pole = cyl(0.015, 0.015, 1.6, flat(0x8a6a4a), 0, 0.6, 0, 5);
      f.handR.add(pole);
      const flag = mesh(new THREE.PlaneGeometry(0.5, 0.32), mat('scoutFlag', () => charToon({ color: 0xf2d23a, side: THREE.DoubleSide })), 0.26, 1.2, 0);
      f.handR.add(flag);
      f.armR.rotation.x = -0.4;
    }
    g.add(f.group);
    scouts.push(f);
  }
  let saluteT = 0, haltT = 0;
  const ch: Character & { salute(): void; halt(): void; marching: boolean } = {
    group: g, marching: true,
    salute() { saluteT = 2.8; haltT = Math.max(haltT, 2.8); },
    halt() { haltT = 2.4; },
    update(dt, t) {
      if (saluteT > 0) saluteT -= dt;
      if (haltT > 0) haltT -= dt;
      ch.marching = haltT <= 0;
      scouts.forEach((f, i) => {
        if (ch.marching) {
          figureWalk(f, t, 7.5, 0.5, 0); // in perfect step: no phase offset
          if (i === 0) f.armR.rotation.x = -0.4;
        } else {
          relaxLegs(f, dt, 8);
          f.body.position.y = damp(f.body.position.y, f.hipY, 8, dt);
          if (i === 0) f.armR.rotation.x = damp(f.armR.rotation.x, -0.4, 8, dt);
        }
        if (saluteT > 0) {
          // right hand to the brow; left arm straight
          f.armR.rotation.x = damp(f.armR.rotation.x, -2.35, 12, dt);
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.75, 12, dt);
          f.armR.rotation.y = damp(f.armR.rotation.y, -0.9, 12, dt);
          f.armL.rotation.x = damp(f.armL.rotation.x, 0, 12, dt);
          f.head.rotation.x = damp(f.head.rotation.x, -0.05, 8, dt);
        } else if (!ch.marching) {
          relaxArms(f, dt, 6);
          if (i === 0) f.armR.rotation.x = damp(f.armR.rotation.x, -0.4, 6, dt);
          f.head.rotation.y = damp(f.head.rotation.y, -0.5, 4, dt); // all look at the box
        } else {
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.08, 6, dt); f.armR.rotation.y = damp(f.armR.rotation.y, 0, 6, dt);
          f.head.rotation.y = damp(f.head.rotation.y, 0, 4, dt);
          f.head.rotation.x = damp(f.head.rotation.x, 0, 4, dt);
        }
      });
    },
  };
  return ch;
}

// ---------------- The Alien ----------------
export function makeAlien() {
  const g = new THREE.Group();
  const skinM = mat('alienSkin', () => charToon({ map: alienSkin(), rim: 0.5, shade: 0x8a90c8 }));
  const dark = mat('alienEyes', () => new THREE.MeshStandardMaterial({ color: 0x0b0c10, metalness: 0.1, roughness: 0.15 }));
  const H = 3.2;
  // the same grey all over
  const f = makeFigure({ h: H, skin: 0xb9bcc4, hair: 0xb9bcc4, hairStyle: 'none', top: 0xb9bcc4, bottom: 0xb9bcc4, shoes: 0xb9bcc4, allMat: skinM });
  // thin it down: scale the limbs and torso narrower
  f.torso.scale.set(0.8, 1.05, 0.6);
  for (const p of [f.armL, f.armR]) { p.scale.set(0.7, 1.15, 0.7); }
  for (const p of [f.legL, f.legR]) { p.scale.set(0.7, 1.0, 0.7); }
  // big head with huge glossy black eyes
  const hr = H * 0.105;
  f.head.add(ellipsoid(hr * 1.35, hr * 1.55, hr * 1.25, skinM, 0, hr * 0.35, -hr * 0.1, 24, 18));
  for (const s of [-1, 1]) {
    const e = ellipsoid(hr * 0.42, hr * 0.62, hr * 0.15, dark, s * hr * 0.6, hr * 0.25, hr * 1.1, 16, 12);
    e.rotation.z = -s * 0.5;
    f.head.add(e);
  }
  // the meteorite it takes
  const rock = mesh(new THREE.DodecahedronGeometry(0.34, 0), flat(0x3a3238, 0.2));
  rock.visible = false;
  f.handL.add(rock);
  g.add(f.group);
  // timeline: 0 hidden, 1 descending, 2 posing, 3 ascending
  const st = { phase: 0, t: 0, top: 22, bottom: 0 };
  const ch: Character & { state: typeof st; start(top: number, bottom: number): void; rock: THREE.Mesh; visible: boolean } = {
    group: g, state: st, rock, visible: false,
    start(top, bottom) { st.phase = 1; st.t = 0; st.top = top; st.bottom = bottom; g.visible = true; ch.visible = true; rock.visible = false; },
    update(dt, t) {
      if (st.phase === 0) { g.visible = false; ch.visible = false; return; }
      st.t += dt;
      if (st.phase === 1) {
        const p = clamp(st.t / 4.5, 0, 1);
        const e = 1 - Math.pow(1 - p, 2);
        g.position.y = lerp(st.top, st.bottom, e);
        g.rotation.y = t * 0.6;
        // arms out slightly while it floats
        f.armL.rotation.z = damp(f.armL.rotation.z, -0.5, 4, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.5, 4, dt);
        f.legL.rotation.x = 0; f.legR.rotation.x = 0;
        if (p >= 1) { st.phase = 2; st.t = 0; }
      } else if (st.phase === 2) {
        // freeze in an awkward pose, grabbing the meteorite
        g.rotation.y = damp(g.rotation.y, 0, 6, dt);
        f.armR.rotation.x = damp(f.armR.rotation.x, -2.9, 8, dt); f.armR.rotation.z = damp(f.armR.rotation.z, 0.45, 8, dt);
        f.armL.rotation.x = damp(f.armL.rotation.x, -1.0, 8, dt); f.armL.rotation.z = damp(f.armL.rotation.z, -0.9, 8, dt);
        f.legL.rotation.x = damp(f.legL.rotation.x, -1.05, 8, dt);
        f.head.rotation.z = damp(f.head.rotation.z, 0.32, 8, dt);
        f.body.rotation.y = damp(f.body.rotation.y, 0.28, 8, dt);
        rock.visible = st.t > 1.2;
        if (st.t >= 8) { st.phase = 3; st.t = 0; }
      } else if (st.phase === 3) {
        const p = clamp(st.t / 3.2, 0, 1);
        g.position.y = lerp(st.bottom, st.top, p * p);
        g.rotation.y += dt * 1.2;
        f.legL.rotation.x = damp(f.legL.rotation.x, 0, 4, dt);
        f.armR.rotation.x = damp(f.armR.rotation.x, -0.4, 4, dt); f.armL.rotation.x = damp(f.armL.rotation.x, -0.9, 4, dt);
        if (p >= 1) { st.phase = 0; g.visible = false; ch.visible = false; }
      }
    },
  };
  g.visible = false;
  return ch;
}

// ---------------- The UFO ----------------
export function makeUfo() {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -0.75), new THREE.Vector2(1.8, -0.65), new THREE.Vector2(3.4, -0.3), new THREE.Vector2(4.4, 0), new THREE.Vector2(3.4, 0.28), new THREE.Vector2(1.4, 0.55), new THREE.Vector2(0.01, 0.6)];
  const hull = mesh(new THREE.LatheGeometry(pts, 36), new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 0.55, roughness: 0.4 }), 0, 0, 0);
  g.add(hull);
  g.add(mesh(new THREE.TorusGeometry(4.35, 0.12, 6, 40), flat(0x4a4f58), 0, 0, 0).rotateX(Math.PI / 2));
  g.add(mesh(new THREE.SphereGeometry(1.35, 20, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xaee3f2, transparent: true, opacity: 0.55 }), 0, 0.55, 0));
  g.add(cyl(0.9, 1.4, 0.4, flat(0x6a6f78), 0, -0.85, 0, 20));
  // a ring of running lights: one instanced mesh whose colours change each frame
  const N = 14;
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const m4 = new THREE.Matrix4(), lc = new THREE.Color();
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; lights.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 3.6, -0.32, Math.sin(a) * 3.6)); lights.setColorAt(i, lc.setHex(0xfff0a0)); }
  g.add(lights);
  // beam of light below (scaled to the hover height when shown)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
  beamGeo.translate(0, -0.5, 0); // apex at origin, opens downward
  const beam = mesh(beamGeo, beamMat, 0, -0.9, 0);
  beam.rotation.x = Math.PI; // cone apex points up at the saucer
  beam.visible = false;
  g.add(beam);
  let beamOn = false, beamAmt = 0;
  const ch: Character & { setBeam(on: boolean, length: number): void; hover: number } = {
    group: g, hover: 0,
    setBeam(on, length) { beamOn = on; beam.scale.set(3.2, length, 3.2); beam.visible = true; },
    update(dt, t) {
      g.position.y = ch.hover + Math.sin(t * 0.9) * 0.45;
      g.rotation.y += dt * 0.35;
      g.rotation.z = Math.sin(t * 0.7) * 0.04; g.rotation.x = Math.cos(t * 0.55) * 0.04;
      for (let i = 0; i < N; i++) { const on = ((Math.floor(t * 6) + i) % N) < 5; lights.setColorAt(i, lc.setHex(0xfff0a0).multiplyScalar(on ? 1.6 : 0.45)); }
      lights.instanceColor!.needsUpdate = true;
      beamAmt = damp(beamAmt, beamOn ? 1 : 0, 3, dt);
      beamMat.opacity = beamAmt * (0.22 + Math.sin(t * 5) * 0.05);
      beam.rotation.y = -g.rotation.y;
      if (beamAmt < 0.01 && !beamOn) beam.visible = false;
    },
  };
  return ch;
}

// ---------------- The Belafonte ----------------
/**
 * Steve Zissou's research vessel, built like the film's cutaway set: the port side of the hull (the side
 * facing the line) is open from the waterline to the deck, showing a row of lit rooms (engine room, sauna,
 * lab, library, galley, editing room). A helicopter on the aft pad, a radar that turns, a crane.
 */
export function makeBelafonte() {
  const g = new THREE.Group();
  const white = flat(0xf6f6f2, 0.2), yellow = flat(0xf2d23a), dark = flat(0x3a4048, 0.15);
  const L = 42, W = 9, H = 4.2;
  const hullTex = hullTexture();
  const hullM = charToon({ map: hullTex, rim: 0.15 });
  // the hull: a solid keel below the waterline and a solid starboard half; the port half is the cutaway
  const keel = mesh(boxUV(new THREE.BoxGeometry(W, 1.5, L), 12, 4.2), charToon({ color: 0xd23c3c, rim: 0.1 }), 0, -0.45, 0);
  g.add(keel);
  const stbd = mesh(boxUV(new THREE.BoxGeometry(W / 2, 2.7, L), 12, 2.7), hullM, W / 4, 1.65, 0);
  g.add(stbd);
  const bow = cone(W / 2, 9, flat(0x9cc8e4, 0.15), 0, H / 2 - 1.2, L / 2 + 4.5, 4);
  bow.rotation.x = Math.PI / 2;
  bow.geometry.rotateY(Math.PI / 4);
  bow.scale.set(1, 1, H / W);
  g.add(bow);
  // the rooms, stern to bow, each with its painted back wall and a strip light
  const rooms: Array<Parameters<typeof cabinWall>[0]> = ['engine', 'sauna', 'lab', 'library', 'galley', 'editing'];
  const z0 = -L / 2 + 1, rl = 6;
  const floorM = charToon({ map: planks(0xb08a62, 91), rim: 0 });
  rooms.forEach((kind, i) => {
    const zc = z0 + rl * (i + 0.5);
    const wallTex = cabinWall(kind);
    const wall = mesh(new THREE.PlaneGeometry(rl - 0.2, 2.6), new THREE.MeshLambertMaterial({ map: wallTex, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.35 }), -0.02, 1.62, zc);
    wall.rotation.y = -Math.PI / 2;
    g.add(wall);
    g.add(mesh(boxUV(new THREE.BoxGeometry(W / 2, 0.1, rl), 1, 2), floorM, -W / 4, 0.35, zc));
    g.add(box(0.12, 0.06, rl - 0.8, glow(0xfff0d0, 1.1), -1.6, 2.86, zc));
  });
  // each room's side walls in its own colour, so the row reads as a string of lit rooms even at an angle
  const roomCol = { engine: 0x9aa4ac, sauna: 0xc8945a, lab: 0xd8e8ee, library: 0xe8d0a8, galley: 0xc8e8e0, editing: 0x5a5a6a, bridge: 0xd8e8f2 };
  for (let i = 0; i <= rooms.length; i++) {
    const z = z0 + rl * i;
    if (i > 0) g.add(box(W / 2, 2.6, 0.08, flat(roomCol[rooms[i - 1]], 0.1), -W / 4, 1.62, z - 0.04));
    if (i < rooms.length) g.add(box(W / 2, 2.6, 0.08, flat(roomCol[rooms[i]], 0.1), -W / 4, 1.62, z + 0.04));
    g.add(box(0.14, 2.7, 0.2, white, -W / 2, 1.65, z));
  }
  // the solid bow section beyond the rooms, and the observation bubble on its port side
  const bowEnd = z0 + rl * rooms.length;
  g.add(mesh(boxUV(new THREE.BoxGeometry(W / 2, 2.7, L / 2 - bowEnd), 12, 2.7), hullM, -W / 4, 1.65, (bowEnd + L / 2) / 2));
  g.add(mesh(boxUV(new THREE.BoxGeometry(W / 2, 2.7, 1.0), 12, 2.7), hullM, -W / 4, 1.65, -L / 2 + 0.5));
  // cut edges picked out in white, as on the set
  g.add(box(0.14, 0.2, L, white, -W / 2, 3.0, 0), box(0.14, 0.2, L, white, -W / 2, 0.3, 0));
  g.add(sphere(1.1, new THREE.MeshLambertMaterial({ color: 0xbfe8f4, transparent: true, opacity: 0.55 }), -W / 2 - 0.3, 1.2, (bowEnd + L / 2) / 2 + 1, 16, 12));
  g.add(mesh(new THREE.TorusGeometry(1.05, 0.12, 6, 20), white, -W / 2 - 0.05, 1.2, (bowEnd + L / 2) / 2 + 1).rotateY(Math.PI / 2));
  // deck
  g.add(mesh(boxUV(new THREE.BoxGeometry(W, 0.3, L), 1, 2), charToon({ map: planks(0xd8c8a8, 93), rim: 0 }), 0, H - 1.05, 0));
  // superstructure: white blocks with pale blue window strips
  const winMat = glow(0xcfe9f4, 1.0);
  const block = (w: number, h: number, d: number, x: number, y: number, z: number) => { g.add(box(w, h, d, white, x, y, z)); g.add(box(w + 0.05, 0.6, d + 0.05, winMat, x, y + h * 0.18, z)); };
  block(7, 2.6, 12, 0, H - 0.9 + 1.3, 2);
  block(5.5, 2.4, 7, 0, H - 0.9 + 2.6 + 1.2, 4);
  block(4, 2.2, 4, 0, H - 0.9 + 5 + 1.1, 5.5); // bridge
  g.add(cyl(0.9, 1.0, 3.2, white, 0, H - 0.9 + 5 + 1.6, -1.5, 14));
  g.add(cyl(0.95, 0.95, 0.5, flat(0xd23c3c), 0, H - 0.9 + 5 + 3.0, -1.5, 14));
  // mast with a radar and a Team Zissou pennant
  g.add(cyl(0.08, 0.1, 7, dark, 0, H - 0.9 + 6 + 3, 6, 6));
  const radar = box(1.4, 0.3, 0.2, white, 0, H - 0.9 + 6 + 5.5, 6);
  radar.userData.keep = true;
  g.add(radar);
  const flagTex = canvasTexture(128, 72, (c) => { c.fillStyle = '#8ec3e6'; c.fillRect(0, 0, 128, 72); c.fillStyle = '#f2c832'; c.font = 'bold 50px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Z', 64, 38); });
  const flag = mesh(new THREE.PlaneGeometry(1.6, 0.9), charToon({ map: flagTex, side: THREE.DoubleSide, rim: 0 }), 0.8, H - 0.9 + 6 + 6.2, 6);
  flag.userData.keep = true;
  g.add(flag);
  // aft helipad with a yellow helicopter
  const padTex = textTexture('H', { font: 'bold 96px Georgia, serif', color: '#ffffff', bg: '#2f6f8a', w: 128, h: 128 });
  const pad = mesh(new THREE.CircleGeometry(3.6, 28), new THREE.MeshLambertMaterial({ map: padTex }), 0, H - 0.88, -14);
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);
  const heli = new THREE.Group();
  heli.add(ellipsoid(0.9, 0.8, 1.6, yellow, 0, 0.9, 0));
  heli.add(ellipsoid(0.7, 0.6, 0.6, new THREE.MeshLambertMaterial({ color: 0xbfe4f4, transparent: true, opacity: 0.7 }), 0, 1.0, 1.25));
  const boom = cyl(0.14, 0.24, 3.2, yellow, 0, 1.05, -2.4, 8); boom.rotation.x = Math.PI / 2; heli.add(boom);
  heli.add(box(0.1, 0.9, 0.6, yellow, 0, 1.5, -3.9));
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = box(6.2, 0.05, 0.22, dark, 0, 0, 0); b.rotation.y = i * Math.PI / 2; b.userData.keep = true; rotor.add(b); }
  rotor.position.set(0, 1.85, 0);
  heli.add(cyl(0.08, 0.08, 0.3, dark, 0, 1.75, 0, 6), rotor);
  const tailRotor = new THREE.Group();
  const tb = box(0.9, 0.04, 0.12, dark, 0, 0, 0); tb.userData.keep = true; tailRotor.add(tb);
  tailRotor.position.set(0.15, 1.6, -3.95);
  tailRotor.rotation.y = Math.PI / 2;
  heli.add(tailRotor);
  for (const s of [-1, 1]) { const sk = cyl(0.04, 0.04, 2.4, dark, s * 0.6, 0.12, 0, 5); sk.rotation.x = Math.PI / 2; heli.add(sk); }
  heli.position.set(0, H - 0.85, -14);
  g.add(heli);
  // crane, railings, a couple of vents, a lifeboat
  g.add(cyl(0.1, 0.12, 5, dark, -2.6, H - 0.9 + 2.5, -7, 6));
  { const arm = cyl(0.07, 0.09, 6, dark, -2.6, H - 0.9 + 4.6, -9.6, 6); arm.rotation.x = 1.0; g.add(arm); }
  for (const s of [-1, 1]) {
    const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, L - 2, 5), white, s * (W / 2 - 0.2), H - 0.9 + 1.0, 0); r.rotation.x = Math.PI / 2; g.add(r);
    for (let z = -L / 2 + 2; z <= L / 2 - 2; z += 4) g.add(cyl(0.03, 0.03, 1.0, white, s * (W / 2 - 0.2), H - 0.9 + 0.5, z, 5));
  }
  for (const z of [-4, -6]) g.add(cyl(0.3, 0.3, 1.2, white, 2.4, H - 0.9 + 0.6, z, 10));
  g.add(ellipsoid(0.6, 0.4, 1.6, flat(0xf07a3a), 3.8, H - 0.9 + 1.4, -3));
  // name on both sides
  const nameTex = textTexture('BELAFONTE', { font: 'bold 60px Georgia, serif', color: '#2f4a5e', w: 512, h: 96 });
  for (const s of [-1, 1]) {
    const n = mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }), s * (W / 2 + 0.06), H - 1.25, s > 0 ? 12 : 17.5);
    n.rotation.y = s * Math.PI / 2;
    g.add(n);
  }
  // shared by the ship and the Team Zissou crew row
  g.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent) c.castShadow = true; });
  mergeStatic(g);
  let hornT = 0, rotorSpeed = 0;
  const ch: Character & { horn(): void; deckY: number; hull: THREE.Mesh } = {
    group: g, deckY: H - 0.9, hull: stbd,
    horn() { hornT = 4; },
    update(dt, t) {
      g.position.y = Math.sin(t * 0.6) * 0.12;
      g.rotation.z = Math.sin(t * 0.5) * 0.012;
      g.rotation.x = Math.cos(t * 0.42) * 0.006;
      radar.rotation.y = t * 1.2;
      flag.rotation.y = Math.sin(t * 2.5) * 0.25;
      if (hornT > 0) hornT -= dt;
      rotorSpeed = damp(rotorSpeed, hornT > 0 ? 28 : 0, 2.5, dt);
      rotor.rotation.y += rotorSpeed * dt;
      tailRotor.rotation.z += rotorSpeed * 2 * dt;
    },
  };
  return ch;
}

// ---------------- Team Zissou ----------------
const zissouLook = (rng: Rng, centre: boolean): FigureOpts => ({
  h: centre ? 1.8 : 1.68 + rng.range(-0.06, 0.06), skin: rng.pick([0xf1cfb4, 0xe9c4a6, 0xc98a62, 0xa86a48]), hair: centre ? 0xcfcfcf : rng.pick([0x5a3a24, 0x2a2320, 0x8a5a3a]),
  hairStyle: 'short', top: 0x8ec3e6, bottom: 0x8ec3e6, shoes: 0xf6f6f2, hat: { kind: 'beanie', color: 0xd23c3c },
  beard: centre ? 0xdedede : undefined, glasses: !centre && rng.chance(0.4), outfit: { zissou: true },
});
export function makeTeamZissou(count: number, rng: Rng) {
  const g = new THREE.Group();
  const crew: Figure[] = [];
  const spacing = 1.25;
  for (let i = 0; i < count; i++) {
    const f = makeFigure(zissouLook(rng, i === Math.floor(count / 2)));
    f.group.position.set((i - (count - 1) / 2) * spacing, 0, 0);
    g.add(f.group);
    crew.push(f);
  }
  let pointT = 0, saluteT = 0;
  const ch: Character & { point(): void; salute(): void } = {
    group: g,
    point() { pointT = 3.6; },
    salute() { saluteT = 2.4; },
    update(dt, t) {
      crew.forEach((f, i) => {
        figureIdle(f, t, i * 1.3);
        if (pointT > 0) {
          f.armR.rotation.x = damp(f.armR.rotation.x, -1.5, 10, dt);
          f.armR.rotation.y = damp(f.armR.rotation.y, 0.75, 10, dt);
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.1, 10, dt);
          f.head.rotation.y = damp(f.head.rotation.y, -0.7, 8, dt);
        } else if (saluteT > 0) {
          f.armR.rotation.x = damp(f.armR.rotation.x, -2.35, 12, dt);
          f.armR.rotation.z = damp(f.armR.rotation.z, 0.75, 12, dt);
          f.armR.rotation.y = damp(f.armR.rotation.y, -0.9, 12, dt);
          f.head.rotation.y = damp(f.head.rotation.y, 0, 8, dt);
        } else {
          relaxArms(f, dt, 5);
          f.head.rotation.y = damp(f.head.rotation.y, Math.sin(t * 0.4 + i) * 0.08, 3, dt);
        }
      });
      if (pointT > 0) pointT -= dt;
      if (saluteT > 0) saluteT -= dt;
    },
  };
  return ch;
}

// ---------------- Pelé dos Santos ----------------
/** The Belafonte's safety expert, sitting on a crate on the aft deck with an acoustic guitar. Whistle and he plays. */
export function makePele() {
  const g = new THREE.Group();
  const f = makeFigure({ h: 1.76, skin: 0x7a4a30, hair: 0x1a1414, hairStyle: 'short', top: 0x8ec3e6, bottom: 0x8ec3e6, shoes: 0xf6f6f2, hat: { kind: 'beanie', color: 0xd23c3c }, outfit: { zissou: true }, face: { mouth: 'smile' } });
  // sitting: hips on the crate, feet forward on the deck
  f.legL.rotation.x = -1.0; f.legR.rotation.x = -1.0;
  f.group.position.y = -f.hipY + 0.52;
  const crate = mesh(boxUV(new THREE.BoxGeometry(0.6, 0.5, 0.5), 0.5, 0.5), mat('peleCrate', () => charToon({ map: planks(0xb08a5a, 95), rim: 0 })), 0, 0.25, -0.05);
  g.add(crate);
  // the guitar across his lap: body at his right hip, the neck rising to his left hand
  const guitar = new THREE.Group();
  const wood = mat('guitarWood', () => charToon({ color: 0xc88a4a, rim: 0.3 }));
  guitar.add(cyl(0.2, 0.2, 0.09, wood, 0.12, 0, 0, 20).rotateX(Math.PI / 2), cyl(0.16, 0.16, 0.09, wood, -0.12, 0, 0, 20).rotateX(Math.PI / 2));
  guitar.add(cyl(0.05, 0.05, 0.1, flat(0x2a1a10), 0.0, 0, 0.01, 12).rotateX(Math.PI / 2));
  guitar.add(box(0.5, 0.05, 0.03, flat(0x5a3a20), -0.5, 0, 0.02), box(0.12, 0.08, 0.03, flat(0x5a3a20), -0.8, 0, 0.02));
  guitar.position.set(0.06, 0.22, 0.2);
  guitar.rotation.z = -0.35;
  f.body.add(guitar);
  g.add(f.group);
  f.armL.rotation.set(-1.0, 0, -0.55);
  f.armR.rotation.set(-0.8, 0, 0.35);
  let playT = 0;
  const ch: Character & { play(): void } = {
    group: g,
    play() { playT = 5; },
    update(dt, t) {
      figureIdle(f, t, 0.4);
      if (playT > 0) {
        playT -= dt;
        f.armR.rotation.x = -0.8 + Math.sin(t * 14) * 0.12;
        f.head.rotation.z = Math.sin(t * 2.2) * 0.12;
        f.head.rotation.x = damp(f.head.rotation.x, -0.12, 4, dt);
        f.body.rotation.z = Math.sin(t * 2.2) * 0.04;
      } else {
        f.armR.rotation.x = damp(f.armR.rotation.x, -0.8 + Math.sin(t * 0.8) * 0.03, 4, dt);
        f.head.rotation.z = damp(f.head.rotation.z, 0, 3, dt);
        f.head.rotation.x = damp(f.head.rotation.x, 0.15, 3, dt);
        f.body.rotation.z = damp(f.body.rotation.z, 0, 3, dt);
      }
    },
  };
  return ch;
}

// ---------------- The jaguar shark ----------------
export function makeJaguarShark() {
  const g = new THREE.Group();
  const skinTex = jaguarSkin();
  const skinM = charToon({ map: skinTex.map, emissive: 0x9ff0ff, emissiveMap: skinTex.glow, emissiveIntensity: 0.6, rim: 0.3 });
  const finM = flat(0x3d4d63, 0.25);
  const RX = 1.7, RY = 1.35, RZ = 6.8;
  const body = ellipsoid(RX, RY, RZ, skinM, 0, 0, 0, 28, 18);
  body.userData.keep = true;
  g.add(body);
  // fins and tail
  const dorsal = cone(0.9, 1.9, finM, 0, RY + 0.4, -0.5, 4); dorsal.scale.x = 0.35; dorsal.rotation.y = Math.PI / 4; g.add(dorsal);
  for (const s of [-1, 1]) { const p = cone(0.7, 2.2, finM, s * (RX + 0.6), -0.3, 1.2, 4); p.rotation.z = s * Math.PI / 2 - s * 0.3; p.rotation.x = 0.5; p.scale.z = 0.35; g.add(p); }
  const tail = new THREE.Group();
  const up = cone(0.6, 2.6, finM, 0, 1.0, -0.6, 4); up.rotation.x = -0.9; up.scale.x = 0.4; up.userData.keep = true; tail.add(up);
  const lo = cone(0.5, 1.8, finM, 0, -0.7, -0.5, 4); lo.rotation.x = Math.PI + 0.9; lo.scale.x = 0.4; lo.userData.keep = true; tail.add(lo);
  tail.position.set(0, 0, -RZ - 0.4);
  g.add(tail);
  // eyes and gills
  const dark = flat(0x0b0c10, 0.4);
  for (const s of [-1, 1]) {
    g.add(sphere(0.16, dark, s * RX * 0.72, 0.35, RZ * 0.62, 8, 6));
    for (let i = 0; i < 4; i++) g.add(box(0.05, 0.7, 0.08, dark, s * RX * 0.95, 0.05, RZ * 0.35 - i * 0.28));
  }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  mergeStatic(g);
  // 0 hidden, 1 rising, 2 cruising at the surface, 3 diving
  const st = { phase: 0, t: 0, hidden: -10, surface: -0.5 };
  g.position.y = st.hidden;
  g.visible = false;
  const ch: Character & { state: typeof st; surface(): void; visible: boolean } = {
    group: g, state: st, visible: false,
    surface() { if (st.phase === 0) { st.phase = 1; st.t = 0; g.visible = true; ch.visible = true; } },
    update(dt, t) {
      if (st.phase === 0) return;
      st.t += dt;
      // the rosettes glow in a slow pulse
      skinM.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2)) + 0.1 * Math.sin(t * 7.1);
      tail.rotation.y = Math.sin(t * 2.2) * 0.35;
      body.rotation.y = Math.sin(t * 2.2 + 0.4) * 0.03;
      if (st.phase === 1) {
        const p = clamp(st.t / 5, 0, 1);
        g.position.y = lerp(st.hidden, st.surface, 1 - Math.pow(1 - p, 2));
        g.rotation.x = -0.18 * Math.sin(p * Math.PI);
        if (p >= 1) { st.phase = 2; st.t = 0; }
      } else if (st.phase === 2) {
        g.position.y = st.surface + Math.sin(t * 1.1) * 0.15;
        g.position.z -= dt * 1.4;
        g.rotation.x = damp(g.rotation.x, 0, 3, dt);
        if (st.t >= 7) { st.phase = 3; st.t = 0; }
      } else if (st.phase === 3) {
        const p = clamp(st.t / 5, 0, 1);
        g.position.y = lerp(st.surface, st.hidden, p * p);
        g.position.z -= dt * 2.0;
        g.rotation.x = 0.22 * Math.sin(p * Math.PI);
        if (p >= 1) { st.phase = 0; g.visible = false; ch.visible = false; }
      }
    },
  };
  return ch;
}

// ---------------- Deep Search (the yellow submarine) ----------------
export function makeDeepSearch() {
  const g = new THREE.Group();
  const skin = charToon({ map: subTexture(), rim: 0.25 });
  const yellow = flat(0xf2c832), dark = flat(0x2a2c30, 0.2);
  const hull = mesh(new THREE.CapsuleGeometry(1.0, 4.2, 8, 20), skin);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  g.add(box(1.1, 1.0, 1.7, yellow, 0, 1.1, 0.3)); // conning tower
  const periscope = cyl(0.06, 0.06, 1.4, dark, 0, 1.9, 0.3, 6);
  periscope.userData.keep = true;
  g.add(periscope);
  const scopeHead = box(0.3, 0.1, 0.1, dark, 0.1, 0.7, 0); scopeHead.userData.keep = true;
  periscope.add(scopeHead);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CircleGeometry(0.16, 12), flat(0x2f4a5e, 0.2), s * 1.01, 0.15, -1.2 + i * 1.1).rotateY(s * Math.PI / 2));
  for (const s of [-1, 1]) g.add(box(1.2, 0.06, 0.5, yellow, s * 1.2, 0.2, 0.8)); // dive planes
  const prop = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = box(0.9, 0.05, 0.2, dark, 0, 0, 0); b.rotation.z = (i / 3) * Math.PI; b.userData.keep = true; prop.add(b); }
  prop.position.set(0, 0, -3.3);
  g.add(prop);
  g.add(cone(0.35, 0.8, yellow, 0, 0.9, -2.4, 4).rotateY(Math.PI / 4)); // rudder fin
  const nameTex = textTexture('DEEP SEARCH', { font: 'bold 44px Georgia, serif', color: '#2a2c30', w: 512, h: 64 });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(2.2, 0.28), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }), s * 0.56, 1.35, 0.3); n.rotation.y = s * Math.PI / 2; g.add(n); }
  mergeStatic(g);
  let surfaceT = 0;
  const ch: Character & { surface(): void } = {
    group: g,
    surface() { surfaceT = 6; },
    update(dt, t) {
      prop.rotation.z += dt * 6;
      if (surfaceT > 0) surfaceT -= dt;
      // usually half-submerged, rolling in the swell; fully up when called
      const natural = -1.1 + Math.sin(t * 0.22) * 0.9;
      const target = surfaceT > 0 ? 0.35 : natural;
      g.position.y = damp(g.position.y, target, surfaceT > 0 ? 1.2 : 0.8, dt);
      g.rotation.x = damp(g.rotation.x, surfaceT > 0 ? -0.08 : Math.sin(t * 0.5) * 0.06, 2, dt);
      g.rotation.z = Math.sin(t * 0.8) * 0.04;
      periscope.position.y = damp(periscope.position.y, surfaceT > 0 ? 2.4 : 1.9, 3, dt);
      periscope.rotation.y = surfaceT > 0 ? t * 1.5 : 0;
    },
  };
  return ch;
}

// ---------------- Funicular ----------------
/** Two counterbalanced cars on a slanted rail from `bottom` to `top`. Local: bottom at origin, rails run up local +z. */
export function makeFunicular(bottom: THREE.Vector3, top: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.copy(bottom);
  const d = top.clone().sub(bottom);
  const horiz = Math.hypot(d.x, d.z);
  const angle = Math.atan2(d.y, horiz);
  const L = d.length();
  g.rotation.y = Math.atan2(d.x, d.z);
  const slope = new THREE.Group();
  slope.rotation.x = -angle;
  g.add(slope);
  const stone = flat(0xc9c1b6, 0.1), iron = flat(0x4a4f58, 0.2), burgundy = flat(0x7a2a36);
  // the rail bed, merged; the cars are added after so they stay separate
  const bed = new THREE.Group();
  bed.add(box(4.2, 0.35, L, stone, 0, -0.18, L / 2));
  for (const x of [-1.5, -0.5, 0.5, 1.5]) bed.add(box(0.08, 0.1, L, iron, x, 0.05, L / 2));
  for (let z = 0.6; z < L; z += 1.4) bed.add(box(4.0, 0.08, 0.3, flat(0x6a5a4a, 0.1), 0, -0.02, z));
  bed.add(cyl(0.02, 0.02, L, iron, -1.0, 0.25, L / 2, 4).rotateX(Math.PI / 2));
  bed.add(cyl(0.02, 0.02, L, iron, 1.0, 0.25, L / 2, 4).rotateX(Math.PI / 2));
  // top station wheelhouse
  bed.add(box(3.6, 1.2, 1.4, stone, 0, 0.5, L + 0.7));
  bed.add(cyl(0.5, 0.5, 0.6, iron, 0, 0.9, L + 0.4, 12).rotateX(Math.PI / 2));
  bed.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  slope.add(mergeStatic(bed));
  // the two cars, each kept level with a counter-rotation
  const cream = mat('funicularCream', () => charToon({ map: paintedMetal(0xf5efe2, 97), rim: 0.2 })), pink = flat(0xf2b8c6);
  const makeCar = (x: number) => {
    const c = new THREE.Group();
    c.position.set(x, 0.1, 0);
    c.rotation.x = angle;
    const body = new THREE.Group();
    body.add(mesh(boxUV(new THREE.BoxGeometry(1.7, 1.7, 2.4), 1, 1), cream, 0, 1.15, 0));
    body.add(box(1.75, 0.35, 2.45, pink, 0, 0.5, 0));
    body.add(box(1.8, 0.25, 2.6, burgundy, 0, 2.08, 0));
    const winMat = mat('funicularGlass', () => new THREE.MeshLambertMaterial({ color: 0xd9ecf6, emissive: 0x88a8b8, emissiveIntensity: 0.15 }));
    for (const s of [-1, 1]) for (const z of [-0.7, 0.1, 0.8]) body.add(box(0.05, 0.7, 0.55, winMat, s * 0.86, 1.35, z));
    body.add(box(1.3, 0.7, 0.05, winMat, 0, 1.35, 1.21), box(1.3, 0.7, 0.05, winMat, 0, 1.35, -1.21));
    body.add(box(1.6, 0.3, 0.4, iron, 0, 0.15, 1.2), box(1.6, 0.3, 0.4, iron, 0, 0.15, -1.2));
    body.add(box(1.7, 0.2, 0.9, iron, 0, 0.05, 0)); // wedge base (visually it sits on the slope)
    body.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    mergeStatic(body);
    const lamp = sphere(0.1, glow(0xfff0c0, 1.2), 0, 2.3, 1.1, 8, 6);
    body.add(lamp);
    c.add(body);
    slope.add(c);
    return { c, lamp, body };
  };
  const carA = makeCar(-1.0), carB = makeCar(1.0);
  let u = 0.15, dir = 1, wait = 0, ringT = 0;
  const ch: Character & { ring(): void; carA: THREE.Group; carB: THREE.Group } = {
    group: g, carA: carA.c, carB: carB.c,
    ring() { ringT = 2.5; wait = Math.max(wait, 2.5); },
    update(dt, t) {
      if (ringT > 0) ringT -= dt;
      if (wait > 0) wait -= dt;
      else {
        u += dir * dt * 0.045;
        if (u >= 1) { u = 1; dir = -1; wait = 4; }
        if (u <= 0) { u = 0; dir = 1; wait = 4; }
      }
      const zA = 1.5 + u * (L - 3), zB = 1.5 + (1 - u) * (L - 3);
      carA.c.position.z = zA; carB.c.position.z = zB;
      const rock = Math.sin(t * 3) * 0.01 * (wait > 0 ? 0 : 1);
      carA.body.rotation.z = rock; carB.body.rotation.z = -rock;
      const flash = ringT > 0 ? (Math.sin(t * 18) > 0 ? 2.2 : 0.6) : 1.2;
      for (const c of [carA, carB]) (c.lamp.material as THREE.MeshBasicMaterial).color.setHex(0xfff0c0).multiplyScalar(flash);
      if (ringT > 0) { carA.body.position.y = Math.abs(Math.sin(t * 12)) * 0.04; carB.body.position.y = Math.abs(Math.sin(t * 12)) * 0.04; }
      else { carA.body.position.y = damp(carA.body.position.y, 0, 8, dt); carB.body.position.y = damp(carB.body.position.y, 0, 8, dt); }
    },
  };
  return ch;
}

// ---------------- The cable car to Gabelmeister's Peak ----------------
/**
 * Two gondolas on a pair of ropes between the valley station and the summit, counterbalanced: one goes up
 * while the other comes down, and they pass halfway. Whistle and both stop dead mid-route, swinging.
 */
export function makeCableCar(bottom: THREE.Vector3, top: THREE.Vector3) {
  const g = new THREE.Group();
  const dir = top.clone().sub(bottom);
  const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize().multiplyScalar(0.7);
  const yaw = Math.atan2(dir.x, dir.z);
  const red = mat('gondolaRed', () => charToon({ map: paintedMetal(0xc8323c, 99), rim: 0.2 })), cream = flat(0xf6efe2), dark = flat(0x2a2c30, 0.2);
  const glass = mat('gondolaGlass', () => new THREE.MeshLambertMaterial({ color: 0xe8f4fa, emissive: 0xfff0d0, emissiveIntensity: 0.25 }));
  const makeGondola = () => {
    const car = new THREE.Group();
    const cab = new THREE.Group();
    cab.add(mesh(boxUV(new THREE.BoxGeometry(2.0, 1.9, 2.8), 1, 1), red, 0, -3.2, 0));
    cab.add(box(2.06, 0.7, 2.86, glass, 0, -2.9, 0));
    for (const x of [-0.5, 0.5]) cab.add(box(2.1, 0.7, 0.06, cream, 0, -2.9, x * 2.2));
    cab.add(box(2.2, 0.18, 3.0, cream, 0, -2.2, 0), box(2.1, 0.2, 2.9, cream, 0, -4.2, 0));
    cab.add(box(0.12, 2.0, 0.12, dark, 0, -1.2, 0), box(0.8, 0.2, 0.14, dark, 0, -0.2, 0));
    for (const z of [-0.3, 0.3]) cab.add(cyl(0.16, 0.16, 0.1, dark, 0, 0, z, 10).rotateZ(Math.PI / 2));
    cab.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    mergeStatic(cab);
    car.add(cab);
    car.rotation.y = yaw;
    g.add(car);
    return { car, cab };
  };
  const A = makeGondola(), B = makeGondola();
  let u = 0.2, d = 1, wait = 0, stopT = 0, swing = 0;
  const ch: Character & { stop(): void; carA: THREE.Group } = {
    group: g, carA: A.car,
    stop() { stopT = 4; swing = 0.14; },
    update(dt, t) {
      if (stopT > 0) stopT -= dt;
      else if (wait > 0) wait -= dt;
      else {
        u += d * dt * 0.02;
        if (u >= 1) { u = 1; d = -1; wait = 5; }
        if (u <= 0) { u = 0; d = 1; wait = 5; }
      }
      swing = damp(swing, 0, 0.6, dt);
      const ease = (x: number) => x * x * (3 - 2 * x);
      A.car.position.copy(bottom).lerp(top, ease(u)).add(side);
      B.car.position.copy(bottom).lerp(top, ease(1 - u)).sub(side);
      const sw = Math.sin(t * 2.4) * swing + Math.sin(t * 0.9) * 0.015;
      A.cab.rotation.x = sw; B.cab.rotation.x = -sw;
    },
  };
  return ch;
}

// ---------------- Mendl's delivery van ----------------
export function makeMendlsVan() {
  const g = new THREE.Group();
  const pink = mat('vanPink', () => charToon({ map: paintedMetal(0xf2b8c6, 101), rim: 0.2 })), white = flat(0xfbf7f2), dark = flat(0x2a2c30, 0.15), brass = flat(0xd8b25a);
  g.add(mesh(boxUV(new THREE.BoxGeometry(2.0, 1.5, 4.6), 1, 1), pink, 0, 1.25, 0));
  g.add(box(2.05, 0.2, 4.65, white, 0, 0.6, 0));
  g.add(box(2.1, 0.12, 4.7, white, 0, 2.05, 0));
  g.add(mesh(boxUV(new THREE.BoxGeometry(1.9, 0.9, 1.1), 1, 1), pink, 0, 0.95, 2.6)); // bonnet
  g.add(box(1.8, 0.7, 0.06, new THREE.MeshLambertMaterial({ color: 0xd9ecf6 }), 0, 1.5, 2.06)); // windscreen
  g.add(box(2.0, 0.2, 0.3, brass, 0, 0.5, 3.15)); // brass bumper
  g.add(box(1.2, 0.5, 0.06, dark, 0, 1.0, 3.16)); // grille
  for (const s of [-1, 1]) for (const z of [-1.5, 1.9]) { const w = cyl(0.38, 0.38, 0.3, dark, s * 1.0, 0.4, z, 14); w.rotation.z = Math.PI / 2; g.add(w); g.add(cyl(0.16, 0.16, 0.32, brass, s * 1.0, 0.4, z, 10).rotateZ(Math.PI / 2)); }
  const tex = textTexture("Mendl's", { font: 'italic bold 80px Georgia, serif', color: '#c8323c', w: 512, h: 128 });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), s * 1.01, 1.35, -0.2); n.rotation.y = s * Math.PI / 2; g.add(n); }
  // a little cake emblem on the back doors
  g.add(cyl(0.3, 0.3, 0.04, white, 0, 1.3, -2.31, 14).rotateX(Math.PI / 2));
  g.add(sphere(0.1, flat(0xd23c5a), 0, 1.3, -2.36, 8, 6));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  mergeStatic(g);
  const lights = [sphere(0.16, glow(0xfff2c0, 1.0), -0.7, 0.95, 3.16, 8, 6), sphere(0.16, glow(0xfff2c0, 1.0), 0.7, 0.95, 3.16, 8, 6)];
  g.add(...lights);
  let flashT = 0;
  const ch: Character & { flash(): void } = {
    group: g,
    flash() { flashT = 1.6; },
    update(dt, t) {
      if (flashT > 0) flashT -= dt;
      const k = flashT > 0 ? (Math.sin(t * 16) > 0 ? 2.4 : 0.7) : 1.0;
      for (const l of lights) (l.material as THREE.MeshBasicMaterial).color.setHex(0xfff2c0).multiplyScalar(k);
      g.position.y = flashT > 0 ? Math.abs(Math.sin(t * 20)) * 0.03 : damp(g.position.y, 0, 8, dt);
    },
  };
  return ch;
}

// ---------------- The roadrunner ----------------
/**
 * The Asteroid City roadrunner (a rod puppet in the film): streaky brown feathers, a crest, a long tail held up.
 * It dashes about beside the line in bursts, stops to look around, and when you whistle it does its little dance.
 */
export function makeRoadrunner() {
  const g = new THREE.Group();
  const feathers = mat('roadrunner', () => charToon({ map: roadrunnerFeathers(), rim: 0.35 }));
  const dark = flat(0x2a2420, 0.2), leg = flat(0x6a7a8a, 0.1);
  const body = new THREE.Group();
  body.add(ellipsoid(0.16, 0.14, 0.3, feathers, 0, 0, 0, 14, 10));
  const neck = ellipsoid(0.07, 0.16, 0.08, feathers, 0, 0.14, 0.2, 10, 8); neck.rotation.x = 0.5; body.add(neck);
  const head = new THREE.Group();
  head.add(sphere(0.085, feathers, 0, 0, 0, 12, 8));
  const beak = cone(0.03, 0.2, dark, 0, -0.01, 0.15, 8); beak.rotation.x = Math.PI / 2; head.add(beak);
  for (let i = 0; i < 4; i++) { const c = cone(0.02, 0.14, feathers, 0, 0.08, -0.02 - i * 0.03, 5); c.rotation.x = -0.9 - i * 0.12; head.add(c); }
  for (const s of [-1, 1]) { head.add(sphere(0.02, flat(0xf2e8d8, 0.1), s * 0.06, 0.02, 0.04, 6, 4)); head.add(sphere(0.012, dark, s * 0.07, 0.02, 0.05, 6, 4)); head.add(ellipsoid(0.01, 0.018, 0.03, flat(0x6ab4d8, 0.1), s * 0.07, 0.0, 0.0, 6, 4)); }
  head.position.set(0, 0.3, 0.32);
  body.add(head);
  const tail = new THREE.Group();
  const tailM = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.5), feathers); tailM.position.z = -0.25; tail.add(tailM);
  tail.position.set(0, 0.04, -0.26); tail.rotation.x = -0.6;
  body.add(tail);
  body.position.y = 0.42;
  g.add(body);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group();
    lg.add(cyl(0.012, 0.012, 0.38, leg, 0, -0.19, 0, 5));
    for (const a of [-0.5, 0, 0.5]) { const toe = box(0.012, 0.012, 0.08, leg, Math.sin(a) * 0.03, -0.38, Math.cos(a) * 0.04); toe.rotation.y = a; lg.add(toe); }
    lg.position.set(s * 0.06, 0.4, 0);
    g.add(lg); legs.push(lg);
  }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  g.scale.setScalar(1.6);
  let danceT = 0;
  const ch: Character & { dance(): void; running: number; dancing: () => boolean } = {
    group: g, running: 0,
    dance() { danceT = 3.5; },
    dancing: () => danceT > 0,
    update(dt, t) {
      const run = ch.running;
      if (danceT > 0) {
        danceT -= dt;
        // side to side hops, tail flicking, head bobbing
        const ph = t * 9;
        body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.08;
        body.rotation.z = Math.sin(ph) * 0.25;
        tail.rotation.x = -0.9 + Math.sin(ph * 2) * 0.3;
        head.rotation.x = Math.sin(ph * 2) * 0.2;
        legs[0].rotation.x = Math.sin(ph) * 0.5; legs[1].rotation.x = -Math.sin(ph) * 0.5;
      } else {
        // a blur of legs when it runs, then a stop and a look round
        const ph = t * 28;
        legs[0].rotation.x = Math.sin(ph) * 0.9 * run; legs[1].rotation.x = -Math.sin(ph) * 0.9 * run;
        body.rotation.x = damp(body.rotation.x, 0.35 * run, 8, dt);
        body.rotation.z = damp(body.rotation.z, 0, 8, dt);
        body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.03 * run;
        tail.rotation.x = damp(tail.rotation.x, run > 0.5 ? -0.15 : -0.7, 6, dt);
        head.rotation.y = run > 0.5 ? 0 : Math.sin(t * 1.6) * 0.6;
        head.rotation.x = run > 0.5 ? 0 : Math.max(0, Math.sin(t * 3.1)) * 0.3;
      }
    },
  };
  return ch;
}

// ---------------- The car chase ----------------
/** A plain sedan, merged. Faces +z. */
function sedan(paint: number, o: { police?: boolean } = {}) {
  const g = new THREE.Group();
  const body = flat(paint, 0.35), chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.8, roughness: 0.3 }), dark = flat(0x1a1a1e, 0.1);
  g.add(box(2.0, 0.7, 5.0, body, 0, 0.75, 0));
  g.add(box(1.8, 0.62, 2.4, body, 0, 1.4, -0.3));
  g.add(box(1.82, 0.46, 2.2, new THREE.MeshLambertMaterial({ color: 0x9ab8c8 }), 0, 1.42, -0.3));
  if (o.police) { g.add(box(2.02, 0.5, 1.8, flat(0xf6f6f2, 0.2), 0, 0.8, -0.2)); }
  for (const z of [-2.5, 2.5]) g.add(box(2.1, 0.16, 0.26, chrome, 0, 0.5, z));
  for (const s of [-1, 1]) for (const z of [-1.6, 1.6]) g.add(cyl(0.36, 0.36, 0.28, dark, s * 1.0, 0.38, z, 12).rotateZ(Math.PI / 2));
  g.add(sphere(0.12, glow(0xfff2c0, 0.9), -0.7, 0.8, 2.5, 8, 6), sphere(0.12, glow(0xfff2c0, 0.9), 0.7, 0.8, 2.5, 8, 6));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  mergeStatic(g);
  return g;
}

/**
 * Asteroid City's recurring car chase: a black sedan with two state troopers on its tail, lights flashing,
 * tearing down the desert road beside the line. `run(fromZ, toZ)` sends them along the road once.
 */
export function makeCarChase() {
  const g = new THREE.Group();
  const lead = sedan(0x1c1c22);
  const cops = [sedan(0x1c1c22, { police: true }), sedan(0x1c1c22, { police: true })];
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), blue = new THREE.MeshBasicMaterial({ color: 0x3a6aff });
  for (const c of cops) { c.add(box(0.3, 0.2, 0.3, red, -0.3, 1.82, -0.3), box(0.3, 0.2, 0.3, blue, 0.3, 1.82, -0.3)); }
  g.add(lead, ...cops);
  const st = { active: false, z: 0, to: 0, x: 0 };
  const ch: Character & { run(x: number, fromZ: number, toZ: number): void; active: () => boolean; lead: THREE.Group } = {
    group: g, lead,
    run(x, fromZ, toZ) { st.active = true; st.z = fromZ; st.to = toZ; st.x = x; g.visible = true; },
    active: () => st.active,
    update(dt, t) {
      if (!st.active) { g.visible = false; return; }
      st.z -= dt * 24;
      if (st.z < st.to) { st.active = false; g.visible = false; return; }
      const wob = (k: number) => Math.sin(t * 3.1 + k) * 0.35;
      lead.position.set(st.x + wob(0), 0, st.z);
      cops[0].position.set(st.x - 0.9 + wob(1.3), 0, st.z + 9);
      cops[1].position.set(st.x + 0.9 + wob(2.6), 0, st.z + 17);
      for (const c of [lead, ...cops]) { c.rotation.y = Math.PI + Math.cos(t * 3.1) * 0.05; c.position.y = Math.abs(Math.sin(t * 17 + c.position.z)) * 0.04; }
      const on = Math.sin(t * 14) > 0;
      red.color.setHex(on ? 0xff3030 : 0x401010); blue.color.setHex(on ? 0x10183a : 0x3a6aff);
    },
  };
  g.visible = false;
  return ch;
}

// ---------------- Sugar crabs ----------------
/**
 * The Life Aquatic's sugar crabs: ordinary crabs that happen to look like candy. A handful scuttle sideways on
 * the submarine's jetty; throw something and they rush to it.
 */
export function makeSugarCrabs(count: number, rng: Rng, spread: number) {
  const g = new THREE.Group();
  const shells: Array<[number, number]> = [[0xf2a8bc, 0xfbf7f2], [0xa8d8c8, 0xfbf7f2], [0xf6d860, 0xfbf7f2], [0xc8b0e8, 0xfbf7f2]];
  const crabs: Array<{ g: THREE.Group; home: THREE.Vector3; phase: number; dir: number }> = [];
  for (let i = 0; i < count; i++) {
    const [a, b] = shells[i % shells.length];
    const c = new THREE.Group();
    const shell = ellipsoid(0.2, 0.09, 0.15, mat(`crab${a}`, () => charToon({ map: candyShell(a, b), rim: 0.3 })), 0, 0.12, 0, 14, 10);
    c.add(shell);
    const legM = flat(a, 0.2);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) { const l = cyl(0.012, 0.012, 0.2, legM, s * 0.2, 0.06, -0.06 + k * 0.06, 4); l.rotation.z = s * 1.0; c.add(l); }
      const claw = ellipsoid(0.06, 0.035, 0.05, legM, s * 0.16, 0.12, 0.17, 8, 6); c.add(claw);
      c.add(cyl(0.008, 0.008, 0.08, legM, s * 0.05, 0.22, 0.1, 4), sphere(0.018, flat(0x1a1a1e, 0.2), s * 0.05, 0.27, 0.1, 6, 4));
    }
    c.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    mergeStatic(c);
    const home = new THREE.Vector3(rng.range(-spread, spread), 0, rng.range(-spread * 2.5, spread * 2.5));
    c.position.copy(home);
    c.rotation.y = rng.range(0, TAU);
    c.scale.setScalar(1.4);
    g.add(c);
    crabs.push({ g: c, home, phase: rng.range(0, TAU), dir: rng.sign() });
  }
  const target = new THREE.Vector3();
  let swarmT = 0;
  const ch: Character & { swarmTo(p: THREE.Vector3): void } = {
    group: g,
    swarmTo(p) { target.copy(p); g.worldToLocal(target); target.y = 0; swarmT = 5; },
    update(dt, t) {
      if (swarmT > 0) swarmT -= dt;
      for (const c of crabs) {
        // sideways scuttling back and forth, or a dash to whatever landed
        const goal = swarmT > 0 ? target : c.home;
        const off = Math.sin(t * 0.7 + c.phase) * 0.6 * c.dir;
        const gx = goal.x + (swarmT > 0 ? Math.cos(c.phase) * 0.35 : off), gz = goal.z + (swarmT > 0 ? Math.sin(c.phase) * 0.35 : 0);
        const k = swarmT > 0 ? 3 : 1.5;
        c.g.position.x = damp(c.g.position.x, gx, k, dt);
        c.g.position.z = damp(c.g.position.z, gz, k, dt);
        c.g.position.y = Math.abs(Math.sin(t * 16 + c.phase)) * 0.015;
        c.g.rotation.z = Math.sin(t * 16 + c.phase) * 0.05;
      }
    },
  };
  return ch;
}

// ---------------- Electric jellyfish ----------------
/**
 * Glowing jellyfish that drift up in the harbour as the light goes (in the film they glow at night and Zissou
 * calls it moonlight on their membranes). One instanced mesh for the bells, one for the trailing tentacles.
 */
export function makeJellyfish(count: number, rng: Rng, area: { x: number; z: number; w: number; d: number }) {
  const g = new THREE.Group();
  const bellGeo = new THREE.SphereGeometry(0.7, 16, 8, 0, TAU, 0, Math.PI * 0.55);
  const bells = new THREE.InstancedMesh(bellGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), count);
  const tentGeo = new THREE.CylinderGeometry(0.5, 0.2, 1.8, 10, 1, true); tentGeo.translate(0, -0.9, 0);
  const tents = new THREE.InstancedMesh(tentGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, wireframe: true }), count);
  const cols = [0xb8a8ff, 0x9ff0ff, 0xffb0d8, 0xc8ffb8];
  const jf = Array.from({ length: count }, (_, i) => ({ x: area.x + rng.range(-area.w, area.w), z: area.z + rng.range(-area.d, area.d), ph: rng.range(0, TAU), s: rng.range(0.7, 1.2), c: new THREE.Color(cols[i % cols.length]) }));
  g.add(bells, tents);
  bells.frustumCulled = false; tents.frustumCulled = false;
  // the bells float in the surface and are drawn after the sea
  bells.renderOrder = 2; tents.renderOrder = 0; // the tentacles hang under the water, so they are drawn before it
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  let glowT = 0;
  const ch: Character & { glow(): void; level: number } = {
    group: g, level: 0,
    glow() { glowT = 3; },
    update(dt, t) {
      if (glowT > 0) glowT -= dt;
      const bright = 1.4 * ch.level * (1 + (glowT > 0 ? 0.8 * Math.max(0, Math.sin(glowT * 6)) : 0));
      jf.forEach((j, i) => {
        const pulse = 1 + Math.sin(t * 2.2 + j.ph) * 0.12;
        p.set(j.x + Math.sin(t * 0.2 + j.ph) * 1.5, -0.05 + Math.sin(t * 0.9 + j.ph) * 0.12, j.z + Math.cos(t * 0.17 + j.ph) * 1.5);
        sc.set(j.s * pulse, j.s / pulse, j.s * pulse);
        m4.compose(p, q, sc);
        bells.setMatrixAt(i, m4); tents.setMatrixAt(i, m4);
        col.copy(j.c).multiplyScalar(bright * (0.8 + 0.2 * Math.sin(t * 3 + j.ph)));
        bells.setColorAt(i, col); tents.setColorAt(i, col);
      });
      bells.instanceMatrix.needsUpdate = true; tents.instanceMatrix.needsUpdate = true;
      bells.instanceColor!.needsUpdate = true; tents.instanceColor!.needsUpdate = true;
      g.visible = ch.level > 0.01;
    },
  };
  return ch;
}

// ---------------- Birds ----------------
/** Gulls circling a point. */
export function makeGulls(count: number, rng: Rng) {
  const g = new THREE.Group();
  const white = flat(0xffffff, 0.2), grey = mat('gullGrey', () => charToon({ color: 0xd8dde2, side: THREE.DoubleSide, rim: 0.2 }));
  const wingW = mat('gullWing', () => charToon({ color: 0xffffff, side: THREE.DoubleSide, rim: 0.2 }));
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; phase: number; radius: number; speed: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const wing = new THREE.PlaneGeometry(1.0, 0.32);
    const l = mesh(wing, i % 3 ? wingW : grey, -0.5, 0, 0), r = mesh(wing, i % 3 ? wingW : grey, 0.5, 0, 0);
    b.add(l, r, ellipsoid(0.11, 0.09, 0.28, white));
    g.add(b);
    birds.push({ g: b, l, r, phase: rng.range(0, 10), radius: rng.range(7, 22), speed: rng.range(0.25, 0.5) * rng.sign(), h: rng.range(0, 7) });
  }
  let scatterT = 0;
  const ch: Character & { scatter(): void } = {
    group: g,
    scatter() { scatterT = 3; },
    update(dt, t) {
      if (scatterT > 0) scatterT -= dt;
      const boost = scatterT > 0 ? 2.2 : 1;
      for (const b of birds) {
        const a = t * b.speed * boost + b.phase;
        b.g.position.set(Math.cos(a) * b.radius, b.h + Math.sin(t * 0.7 + b.phase) * 1.5 + (scatterT > 0 ? 3 : 0), Math.sin(a) * b.radius);
        b.g.rotation.y = -a + (b.speed > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * (scatterT > 0 ? 11 : 6) + b.phase) * 0.6;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
    },
  };
  return ch;
}

/** A V of small dark birds drifting slowly across the sky. */
export function makeBirdFlock(count: number) {
  const g = new THREE.Group();
  const dark = mat('flock', () => charToon({ color: 0x2a2a30, side: THREE.DoubleSide, rim: 0.1 }));
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; i: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const wing = new THREE.PlaneGeometry(0.7, 0.2);
    const l = mesh(wing, dark, -0.35, 0, 0), r = mesh(wing, dark, 0.35, 0, 0);
    b.add(l, r, ellipsoid(0.08, 0.06, 0.2, dark));
    const side = i % 2 ? 1 : -1, k = Math.ceil(i / 2);
    b.position.set(side * k * 1.3, k * 0.1, -k * 1.5);
    g.add(b);
    birds.push({ g: b, l, r, i });
  }
  const ch: Character = {
    group: g,
    update(dt, t) {
      g.position.z += dt * 2.4;
      g.position.y += Math.sin(t * 0.5) * dt * 0.4;
      for (const b of birds) { const flap = Math.sin(t * 7 + b.i * 0.7) * 0.7; b.l.rotation.z = flap; b.r.rotation.z = -flap; }
    },
  };
  return ch;
}
