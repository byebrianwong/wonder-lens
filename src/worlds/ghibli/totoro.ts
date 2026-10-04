import * as THREE from 'three';
import { charToon } from '../../engine/Paint';
import { sculpt, profileShape, limbGeometry, Rig, band, Spring, envelope, easeOutBack, easeInOut, LookAt, outline } from '../../engine/Rig';
import { clamp, lerp, noise2, Rng, smoothstep, TAU } from '../../engine/math';
import { sphereFur, css, umbrellaCloth, burlap, leafTexture, grinTexture } from './characterTextures';
import { type Character, surfaceAt, polarAtHeight, alignTo, dirArr, blinkAmount, surfaceMouth } from './character';

export interface TotoroOpts {
  color?: number; belly?: number; scale?: number; chevrons?: boolean; leaf?: boolean; umbrella?: boolean; bag?: boolean;
  /** colour of the umbrella's cloth (default near black) */
  umbrellaColor?: number;
}

export interface Totoro extends Character {
  /** the big roar: winds up, throws its head back with the mouth wide open, arms up, then settles (2.6 s) */
  roar(): void;
  /** crouch, leap and land with a thump; `onLand` runs at the moment it lands */
  jump(onLand?: () => void): void;
  /** a small happy hop, for dancing */
  hop(): void;
  /** 0 standing still .. 1 walking; the feet step in time with `stride` */
  walk: number;
  /** distance moved this frame in world units (sets the stepping pace) */
  stride: number;
  /** a world point to turn the head (and eyes) towards, or null to look ahead */
  lookTarget: THREE.Vector3 | null;
  /** seconds of the roar left (0 when not roaring) */
  readonly roarTime: number;
  /** the umbrella in his +x paw, or null (a scene may scale it down to put it away) */
  readonly umbrella: THREE.Group | null;
  /**
   * Optional pose for moments the stock animations do not cover (flying on a spinning top, playing an
   * ocarina). Arm angles replace the computed ones (index 0 is the -x arm); `mouth` (0..1) keeps the mouth
   * at least that open; `lean` tips the chest forward (+) or back (-). Null for the normal animation.
   * Optional extras: `stretch` makes the body taller (+, up on tiptoe) or squats it (-) as a fraction of
   * its height; `rise` lifts the whole body off the ground by that many (unscaled) units; `head` tips the
   * head forward (+) or back to look up (-), in radians.
   */
  pose: { out?: [number, number]; up?: [number, number]; mouth?: number; lean?: number; stretch?: number; rise?: number; head?: number } | null;
}

const ROAR = 2.6, JUMP = 1.45, HOP = 0.5;

// Totoro's outline from the top of the head to the ground: [height, radius]. Egg shaped, no neck.
const BODY: Array<[number, number]> = [
  [4.95, 0], [4.87, 0.5], [4.66, 1.0], [4.22, 1.38], [3.6, 1.6], [2.85, 1.82], [2.0, 1.97], [1.2, 1.9], [0.55, 1.5], [0.14, 0.85], [0.0, 0.0],
];

/** Fur with the cream belly and chevrons painted on, for the sculpted body (sphere UVs). */
function totoroSkin(o: { fur: number; belly: number | null; chevrons: boolean; seed: number; w: number; bellyTop: number; bellyBottom: number; chevronRows: Array<{ polar: number; around: number[] }> }) {
  const W = o.w, H = W / 2;
  const p = sphereFur(o.fur, o.seed, { w: W, contrast: 1 });
  if (o.belly !== null) {
    const cream = sphereFur(o.belly, o.seed + 1, { w: W, contrast: 0.55 });
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mg = mask.getContext('2d')!;
    const img = mg.createImageData(W, H);
    const P = (o.bellyTop + o.bellyBottom) / 2, B = (o.bellyBottom - o.bellyTop) / 2, A = 0.95;
    const y0 = Math.floor((o.bellyTop - 0.1) / Math.PI * H), y1 = Math.ceil((o.bellyBottom + 0.1) / Math.PI * H);
    const x0 = Math.floor((0.25 - 0.2) * W), x1 = Math.ceil((0.25 + 0.2) * W);
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      const polar = ((y + 0.5) / H) * Math.PI;
      for (let x = x0; x < x1; x++) {
        const around = ((x + 0.5) / W - 0.25) * TAU;
        // a rounded shield: wider towards the bottom, with a ragged furry edge
        const widen = lerp(0.82, 1.08, clamp((polar - o.bellyTop) / (2 * B), 0, 1));
        let e = (around / (A * widen)) ** 2 + ((polar - P) / B) ** 2;
        e += (noise2(x * 0.09, y * 0.09) - 0.5) * 0.16 + (noise2(x * 0.5, y * 0.25) - 0.5) * 0.08;
        const a = 1 - smoothstep(0.9, 1.0, e);
        img.data[(y * W + x) * 4 + 3] = Math.round(a * 255);
      }
    }
    mg.putImageData(img, 0, 0);
    cream.g.globalCompositeOperation = 'destination-in';
    cream.g.drawImage(mask, 0, 0);
    p.g.drawImage(cream.canvas, 0, 0);
    if (o.chevrons) {
      const k = W / 1024;
      for (const row of o.chevronRows) for (const around of row.around) {
        p.at(dirArr(around, row.polar), (g) => {
          g.rotate(around * 0.35);
          g.scale(0.85 * k, 0.95 * k);
          // a thick arrowhead pointing up with curved legs, brushed at the edges
          g.fillStyle = css(o.fur, 0.78);
          g.beginPath();
          g.moveTo(0, -15); g.quadraticCurveTo(12, -4, 23, 11); g.lineTo(13, 12); g.quadraticCurveTo(6, 3, 0, -1);
          g.quadraticCurveTo(-6, 3, -13, 12); g.lineTo(-23, 11); g.quadraticCurveTo(-12, -4, 0, -15);
          g.fill();
        });
      }
      // cream hairs brushed back over the marks so they sit in the fur
      const c0 = Math.min(...o.chevronRows.map((r) => r.polar)) / Math.PI, c1 = Math.max(...o.chevronRows.map((r) => r.polar)) / Math.PI;
      p.fur({ n: Math.round(700 * k), colors: [css(o.belly, 1.02), css(o.belly, 0.94)], len: [9 * k, 18 * k], width: [2.5 * k, 5 * k], alpha: [0.15, 0.35], y: [c0 - 0.04, c1 + 0.04], x: [0.13, 0.37] });
    }
  }
  return p.texture();
}

/** A round eye: dark rim, white, pupil and a catchlight, with an eyelid that closes over it. Faces +z. */
function makeEye(r: number, furColor: number, pupilK = 0.42) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 24, 16), charToon({ color: 0x22232a, rim: 0 }));
  rim.scale.z = 0.32;
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), charToon({ color: 0xf7f4ec, rim: 0.1, shade: 0xc8cce0 }));
  white.scale.z = 0.5; white.position.z = r * 0.04;
  const pupilG = new THREE.Group();
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * pupilK, 18, 12), charToon({ color: 0x141418, rim: 0 }));
  pupil.scale.z = 0.35; pupil.position.z = r * 0.5;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  shine.position.set(-r * 0.14, r * 0.16, r * 0.58);
  pupilG.add(pupil, shine);
  // the lid is a cap of fur that swings down over the front of the eye
  const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.16, 24, 10, 0, TAU, 0, Math.PI / 2), charToon({ color: furColor, rim: 0.2 }));
  lid.scale.z = 0.62;
  g.add(rim, white, pupilG, lid);
  const OPEN = -1.5, SHUT = 1.45;
  lid.rotation.x = OPEN;
  return {
    group: g,
    set(closed: number, lookX: number, lookY: number) {
      lid.rotation.x = lerp(OPEN, SHUT, closed);
      lid.visible = closed > 0.02;
      pupilG.position.set(lookX * r * 0.3, lookY * r * 0.25, 0);
    },
  };
}

/** A small umbrella: ribbed, scalloped canopy on a crook-handled shaft. Origin at the hand grip. */
export function makeUmbrella(radius: number, color: number) {
  const g = new THREE.Group();
  const ribs = 8, segA = 64, segR = 10, h = radius * 0.42;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * TAU;
      const between = Math.sin(a * ribs / 2) ** 2; // 0 on a rib, 1 between ribs
      const r = radius * t * (1 - 0.07 * between * t);
      const y = h * (1 - Math.pow(t, 1.7)) - 0.06 * radius * between * t * t;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uv.push(i / segA, 1 - t);
      if (i < segA && j < segR) { const k = j * (segA + 1) + i; idx.push(k, k + segA + 1, k + 1, k + 1, k + segA + 1, k + segA + 2); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const canopy = new THREE.Mesh(geo, charToon({ map: umbrellaCloth(color), side: THREE.DoubleSide, rim: 0.25 }));
  const metal = charToon({ color: 0x2a2622, rim: 0.2 });
  const shaftLen = radius * 1.25;
  canopy.position.y = shaftLen;
  g.add(canopy);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.022, radius * 0.022, shaftLen + h, 8), metal);
  shaft.position.y = (shaftLen + h) / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.03, radius * 0.22, 8), metal);
  tip.position.y = shaftLen + h + radius * 0.1;
  g.add(tip);
  // a crook handle below the grip
  const crook = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.09, radius * 0.025, 6, 16, Math.PI), charToon({ color: 0x5a3a24, rim: 0.2 }));
  crook.position.set(radius * 0.09, -radius * 0.05, 0);
  crook.rotation.z = Math.PI;
  g.add(crook);
  return { group: g, canopy };
}

export function makeTotoro(o: TotoroOpts = {}): Totoro {
  const scale = o.scale ?? 1;
  const g = new THREE.Group();
  const furColor = o.color ?? 0x8b9098;
  const big = scale > 0.8;
  const seed = Math.round(furColor / 97);
  const rng = new Rng(7 + Math.round(scale * 100));

  // ----- body shape -----
  const shape = profileShape(BODY, {
    depth: 0.86,
    // the belly pushes forward; the face is broad and flat
    front: (d) => { const pol = Math.acos(d.y) / Math.PI; return 0.84 + 0.14 * Math.exp(-(((pol - 0.66) / 0.16) ** 2)); },
  });
  const pY = (y: number) => polarAtHeight(shape, y);

  const bellyTop = pY(3.1), bellyBottom = pY(0.5);
  const skin = totoroSkin({
    fur: furColor, belly: o.belly === -1 ? null : (o.belly ?? 0xeae5d6), chevrons: o.chevrons !== false, seed, w: big ? 2048 : 1024,
    bellyTop, bellyBottom,
    chevronRows: [{ polar: pY(2.9), around: [-0.34, 0, 0.34] }, { polar: pY(2.5), around: [-0.52, -0.175, 0.175, 0.52] }],
  });
  const furMat = charToon({ map: skin, rim: 0.45 });
  const limbFur = charToon({ map: sphereFur(furColor, seed + 3, { w: 512 }).texture(), rim: 0.45 });
  const clawMat = charToon({ color: 0xf2efe6, rim: 0.2, shade: 0xb8bccf });
  const ink = 0x24252e;

  // ----- skeleton -----
  const rig = new Rig(g, [
    { name: 'root', at: [0, 0, 0] },
    { name: 'hips', parent: 'root', at: [0, 1.1, 0] },
    { name: 'chest', parent: 'hips', at: [0, 2.4, 0] },
    { name: 'head', parent: 'chest', at: [0, 3.35, 0.05] },
  ]);
  const B = rig.bones;
  const weights = (p: THREE.Vector3) => {
    const head = band(p.y, 2.8, 3.65);
    const hips = 1 - band(p.y, 1.25, 2.35);
    return { hips, chest: Math.max(0, 1 - hips - head), head };
  };
  const body = rig.skin(sculpt(shape, big ? 72 : 48, big ? 48 : 32), furMat, weights);
  outline(body, ink, 1.5, 0.04);

  // helper: put an object on the head joint at a rest-space position
  const onBone = (bone: string, obj: THREE.Object3D, at: THREE.Vector3) => {
    obj.position.copy(at).sub(new THREE.Vector3().setFromMatrixPosition(B[bone].matrixWorld));
    B[bone].add(obj);
    return obj;
  };

  // ----- face -----
  const eyes: ReturnType<typeof makeEye>[] = [];
  for (const s of [-1, 1]) {
    const sp = surfaceAt(shape, s * 0.42, pY(4.12));
    const e = makeEye(0.25, furColor, 0.4);
    alignTo(e.group, sp.n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.35));
    onBone('head', e.group, sp.p.clone().addScaledVector(sp.n, -0.07));
    eyes.push(e);
  }
  {
    const sp = surfaceAt(shape, 0, pY(3.86));
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), charToon({ color: 0x23242b, rim: 0.15 }));
    nose.scale.set(0.2, 0.11, 0.1);
    alignTo(nose, sp.n);
    onBone('head', nose, sp.p.clone().addScaledVector(sp.n, 0.02));
  }
  // whiskers: three thin curved strands on each cheek
  const whiskerMat = charToon({ color: 0x2a2b32, rim: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const sp = surfaceAt(shape, s * 0.62, pY(3.72 - i * 0.1));
    const a = sp.p.clone().addScaledVector(sp.n, -0.02);
    const dirOut = new THREE.Vector3(s, 0.16 - i * 0.16, 0.25).normalize();
    const b = a.clone().addScaledVector(dirOut, 0.5).add(new THREE.Vector3(0, 0.03, 0));
    const c = a.clone().addScaledVector(dirOut, 0.95).add(new THREE.Vector3(0, -0.06 + (1 - i) * 0.04, 0));
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), b.clone().sub(a), c.clone().sub(a));
    const w = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.011, 4), whiskerMat);
    onBone('head', w, a);
  }
  // the mouth: a patch lying on the face that opens from a line into a huge grin full of teeth
  const mouth = surfaceMouth({ shape, rig, weights, top: pY(3.62), drop: pY(2.7) - pY(3.62), halfWidth: 0.8, tex: grinTexture() });
  let mouthOpen = -1;

  // ears: tall leaf shapes on top of the head
  const earGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, -0.2), new THREE.Vector2(0.21, -0.08), new THREE.Vector2(0.27, 0.2), new THREE.Vector2(0.25, 0.5),
    new THREE.Vector2(0.15, 0.85), new THREE.Vector2(0.05, 1.04), new THREE.Vector2(0.001, 1.1),
  ], 16);
  earGeo.scale(1, 1, 0.62);
  const ears: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const ear = new THREE.Mesh(earGeo, limbFur);
    pivot.add(ear);
    pivot.rotation.set(-0.08, 0, -s * 0.16);
    onBone('head', pivot, new THREE.Vector3(s * 0.58, 4.68, -0.05));
    outline(ear, ink, 1.4, 0.035);
    ears.push(pivot);
  }

  // ----- arms (pivot at the shoulder, hanging down) -----
  const armGeo = limbGeometry(0.43, 0.33, 1.3);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    const arm = new THREE.Mesh(armGeo, limbFur);
    shoulder.add(arm);
    // three claws at the end of the paw
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 8), clawMat);
      claw.position.set(i * 0.13, -1.58, 0.16);
      claw.rotation.x = Math.PI - 0.5;
      shoulder.add(claw);
    }
    onBone('chest', shoulder, new THREE.Vector3(s * 1.5, 3.05, 0.15));
    outline(arm, ink, 1.4, 0.035);
    arms.push(shoulder);
  }
  // ----- feet -----
  const feet: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const foot = new THREE.Group();
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), limbFur);
    f.scale.set(0.6, 0.3, 0.82);
    f.position.set(0, 0.2, 0.2);
    foot.add(f);
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), clawMat);
      claw.position.set(i * 0.22, 0.13, 0.98);
      claw.rotation.x = Math.PI / 2;
      foot.add(claw);
    }
    onBone('root', foot, new THREE.Vector3(s * 0.78, 0.05, 0.3));
    outline(f, ink, 1.4, 0.035);
    feet.push(foot);
  }

  // ----- props -----
  if (o.leaf) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), charToon({ map: leafTexture(0x5c9a45), side: THREE.DoubleSide, alphaTest: 0.5, rim: 0.1 }));
    leaf.rotation.set(-Math.PI / 2 + 0.3, 0.3, 0);
    onBone('head', leaf, new THREE.Vector3(0.1, 4.98, 0.0));
  }
  if (o.bag) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), charToon({ map: burlap(0xe2d4b4, 9), rim: 0.3 }));
    bag.scale.set(0.75, 0.9, 0.5);
    onBone('chest', bag, new THREE.Vector3(0, 2.5, -1.6));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.4, 10), bag.material);
    onBone('chest', neck, new THREE.Vector3(0, 3.45, -1.55));
    outline(bag, ink, 1.4, 0.035);
  }
  let umbrella: THREE.Group | null = null;
  const UMB_ARM = 1; // the +x arm holds the umbrella
  if (o.umbrella) {
    const u = makeUmbrella(1.45, o.umbrellaColor ?? 0x2e2830);
    umbrella = u.group;
    // held in the paw: placed in the arm's own space, then turned so the shaft stands up over the head
    const arm = arms[UMB_ARM];
    umbrella.position.set(0, -1.45, 0.05);
    arm.add(umbrella);
    outline(u.canopy, ink, 1.2, 0.03);
  }

  // finish the joints' world matrices once so everything parented above is in its rest place
  g.scale.setScalar(scale);

  // ----- animation -----
  const S = (f: number, d: number) => new Spring(0, f, d);
  const sp = {
    sy: new Spring(1, 5, 0.45), sxz: new Spring(1, 5, 0.45), y: S(7, 0.7),
    hipsZ: S(2, 0.7), hipsX: S(3, 0.6), chestX: S(3.5, 0.55), headX: S(3.5, 0.5), headZ: S(3, 0.6),
    armOut: [S(3, 0.55), S(3, 0.55)], armUp: [S(3, 0.55), S(3, 0.55)],
    earBack: S(5, 0.35), mouth: S(5, 0.6),
  };
  const look = new LookAt(0.75, 0.25);
  let roarT = -1, jumpT = -1, hopT = -1, landCb: (() => void) | null = null, landed = false;
  let blinkSince = 10, nextBlink = 2 + rng.next() * 3, earKickT = 3 + rng.next() * 4;
  let gait = 0;
  const umbUp = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();

  const ch: Totoro = {
    group: g,
    walk: 0, stride: 0, lookTarget: null, pose: null, umbrella,
    get roarTime() { return roarT >= 0 ? ROAR - roarT : 0; },
    roar() { roarT = 0; },
    jump(onLand) { jumpT = 0; landCb = onLand ?? null; landed = false; },
    hop() { if (hopT < 0 || hopT > HOP * 0.7) hopT = 0; },
    update(dt, t) {
      // ---- targets for this frame ----
      const breathe = Math.sin(t * 1.3) * 0.014;
      let sy = 1 + breathe * 0.5, sxz = 1 - breathe * 0.2, y = 0;
      let hipsZ = Math.sin(t * 0.45) * 0.025, hipsX = 0, chestX = Math.sin(t * 0.7) * 0.015, headX = Math.sin(t * 0.6 + 1) * 0.03, headZ = -hipsZ * 0.7 + Math.sin(t * 0.37) * 0.025;
      const out = [0.32, 0.32], up = [-0.12, -0.12];
      if (umbrella) { up[UMB_ARM] = -2.45; out[UMB_ARM] = 0.22; }
      let earBack = 0, mouthT = 0;

      // walking: feet step in turn, the body rolls from side to side
      if (ch.walk > 0.01) {
        gait += (ch.stride / Math.max(0.2, scale * 1.15)) * Math.PI;
        const w = ch.walk;
        hipsZ += Math.sin(gait) * 0.09 * w;
        y += Math.abs(Math.sin(gait)) * 0.12 * w;
        headZ -= Math.sin(gait) * 0.05 * w;
        for (let i = 0; i < 2; i++) up[i] += Math.sin(gait + i * Math.PI) * 0.35 * w;
      }
      feet.forEach((f, i) => {
        const ph = gait + i * Math.PI;
        const lift = Math.max(0, Math.sin(ph)) * 0.28 * ch.walk;
        f.position.y = rig.restPos('root').y + 0.05 + lift;
        f.position.z = 0.3 + Math.cos(ph) * 0.3 * ch.walk;
        f.rotation.x = -lift * 0.8;
      });

      // the roar: crouch and draw breath, then throw the head back, mouth wide, arms up; tremble; settle
      if (roarT >= 0) {
        roarT += dt;
        const r = roarT;
        const wind = envelope(r, 0, 0.4, 0.42, 0.7);
        const blast = envelope(r, 0.42, 0.66, 1.95, 2.5);
        const shake = blast * (Math.sin(r * 31) * 0.5 + Math.sin(r * 23) * 0.5);
        sy += -0.08 * wind + 0.09 * blast; sxz += 0.05 * wind - 0.025 * blast;
        chestX += 0.14 * wind - 0.12 * blast; headX += 0.18 * wind - 0.28 * blast + shake * 0.025;
        headZ += shake * 0.02;
        for (let i = 0; i < 2; i++) {
          out[i] += -0.08 * wind + 1.0 * blast;
          up[i] += 0.25 * wind - 0.75 * blast;
        }
        if (umbrella) { up[UMB_ARM] -= 0.45 * blast; out[UMB_ARM] -= 0.6 * blast; }
        earBack = -0.15 * wind + 0.38 * blast;
        mouthT = easeOutBack(clamp((r - 0.44) / 0.28, 0, 1), 1.2) * (1 - easeInOut((r - 1.95) / 0.45)) * (0.96 + 0.04 * Math.sin(r * 40));
        if (r > ROAR) roarT = -1;
      }
      // the jump: squat, spring up stretched, tuck in the air, land squashed with a thump
      if (jumpT >= 0) {
        jumpT += dt;
        const j = jumpT;
        const crouch = envelope(j, 0, 0.26, 0.28, 0.38);
        const airK = clamp((j - 0.3) / 0.62, 0, 1);
        const air = j > 0.3 && j < 0.92 ? 4 * airK * (1 - airK) : 0;
        const land = envelope(j, 0.9, 0.97, 1.0, 1.4);
        y += air * 2.4;
        sy += -0.18 * crouch + 0.12 * envelope(j, 0.28, 0.36, 0.5, 0.75) - 0.2 * land;
        sxz += 0.1 * crouch - 0.05 * envelope(j, 0.28, 0.36, 0.5, 0.75) + 0.12 * land;
        headX += 0.1 * crouch - 0.12 * air + 0.12 * land;
        for (let i = 0; i < 2; i++) { out[i] += 0.9 * air - 0.1 * crouch; up[i] += -0.6 * air + 0.3 * crouch; }
        earBack += 0.4 * air - 0.3 * land;
        if (!landed && j >= 0.92) { landed = true; landCb?.(); }
        if (j > JUMP) jumpT = -1;
      }
      if (hopT >= 0) {
        hopT += dt;
        const k = clamp(hopT / HOP, 0, 1);
        y += Math.sin(k * Math.PI) * 0.55;
        sy += Math.sin(k * Math.PI) * 0.06 - envelope(hopT, HOP * 0.85, HOP * 0.95, HOP, HOP * 1.4) * 0.08;
        for (let i = 0; i < 2; i++) { out[i] += Math.sin(k * Math.PI) * 0.6; }
        if (hopT > HOP * 1.4) hopT = -1;
      }

      if (ch.pose) {
        const p = ch.pose;
        if (p.out) { out[0] = p.out[0]; out[1] = p.out[1]; }
        if (p.up) { up[0] = p.up[0]; up[1] = p.up[1]; }
        if (p.mouth !== undefined) mouthT = Math.max(mouthT, p.mouth);
        if (p.lean) chestX += p.lean;
        if (p.stretch) { sy += p.stretch; sxz -= p.stretch * 0.45; }
        if (p.rise) y += p.rise;
        if (p.head) headX += p.head;
      }

      // ---- springs ----
      const bSy = sp.sy.update(sy, dt), bSxz = sp.sxz.update(sxz, dt);
      B.root.scale.set(bSxz, bSy, bSxz);
      B.root.position.y = sp.y.update(y, dt);
      B.hips.rotation.set(sp.hipsX.update(hipsX, dt), 0, sp.hipsZ.update(hipsZ, dt));
      B.chest.rotation.x = sp.chestX.update(chestX, dt);
      const [ly, lp] = look.update(B.head, roarT >= 0 ? null : ch.lookTarget, dt, roarT >= 0 ? 0 : 1);
      B.head.rotation.set(sp.headX.update(headX, dt) + lp, ly, sp.headZ.update(headZ, dt));
      arms.forEach((a, i) => {
        const s = i === 0 ? -1 : 1;
        a.rotation.set(sp.armUp[i].update(up[i], dt), 0, s * sp.armOut[i].update(out[i], dt));
      });
      if (umbrella) {
        // keep the shaft near upright whatever the arm is doing, leaning in over the head
        umbrella.parent!.updateWorldMatrix(true, false);
        g.getWorldQuaternion(umbUp);
        umbUp.multiply(tmpQ.setFromEuler(new THREE.Euler(0.12 + Math.sin(t * 0.8) * 0.04, 0, 0.3)));
        umbrella.parent!.getWorldQuaternion(tmpQ).invert();
        umbrella.quaternion.copy(tmpQ.multiply(umbUp));
      }
      // ears flick now and then, and fold back in a roar
      earKickT -= dt;
      if (earKickT <= 0) { earKickT = 2.5 + rng.next() * 5; sp.earBack.v -= 4; }
      const eb = sp.earBack.update(earBack, dt);
      ears.forEach((e, i) => { const s = i === 0 ? -1 : 1; e.rotation.set(-0.08 - eb, 0, -s * (0.16 + eb * 0.3)); });
      // mouth
      const m = sp.mouth.update(mouthT, dt);
      const mo = clamp(m, 0, 1.15);
      mouth.mesh.visible = mo > 0.02;
      if (mouth.mesh.visible && Math.abs(mo - mouthOpen) > 0.004) { mouth.set(mo); mouthOpen = mo; }
      // blink every few seconds; eyes follow what the head is looking at
      blinkSince += dt;
      nextBlink -= dt;
      if (nextBlink <= 0) { nextBlink = 2.5 + rng.next() * 3.5; blinkSince = 0; }
      const closed = blinkAmount(blinkSince, 0.18);
      eyes.forEach((e) => e.set(closed, clamp(ly * 1.6, -0.8, 0.8), clamp(-lp * 2, -0.6, 0.6)));
    },
  };
  return ch;
}
