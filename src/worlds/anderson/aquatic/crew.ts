import * as THREE from 'three';
import { Painter, charToon } from '../../../engine/Paint';
import { envelope, outline } from '../../../engine/Rig';
import { TAU, damp } from '../../../engine/math';
import { HEAD_R, beanie, makeAdult, relax, sit, wear, type Adult, type AdultOpts } from '../people';
import { FUTURA } from '../film';
import { css } from '../textures';

/*
 * Team Zissou: powder-blue uniforms with the team patch on the chest and red knit beanies. The figures are the
 * world's grown-ups (people.ts); this file dresses them, gives Steve his white beard and binoculars, Vikram his
 * film camera and Pele his guitar, and gives them their gestures: pointing together, raising the binoculars,
 * a salute, strumming a song.
 */

export const ZISSOU_BLUE = 0x9ccbe8;
const INK = 0x2a1e24;

let shirtMat: THREE.Material | null = null;
/**
 * The uniform's shirt, for the figure's torso (a lathe: its front is half-way across the texture, the wearer's left
 * is three quarters across): powder blue with darker piping, a placket down the front and the patch on the left
 * of the chest.
 */
function zissouShirt() {
  if (shirtMat) return shirtMat;
  const W = 512, H = 256;
  const p = new Painter(W, H, 1701).fill(css(ZISSOU_BLUE));
  const g = p.g;
  p.lines({ n: 60, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], wobble: 0.5 });
  p.lines({ n: 60, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], vertical: true, wobble: 0.5 });
  // side seams with cornflower piping
  for (const u of [0.25, 0.75]) { g.fillStyle = '#5a86c8'; g.fillRect(u * W - 3, 0, 6, H); }
  // placket and buttons down the front
  g.fillStyle = css(ZISSOU_BLUE, 0.9); g.fillRect(W * 0.5 - 6, 0, 12, H);
  for (let y = 30; y < H - 20; y += 34) { g.fillStyle = '#f4f0e8'; g.beginPath(); g.arc(W * 0.5, y, 4, 0, TAU); g.fill(); }
  // collar band at the top
  g.fillStyle = css(ZISSOU_BLUE, 0.82); g.fillRect(0, 0, W, 14);
  // the patch: a yellow Z on white over TEAM ZISSOU, on the wearer's left chest
  const px = W * 0.6, py = H * 0.4;
  g.fillStyle = '#fbf6ea'; g.fillRect(px - 20, py - 20, 40, 44);
  g.strokeStyle = '#5a86c8'; g.lineWidth = 2; g.strokeRect(px - 20, py - 20, 40, 44);
  g.fillStyle = '#e8b81e'; g.font = `bold 34px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', px, py - 2);
  g.fillStyle = '#2f4a6e'; g.font = `bold 7px ${FUTURA}`; g.fillText('TEAM ZISSOU', px, py + 18);
  // soft folds under the arms
  for (const u of [0.02, 0.48, 0.52, 0.98]) { const gr = g.createLinearGradient(u * W - 20, 0, u * W + 20, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * W - 20, 0, 40, H); }
  shirtMat = charToon({ map: p.texture(), rim: 0.35, shade: 0x9aa0cc });
  return shirtMat;
}

export interface CrewOpts {
  skin: number;
  hair: number;
  style?: AdultOpts['style'];
  scale?: number;
  build?: number;
  moustache?: number;
  glasses?: boolean;
  /** a full beard (Steve's is white) */
  beard?: number;
  /** false: no uniform (Eleanor, Jane) */
  uniform?: boolean;
  top?: number;
  bottom?: AdultOpts['bottom'];
  hat?: boolean;
  seed: number;
  hiRes?: boolean;
}

export interface CrewMember {
  f: Adult;
  group: THREE.Group;
}

/** One member of the crew, standing, facing +z, feet at the origin. */
export function makeCrew(o: CrewOpts): CrewMember {
  const uniform = o.uniform !== false;
  const f = makeAdult({
    skin: o.skin, hair: o.hair, style: o.style ?? 'short', top: o.top ?? ZISSOU_BLUE, sleeves: 'long',
    bottom: o.bottom ?? { kind: 'trousers', color: ZISSOU_BLUE }, shoes: uniform ? 0xf6f2ea : 0x5a3a2a,
    moustache: o.moustache, glasses: o.glasses, scale: o.scale, build: o.build, seed: uniform ? 4100 : o.seed, hiRes: o.hiRes,
    face: { mouth: 'small' },
  });
  // the uniform's shirt on the torso (the sleeves keep the plain blue cloth)
  if (uniform) {
    const torso = f.spine.children[0] as THREE.Mesh;
    torso.material = zissouShirt();
  }
  if (o.hat !== false && uniform) wear(f, beanie(HEAD_R.adult));
  // turn before raising, so an arm can point anywhere
  for (const sh of f.shoulder) sh.rotation.order = 'YXZ';
  if (o.beard !== undefined) {
    const m = charToon({ color: o.beard, rim: 0.35 });
    const beard = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R.adult * 1.04, 18, 8, Math.PI / 2 - 1.35, 2.7, Math.PI * 0.6, Math.PI * 0.36), m);
    beard.scale.set(1, 1.08, 1.02);
    f.head.add(beard);
    outline(beard, INK, 1.3, 0.014);
  }
  return { f, group: f.group };
}

// ---------------------------------------------------------------- the people of the scene
export const STEVE: CrewOpts = { skin: 0xeec4a4, hair: 0xe0dcd4, beard: 0xe6e2da, moustache: 0xd8d4cc, scale: 1.04, build: 1.08, seed: 4201, hiRes: true };
export const ROW: Array<CrewOpts & { name: string }> = [
  { name: 'Klaus', skin: 0xf0c8a8, hair: 0x4a3a2a, scale: 0.94, seed: 4211 },
  { name: 'Ned', skin: 0xf2d0b4, hair: 0xe6c070, moustache: 0xc89a50, seed: 4213 },
  { name: 'Vikram', skin: 0x9a6a48, hair: 0x1a1414, seed: 4215 },
  { name: 'Wolodarsky', skin: 0xeec8ac, hair: 0x6a4a2a, glasses: true, seed: 4217 },
  { name: 'Ogata', skin: 0xe8c49e, hair: 0x1a1414, scale: 0.97, seed: 4219 },
];
export const PELE: CrewOpts = { skin: 0x6e4430, hair: 0x1a1414, seed: 4221 };
export const ELEANOR: CrewOpts = { skin: 0xf2d4bc, hair: 0xd6d4d0, style: 'bob', uniform: false, top: 0x9fb4c8, bottom: { kind: 'skirt', color: 0x34465a, length: 0.6 }, seed: 4223 };
export const JANE: CrewOpts = { skin: 0xf6dcc8, hair: 0xb8603a, style: 'bob', uniform: false, top: 0xf2e6cc, bottom: { kind: 'dress', color: 0xf2e6cc, length: 0.62 }, seed: 4225 };

/** Steve's binoculars: two black barrels on a bridge. */
function binoculars() {
  const g = new THREE.Group();
  const black = charToon({ color: 0x2a2a30, rim: 0.5 });
  const brass = charToon({ color: 0xc8a050, rim: 0.4 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 10), black);
    b.rotation.x = Math.PI / 2; b.position.x = s * 0.045;
    g.add(b);
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 5, 12), brass);
    r.position.set(s * 0.045, 0, 0.08);
    g.add(r);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), black));
  return g;
}

/**
 * Steve Zissou: white beard, red beanie, binoculars on a strap round his neck. `look(dt, t, target)` keeps him alive;
 * `binoculars()` raises them to his eyes for a few seconds, `salute()` gives a brisk salute.
 */
export function makeSteve(o: Partial<CrewOpts> = {}) {
  const c = makeCrew({ ...STEVE, ...o });
  const f = c.f;
  const bino = binoculars();
  f.spine.add(bino);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 20, Math.PI), charToon({ color: 0x3a2a20, rim: 0.2 }));
  strap.rotation.set(Math.PI * 0.62, 0, Math.PI);
  strap.position.set(0, 0.48, 0.05);
  f.spine.add(strap);
  let binT = 99, salT = 99;
  return {
    group: c.group, figure: f,
    raiseBinoculars() { binT = 0; },
    salute() { salT = 0; },
    update(dt: number, t: number, target: THREE.Vector3 | null) {
      binT += dt; salT += dt;
      const up = envelope(binT, 0, 0.6, 3.6, 4.4);
      const sal = envelope(salT, 0, 0.25, 1.4, 2.0);
      relax(f, dt, 6);
      // binoculars from the chest to the eyes, both hands bringing them up
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        f.shoulder[i].rotation.x = -0.35 * (1 - up) - 1.95 * up;
        f.shoulder[i].rotation.z = s * (0.12 + 0.28 * up) * -1 + s * 0.1;
        f.elbow[i].rotation.x = -0.9 * (1 - up) - 1.75 * up;
      }
      // a salute (right hand to the brow) on top
      if (sal > 0) { f.shoulder[0].rotation.x += -1.0 * sal; f.shoulder[0].rotation.z = -0.9 * sal; f.elbow[0].rotation.x += -1.2 * sal; }
      bino.position.set(0, 0.36 + 0.36 * up, 0.2 + 0.05 * up);
      bino.rotation.x = 0.9 * (1 - up);
      f.tick(dt, t, up > 0.5 ? null : target, 1 - up);
      f.head.rotation.x += -0.08 * up;
    },
  };
}

/** A box film camera with two reels on top, for Vikram's shoulder. */
function filmCamera() {
  const g = new THREE.Group();
  const body = charToon({ color: 0x3a3a40, rim: 0.4 });
  const metal = charToon({ color: 0x9a9aa0, rim: 0.5 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.3), body));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 10), metal);
  lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0.21);
  g.add(lens);
  for (const z of [-0.08, 0.08]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), body);
    reel.rotation.z = Math.PI / 2; reel.position.set(0, 0.17, z);
    g.add(reel);
  }
  return g;
}

/**
 * Team Zissou in a row: Klaus, Ned, Vikram (with his camera), Wolodarsky and Ogata, side by side and facing +z.
 * `point(target)` has them all point at something together.
 */
export function makeTeamRow(spacing = 1.0) {
  const g = new THREE.Group();
  const crew = ROW.map((o, i) => {
    const c = makeCrew(o);
    c.group.position.x = (i - (ROW.length - 1) / 2) * spacing;
    g.add(c.group);
    return c.f;
  });
  // Vikram's camera on his right shoulder
  const vik = crew[2];
  const cam = filmCamera();
  cam.position.set(-0.2, 0.62, 0.02);
  vik.spine.add(cam);
  let pointT = 99;
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  return {
    group: g, crew,
    point(at: THREE.Vector3) { pointT = 0; target.copy(at); },
    update(dt: number, t: number, look: THREE.Vector3 | null) {
      pointT += dt;
      // each one a beat after the last, so the arms go up in a ripple down the row
      crew.forEach((f, i) => {
        const k = envelope(pointT - i * 0.12, 0, 0.35, 3.0, 3.6);
        relax(f, dt, 6);
        // Vikram keeps his right hand up on the camera
        if (i === 2) { f.shoulder[0].rotation.set(-0.5, 0, -1.25); f.elbow[0].rotation.set(-2.2, 0, 0); }
        if (k > 0.001) {
          const side = i === 2 ? 1 : 0;
          // aim the arm: turn the shoulder towards the target in the figure's own space
          f.group.updateWorldMatrix(true, false);
          tmp.copy(target); f.group.worldToLocal(tmp);
          const yaw = Math.atan2(tmp.x - f.shoulder[side].position.x, tmp.z);
          const pitch = Math.atan2(tmp.y - 1.45, Math.hypot(tmp.x, tmp.z));
          f.shoulder[side].rotation.set((-Math.PI / 2 - pitch) * k, yaw * k, (side === 0 ? -0.1 : 0.1) * (1 - k));
          f.elbow[side].rotation.set(-0.1 * k, 0, 0);
        }
        f.tick(dt, t + i * 1.7, k > 0.3 ? target : look, 1);
      });
    },
  };
}

/** A guitar: a body of two lobes, a sound hole, a long neck and a headstock. Its neck runs along +x (the player's left). */
function guitar() {
  const g = new THREE.Group();
  const wood = charToon({ color: 0xd89a52, rim: 0.4 });
  const dark = charToon({ color: 0x4a2a14, rim: 0.3 });
  for (const [x, r] of [[-0.1, 0.19], [0.12, 0.15]] as Array<[number, number]>) {
    const lobe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 22), wood);
    lobe.rotation.x = Math.PI / 2; lobe.position.x = x;
    g.add(lobe);
  }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), new THREE.MeshBasicMaterial({ color: 0x1a0e06 }));
  hole.position.set(0.04, 0, 0.047);
  g.add(hole);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.03), dark);
  neck.position.set(0.5, 0, 0.02);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), dark);
  head.position.set(0.8, 0, 0.02);
  g.add(head);
  return g;
}

/** A crate to sit on. */
function crate() {
  const m = charToon({ color: 0xb88a58, rim: 0.2 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.45), m));
  const slat = charToon({ color: 0x8a6038, rim: 0.2 });
  for (const y of [-0.12, 0.12]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.05, 0.47), slat); s.position.y = y; g.add(s); }
  g.position.y = 0.21;
  return g;
}

/**
 * Pele dos Santos, the Belafonte's safety expert, sitting on a crate with his acoustic guitar. `play()` starts a
 * song: he strums, nods to the beat and sings, and little notes float up.
 */
export function makePeleFigure() {
  const g = new THREE.Group();
  const c = makeCrew(PELE);
  const f = c.f;
  sit(f, 0.46);
  g.add(crate(), c.group);
  const gt = guitar();
  gt.position.set(0.04, 0.12, 0.2);
  gt.rotation.set(0, 0, 0.32);
  f.spine.add(gt);
  // notes that float up while he plays
  const noteTex = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d')!; x.fillStyle = '#ffffff'; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♪', 32, 34); return cv; })());
  noteTex.colorSpace = THREE.SRGBColorSpace;
  const notes: Array<{ s: THREE.Sprite; t0: number }> = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, color: [0xffe08a, 0xff9ab8, 0x9ef0d2, 0xa9c8ff, 0xffb48a][i], transparent: true, depthWrite: false }));
    s.scale.setScalar(0.28); s.visible = false;
    g.add(s);
    notes.push({ s, t0: i * 0.7 });
  }
  let playT = 99;
  return {
    group: g, figure: f,
    play() { playT = 0; },
    get playing() { return playT < 6; },
    update(dt: number, t: number, look: THREE.Vector3 | null) {
      playT += dt;
      const k = envelope(playT, 0, 0.3, 5.4, 6);
      // the guitar hand strums, the other holds the neck; he nods to the beat
      f.shoulder[1].rotation.set(-1.0, 0, 0.45); f.elbow[1].rotation.set(-1.0, 0, 0);
      f.shoulder[0].rotation.set(-0.75, 0, -0.25); f.elbow[0].rotation.set(-1.15 + Math.sin(t * 13) * 0.22 * k + Math.sin(t * 0.9) * 0.03, 0, 0);
      f.spine.rotation.z = damp(f.spine.rotation.z, Math.sin(t * 2.6) * 0.05 * k, 6, dt);
      f.setFace(k > 0.2 && Math.sin(t * 5.2) > -0.2 ? 'open' : 'smile');
      f.tick(dt, t, look, 1 - k * 0.6);
      f.head.rotation.x += Math.sin(t * 5.2) * 0.07 * k;
      notes.forEach((n) => {
        const a = ((playT - n.t0) % 3.5 + 3.5) % 3.5;
        n.s.visible = k > 0.05 && playT > n.t0;
        n.s.position.set(-0.1 + Math.sin(a * 2 + n.t0) * 0.25, 1.3 + a * 0.45, 0.25);
        (n.s.material as THREE.SpriteMaterial).opacity = k * Math.min(1, a * 2) * Math.max(0, 1 - a / 3.5);
      });
    },
  };
}
