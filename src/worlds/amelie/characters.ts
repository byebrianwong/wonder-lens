import * as THREE from 'three';
import { mesh } from '../../engine/Builders';
import { charToon, Painter } from '../../engine/Paint';
import { envelope, outline, Spring } from '../../engine/Rig';
import { clamp, damp, lerp, Rng, TAU } from '../../engine/math';
import { makeAdult, poseArm, relax, sit, walk, type Adult } from './figure';
import { buildMoped } from './moped';
import { css } from './textures';

/** Characters face +z in local space. Each has update(dt, t) and its own reactions. */
export interface Character {
  group: THREE.Group;
  /** where the character looks (usually the camera); null to look ahead */
  lookTarget: THREE.Vector3 | null;
  update(dt: number, t: number): void;
}

const INK = 0x2a1e24;
const tmpV = new THREE.Vector3();

/** A timed reaction: start() restarts it, `t` is the time since, -1 when idle. */
class Beat {
  t = -1;
  len: number;
  constructor(len: number) { this.len = len; }
  start() { this.t = 0; }
  step(dt: number) { if (this.t >= 0) { this.t += dt; if (this.t > this.len) this.t = -1; } return this.t; }
  get on() { return this.t >= 0; }
}

// ---------------- Amélie ----------------
export const AMELIE = { skin: 0xf6dcc8, hair: 0x18120f };

/** Amélie behind the café bar in her waitress's apron. wave(): a smile and a little wave; giggle(): hand to mouth. */
export function makeAmelieWaitress() {
  const a = makeAdult({ ...AMELIE, style: 'bob', fringe: 'bob', top: 0xb8282a, sleeves: 'long', bottom: { kind: 'skirt', color: 0x2a2420, length: 0.5 }, shoes: 0x1a1414, apron: 0xf4eee0, face: { mouth: 'small', blush: 0.55 }, hiRes: true, seed: 11 });
  const wave = new Beat(2.4), giggle = new Beat(1.8);
  const c: Character & { wave(): void; giggle(): void; adult: Adult } = {
    group: a.group, lookTarget: null, adult: a,
    wave() { wave.start(); a.setFace('smile'); },
    giggle() { giggle.start(); a.setFace('open'); },
    update(dt, t) {
      const w = wave.step(dt), gg = giggle.step(dt);
      relax(a, dt);
      // idle: polishing a glass on the bar
      const idle = !wave.on && !giggle.on ? 1 : 0;
      poseArm(a, 0, lerp(a.shoulder[0].rotation.x, -0.9 * idle, 0.2), 0.1, -1.2 * idle);
      poseArm(a, 1, lerp(a.shoulder[1].rotation.x, -0.7 * idle, 0.2), 0.1, -1.4 * idle);
      if (idle) a.hand[1].parent!.rotation.z = Math.sin(t * 6) * 0.25;
      if (w >= 0) {
        const k = envelope(w, 0, 0.35, 1.8, 2.4);
        poseArm(a, 1, -2.6 * k, 0.3 * k, -0.7 * k);
        a.elbow[1].rotation.z = Math.sin(w * 9) * 0.35 * k;
      }
      if (gg >= 0) {
        const k = envelope(gg, 0, 0.25, 1.3, 1.8);
        poseArm(a, 0, -1.9 * k, -0.25 * k, -2.0 * k);
        a.spine.rotation.x = Math.sin(gg * 22) * 0.04 * k + 0.08 * k;
      }
      if (!wave.on && !giggle.on) a.setFace('normal');
      a.tick(dt, t, c.lookTarget, wave.on || giggle.on ? 1 : 0.4);
    },
  };
  return c;
}

/** Amélie on the quay in her green cardigan and red dress. skip(): a sidearm throw across the water. */
export function makeAmelieSkipping() {
  const a = makeAdult({ ...AMELIE, style: 'bob', fringe: 'bob', top: 0xb8282a, coat: 0x2f5a3a, coatSkirt: false, sleeves: 'long', bottom: { kind: 'dress', color: 0xb8282a, length: 0.55 }, shoes: 0x1a1414, face: { mouth: 'small', blush: 0.55 }, glow: 0x101a14, hiRes: true, seed: 12 });
  const stone = mesh(new THREE.SphereGeometry(0.05, 8, 6), charToon({ color: 0x8a8c86, rim: 0.3 }));
  stone.scale.set(1, 0.4, 0.85);
  a.hand[1].add(stone);
  const throwB = new Beat(1.6);
  let cue = 3;
  const c: Character & { skip(): void; thrown(): boolean } = {
    group: a.group, lookTarget: null,
    skip() { if (!throwB.on) { throwB.start(); a.setFace('smile'); } },
    /** true on the frame the stone leaves her hand */
    thrown: () => throwB.t >= 0.62 && throwB.t < 0.62 + 1 / 30,
    update(dt, t) {
      // she skips one now and then on her own
      cue -= dt; if (cue <= 0) { cue = 6 + Math.sin(t) * 2; c.skip(); }
      const k = throwB.step(dt);
      relax(a, dt, 8);
      if (k >= 0) {
        // wind up low and to the side, then whip the arm across
        const wind = envelope(k, 0, 0.45, 0.5, 0.65), follow = envelope(k, 0.55, 0.7, 0.9, 1.5);
        a.spine.rotation.y = 0.7 * wind - 0.5 * follow;
        a.spine.rotation.x = 0.25 * (wind + follow);
        poseArm(a, 1, -0.3 * wind - 1.2 * follow, 1.2 * wind + 0.2 * follow, -0.6 * wind);
        a.knee[0].rotation.x = 0.3 * (wind + follow); a.hip[0].rotation.x = -0.3 * (wind + follow);
      } else a.setFace('normal');
      stone.visible = k < 0.62;
      a.tick(dt, t, c.lookTarget, 0.5);
    },
  };
  return c;
}

// ---------------- Nino ----------------
const NINO = { skin: 0xf0d0b8, hair: 0x3a2618, top: 0x5a4a2a, bottom: { kind: 'trousers' as const, color: 0x2a3448 }, shoes: 0x2a1e18 };

/** Nino bent over the coin telescope at the top of the steps. look(): he straightens up and waves the torn photo. */
export function makeNinoTelescope() {
  const a = makeAdult({ ...NINO, style: 'short', coat: 0x6a4a2a, coatSkirt: false, face: { mouth: 'small' }, seed: 21 });
  const photo = mesh(new THREE.PlaneGeometry(0.12, 0.38), new THREE.MeshLambertMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide, emissive: 0x302820 }));
  photo.position.set(0, -0.36, 0.05); photo.rotation.x = -0.4; a.hand[1].add(photo);
  const beat = new Beat(3.2);
  const c: Character & { show(): void } = {
    group: a.group, lookTarget: null,
    show() { beat.start(); a.setFace('smile'); },
    update(dt, t) {
      const k = beat.step(dt);
      const up = k >= 0 ? envelope(k, 0, 0.5, 2.6, 3.2) : 0;
      // bent to the eyepiece, hands on the barrel
      a.spine.rotation.x = lerp(0.55, 0.05, up);
      a.hip[0].rotation.x = a.hip[1].rotation.x = lerp(-0.25, 0, up);
      poseArm(a, 0, lerp(-1.1, -0.2, up), 0.2, lerp(-0.8, -0.2, up));
      poseArm(a, 1, lerp(-1.1, -2.3, up), lerp(0.2, 0.25, up), lerp(-0.8, -0.4, up));
      a.elbow[1].rotation.z = Math.sin(t * 8) * 0.3 * up;
      photo.visible = up > 0.2;
      if (k < 0) a.setFace('normal');
      a.tick(dt, t, up > 0.2 ? c.lookTarget : null, up);
    },
  };
  return c;
}

/** Nino crouched under a photo booth, fishing out torn pictures. rise(): he stands and holds one up to you. */
export function makeNinoCrouch() {
  const a = makeAdult({ ...NINO, style: 'short', face: { mouth: 'small' }, glow: 0x14100a, seed: 22 });
  const photo = mesh(new THREE.PlaneGeometry(0.12, 0.38), new THREE.MeshLambertMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide, emissive: 0x302820 }));
  photo.position.set(0, -0.34, 0.06); a.hand[1].add(photo);
  const beat = new Beat(3.4);
  const c: Character & { rise(): void } = {
    group: a.group, lookTarget: null,
    rise() { beat.start(); a.setFace('smile'); },
    update(dt, t) {
      const k = beat.step(dt);
      const up = k >= 0 ? envelope(k, 0, 0.6, 2.8, 3.4) : 0;
      const crouch = 1 - up;
      a.pelvis.position.y = lerp(0.98, 0.5, crouch);
      for (let i = 0; i < 2; i++) { a.hip[i].rotation.x = -1.6 * crouch; a.knee[i].rotation.x = 2.2 * crouch; }
      a.spine.rotation.x = 0.5 * crouch;
      // reaching under the booth, then holding the photo up
      poseArm(a, 1, lerp(-1.2 + Math.sin(t * 3) * 0.2, -2.0, up), 0.15, lerp(-0.2, -0.6, up));
      poseArm(a, 0, -0.6 * crouch, 0.3, -0.4);
      if (k < 0) a.setFace('normal');
      a.tick(dt, t, up > 0.3 ? c.lookTarget : null, up);
    },
  };
  return c;
}

// ---------------- the grocers ----------------
/** Lucien, the kind assistant, in his blue work coat by the stall. endive(): he holds one up like a prize. */
export function makeLucien() {
  const a = makeAdult({ skin: 0xc89a78, hair: 0x1a1412, style: 'curly', top: 0x3a5a8a, coat: 0x3a5a8a, bottom: { kind: 'trousers', color: 0x2a2a30 }, shoes: 0x2a1e18, face: { mouth: 'smile' }, seed: 31 });
  const endive = new THREE.Group();
  endive.add(mesh(new THREE.ConeGeometry(0.05, 0.22, 8), charToon({ color: 0xf0f0c8, rim: 0.4 }), 0, 0.05, 0));
  endive.add(mesh(new THREE.ConeGeometry(0.04, 0.08, 8), charToon({ color: 0xc8d870, rim: 0.4 }), 0, 0.19, 0));
  endive.position.set(0, -0.36, 0.04); a.hand[1].add(endive);
  const beat = new Beat(2.6), drop = new Beat(1.4);
  const c: Character & { endive(): void; fumble(): void } = {
    group: a.group, lookTarget: null,
    endive() { beat.start(); },
    fumble() { drop.start(); a.setFace('open'); },
    update(dt, t) {
      const k = beat.step(dt), d = drop.step(dt);
      relax(a, dt);
      // idle: arranging fruit, a little dance in the step
      poseArm(a, 0, -0.7 + Math.sin(t * 2.2) * 0.15, 0.1, -0.9);
      poseArm(a, 1, -0.8 + Math.cos(t * 2.0) * 0.15, 0.1, -0.7);
      a.spine.rotation.x = 0.2 + Math.sin(t * 1.1) * 0.05;
      if (k >= 0) {
        const up = envelope(k, 0, 0.4, 2.0, 2.6);
        poseArm(a, 1, -2.8 * up - 0.8 * (1 - up), 0.15, -0.3 * up);
        a.spine.rotation.x = 0.2 * (1 - up) - 0.08 * up;
      }
      if (d >= 0) { const s = envelope(d, 0, 0.1, 0.6, 1.4); a.spine.rotation.x = -0.15 * s; poseArm(a, 0, -1.4 * s, 0.6 * s, -0.4); poseArm(a, 1, -1.4 * s, 0.6 * s, -0.4); }
      else if (!beat.on) a.setFace('smile');
      endive.visible = k >= 0;
      a.tick(dt, t, c.lookTarget, k >= 0 || d >= 0 ? 1 : 0.3);
    },
  };
  return c;
}

/** Collignon, the bad-tempered grocer, behind his till. scowl(): a wagging finger; flinch(): he ducks. */
export function makeCollignon() {
  const a = makeAdult({ skin: 0xe8b8a0, hair: 0x5a4a3a, style: 'bald', top: 0xd8d0b8, coat: 0xd8d0b8, bottom: { kind: 'trousers', color: 0x3a3a3a }, shoes: 0x2a1e18, moustache: 0x3a2a20, build: 1.2, face: { mouth: 'small', blush: 0.8 }, glow: 0x14100a, seed: 32 });
  const scowl = new Beat(2.2), flinch = new Beat(1.2);
  const c: Character & { scowl(): void; flinch(): void } = {
    group: a.group, lookTarget: null,
    scowl() { scowl.start(); },
    flinch() { flinch.start(); a.setFace('open'); },
    update(dt, t) {
      const s = scowl.step(dt), f = flinch.step(dt);
      relax(a, dt);
      // counting coins on the counter
      poseArm(a, 0, -1.0, 0.1, -0.9 + Math.sin(t * 5) * 0.1);
      poseArm(a, 1, -1.0, 0.1, -0.9);
      if (s >= 0) { const k = envelope(s, 0, 0.3, 1.7, 2.2); poseArm(a, 1, -1.8 * k - 1.0 * (1 - k), -0.1, -1.2 * k); a.elbow[1].rotation.z = Math.sin(s * 14) * 0.3 * k; }
      if (f >= 0) { const k = envelope(f, 0, 0.08, 0.5, 1.2); a.spine.rotation.x = -0.3 * k; a.pelvis.position.y = 0.98 - 0.12 * k; poseArm(a, 0, -2.2 * k, 0.4 * k, -1.8 * k); poseArm(a, 1, -2.2 * k, 0.4 * k, -1.8 * k); }
      else a.setFace('normal');
      a.tick(dt, t, c.lookTarget, s >= 0 || f >= 0 ? 1 : 0.5);
    },
  };
  return c;
}

// ---------------- the café regulars ----------------
/** Georgette at the tobacco counter, the hypochondriac. swoon(): a hand to her chest and a sway. */
export function makeGeorgette() {
  const a = makeAdult({ skin: 0xf0c8b0, hair: 0xa84a2a, style: 'curly', top: 0x6a2a4a, sleeves: 'long', bottom: { kind: 'skirt', color: 0x3a2a30, length: 0.5 }, shoes: 0x2a1e18, glasses: true, face: { mouth: 'small', blush: 0.6 }, seed: 41 });
  const beat = new Beat(2.6);
  const c: Character & { swoon(): void } = {
    group: a.group, lookTarget: null,
    swoon() { beat.start(); a.setFace('open'); },
    update(dt, t) {
      const k = beat.step(dt);
      relax(a, dt);
      poseArm(a, 0, -0.9, 0.05, -1.0);
      if (k >= 0) {
        const s = envelope(k, 0, 0.3, 2.0, 2.6);
        poseArm(a, 1, -1.3 * s, -0.35 * s, -2.1 * s);
        poseArm(a, 0, -0.4 * s - 0.9 * (1 - s), 0.9 * s, -0.4);
        a.spine.rotation.z = Math.sin(k * 3) * 0.12 * s; a.spine.rotation.x = -0.15 * s;
        a.head.rotation.z = 0.2 * s;
      } else a.setFace('normal');
      a.tick(dt, t, c.lookTarget, k >= 0 ? 0.3 : 0.6);
    },
  };
  return c;
}

/** Joseph, the jealous regular, sitting with his little tape recorder. record(): he leans in and presses the button. */
export function makeJoseph() {
  const a = makeAdult({ skin: 0xe8c0a8, hair: 0x2a2018, style: 'short', top: 0x3a3a34, coat: 0x2a2a2a, bottom: { kind: 'trousers', color: 0x2a2a2a }, shoes: 0x1a1414, hat: { kind: 'flat', color: 0x2a2a2a }, face: { mouth: 'small' }, seed: 42 });
  sit(a, 0.58);
  const rec = new THREE.Group(); a.group.add(rec);
  rec.position.set(0, 0.46, 1.75);
  rec.add(mesh(new THREE.BoxGeometry(0.22, 0.06, 0.15), charToon({ color: 0x2a2a2a, rim: 0.4 })));
  const reel = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), charToon({ color: 0xc8c8c0, rim: 0.4 }), -0.05, 0.04, 0); rec.add(reel);
  const led = mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0x401010 }), 0.08, 0.035, 0.05); rec.add(led);
  const beat = new Beat(3);
  const c: Character & { record(): void } = {
    group: a.group, lookTarget: null,
    record() { beat.start(); },
    update(dt, t) {
      const k = beat.step(dt);
      const lean = k >= 0 ? envelope(k, 0, 0.4, 2.4, 3) : 0;
      a.spine.rotation.x = 0.15 + 0.35 * lean;
      poseArm(a, 0, -1.0, 0.1, -0.9);
      poseArm(a, 1, -1.0 - 0.3 * lean, 0.1, -0.9 + 0.3 * lean);
      (led.material as THREE.MeshBasicMaterial).color.setHex(k >= 0 ? 0xff2a2a : 0x401010);
      if (k >= 0) reel.rotation.y += dt * 8;
      a.tick(dt, t, k >= 0 ? null : c.lookTarget, 0.5);
    },
  };
  return c;
}

// ---------------- Dufayel, the glass man ----------------
/** A copy of Renoir's boating party in progress: a terrace, an awning, figures at a table, the river. */
function boatingParty() {
  const p = new Painter(256, 192, 701).fill('#e8dcc0');
  const g = p.g, rng = p.rng;
  p.vgrad([[0, '#c8d8b8'], [0.45, '#e0d0a8'], [1, '#a88a60']]);
  g.fillStyle = '#d8604a'; for (let x = 0; x < 256; x += 22) { g.fillRect(x, 0, 11, 26); }
  g.fillStyle = '#5a7a4a'; g.fillRect(0, 26, 256, 40);
  g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(120, 140, 90, 22, 0, 0, TAU); g.fill();
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 26 + rng.range(-6, 6), y = rng.range(80, 120);
    g.fillStyle = rng.pick(['#2a2a3a', '#f0e8e0', '#3a4a6a', '#c8a070']); g.beginPath(); g.ellipse(x, y + 28, 12, 22, 0, 0, TAU); g.fill();
    g.fillStyle = '#e8c0a0'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill();
    g.fillStyle = rng.pick(['#e8d080', '#3a2a1a', '#f0e0c0']); g.beginPath(); g.ellipse(x, y - 8, 11, 4, 0, 0, TAU); g.fill();
  }
  p.dabs({ n: 160, colors: ['#f0e0b0', '#c8b080', '#8aa070', '#e8a080'], r: [1, 4], alpha: [0.3, 0.6] });
  // the unfinished corner: the water glass girl still to paint
  g.fillStyle = '#f4ecd8'; g.fillRect(170, 90, 60, 90);
  g.strokeStyle = '#8a7a6a'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(200, 120, 10, 12, 0, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(190, 132); g.lineTo(186, 176); g.moveTo(210, 132); g.lineTo(214, 176); g.stroke();
  return p.texture({ wrap: false });
}

/** Dufayel at his easel; the canvas faces him. turn(): he lowers the brush and turns to look out of the window. */
export function makeDufayel() {
  const g = new THREE.Group();
  const a = makeAdult({ skin: 0xf0d8c8, hair: 0xe8e4dc, style: 'bald', top: 0x6a6a5a, coat: 0x5a5a4a, bottom: { kind: 'trousers', color: 0x3a3a34 }, shoes: 0x2a2018, glasses: true, face: { mouth: 'small' }, glow: 0x1a120a, seed: 51 });
  // a scarf, and he sits on a stool
  sit(a, 0.6);
  g.add(a.group);
  const scarf = mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), charToon({ color: 0x8a3a2a, rim: 0.3 }), 0, 0.02, 0); scarf.rotation.x = Math.PI / 2; a.neck.add(scarf);
  const stool = new THREE.Group(); g.add(stool);
  stool.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), charToon({ color: 0x5a3a24, rim: 0.3 }), 0, 0.6, 0));
  for (let k = 0; k < 3; k++) { const l = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5), charToon({ color: 0x5a3a24, rim: 0.3 }), Math.cos(k * 2.1) * 0.15, 0.3, Math.sin(k * 2.1) * 0.15); stool.add(l); }
  // the easel in front of him with the painting
  // the easel stands in front of him, its canvas turned a little to his left (towards the window)
  const easel = new THREE.Group(); easel.position.set(0.1, 0, 1.1); easel.rotation.y = 0.7; g.add(easel);
  const wood = charToon({ color: 0x8a6a40, rim: 0.3 });
  for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.04, 1.9, 0.04), wood, s * 0.35, 0.95, 0); leg.rotation.z = -s * 0.12; easel.add(leg); }
  const back = mesh(new THREE.BoxGeometry(0.04, 1.8, 0.04), wood, 0, 0.9, 0.35); back.rotation.x = 0.3; easel.add(back);
  easel.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.08), wood, 0, 0.9, 0.04));
  const canvas = mesh(new THREE.PlaneGeometry(0.95, 0.72), new THREE.MeshLambertMaterial({ map: boatingParty(), emissive: 0x302820 }), 0, 1.3, -0.03);
  canvas.rotation.y = Math.PI; canvas.rotation.x = 0.08; easel.add(canvas);
  const brush = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.28, 5), charToon({ color: 0xc8302a, rim: 0.3 }), 0, -0.4, 0.06);
  brush.rotation.x = 1.2; a.hand[1].add(brush);
  const beat = new Beat(3.4);
  const c: Character & { turn(): void } = {
    group: g, lookTarget: null,
    turn() { beat.start(); },
    update(dt, t) {
      const k = beat.step(dt);
      const turn = k >= 0 ? envelope(k, 0, 0.8, 2.6, 3.4) : 0;
      // dabbing at the canvas, small careful strokes
      poseArm(a, 1, lerp(-1.4 + Math.sin(t * 2.6) * 0.08, -0.4, turn), 0.15, lerp(-0.6 + Math.sin(t * 5) * 0.08, -0.8, turn));
      poseArm(a, 0, -0.9, 0.2, -1.4);
      a.spine.rotation.x = lerp(0.12, 0.0, turn);
      a.spine.rotation.y = -0.6 * turn;
      a.tick(dt, t, turn > 0.2 ? c.lookTarget : null, turn);
    },
  };
  return c;
}

// ---------------- the blind man and the girl who shows him the street ----------------
/** The blind man walking with Amélie on his arm, his white cane tapping. laugh(): he stops, laughs and lifts the cane. */
export function makeBlindPair() {
  const g = new THREE.Group();
  const man = makeAdult({ skin: 0xe8c8b0, hair: 0xd8d4cc, style: 'short', top: 0xb8a888, coat: 0xa89878, bottom: { kind: 'trousers', color: 0x5a5448 }, shoes: 0x2a1e18, hat: { kind: 'flat', color: 0x4a4438 }, glasses: true, face: { mouth: 'small' }, seed: 61 });
  const girl = makeAdult({ ...AMELIE, style: 'bob', fringe: 'bob', top: 0xb8282a, coat: 0x2f5a3a, coatSkirt: false, bottom: { kind: 'dress', color: 0xb8282a, length: 0.5 }, shoes: 0x1a1414, face: { mouth: 'smile', blush: 0.55 }, seed: 62 });
  // dark glasses: fill the lenses
  man.head.children.filter((m) => (m as THREE.Mesh).geometry?.type === 'TorusGeometry').forEach((r) => { const lens = mesh(new THREE.CircleGeometry(0.036, 14), new THREE.MeshBasicMaterial({ color: 0x0a0a0a })); lens.position.copy(r.position); lens.position.z += 0.003; man.head.add(lens); });
  man.group.position.x = -0.32; girl.group.position.x = 0.32;
  g.add(man.group, girl.group);
  const cane = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 5), charToon({ color: 0xf4f0e8, rim: 0.4 }), 0, -0.5, 0.05);
  man.hand[0].add(cane);
  const beat = new Beat(2.4);
  const c: Character & { laugh(): void; walking: boolean } = {
    group: g, lookTarget: null, walking: true,
    laugh() { beat.start(); man.setFace('open'); },
    update(dt, t) {
      const k = beat.step(dt);
      const stride = c.walking && k < 0 ? 1 : 0;
      relax(man, dt); relax(girl, dt);
      walk(man, t, 1.6, stride); walk(girl, t + 0.2, 1.7, stride);
      // she holds his arm and talks, describing everything with her free hand
      poseArm(girl, 0, -0.5, -0.3, -1.2);
      poseArm(girl, 1, -0.9 + Math.sin(t * 3) * 0.4, 0.4 + Math.sin(t * 2.3) * 0.3, -0.8);
      poseArm(man, 1, -0.4, 0.4, -0.8);
      poseArm(man, 0, -0.3 + Math.sin(t * 3.2) * 0.15 * stride, 0.1, -0.2);
      if (k >= 0) { const s = envelope(k, 0, 0.3, 1.8, 2.4); poseArm(man, 0, -2.5 * s - 0.3 * (1 - s), 0.2, -0.3 * s); man.spine.rotation.x = -0.15 * s; man.head.rotation.x = -0.3 * s; }
      else man.setFace('smile');
      girl.tick(dt, t, c.lookTarget, 0.3);
      man.tick(dt, t, null);
      // she glances up at him as she talks
      girl.head.rotation.y = -0.5 + Math.sin(t * 0.8) * 0.2;
    },
  };
  return c;
}

// ---------------- the photo-booth stranger ----------------
/** The bald man in the beige raincoat who turns up in every photo booth. stare(): he turns and gives you his famous blank look. */
export function makeStranger() {
  const a = makeAdult({ skin: 0xe8c4a8, hair: 0x7a6a5a, style: 'bald', top: 0xd8c8a0, coat: 0xc8b088, bottom: { kind: 'trousers', color: 0x4a4a44 }, shoes: 0x2a1e18, face: { mouth: 'small' }, build: 1.1, glow: 0x14100a, seed: 71 });
  const toolbox = mesh(new THREE.BoxGeometry(0.36, 0.2, 0.16), charToon({ color: 0x8a1a1a, rim: 0.4 }), 0, -0.4, 0.02);
  a.hand[0].add(toolbox);
  const beat = new Beat(3);
  const c: Character & { stare(): void } = {
    group: a.group, lookTarget: null,
    stare() { beat.start(); },
    update(dt, t) {
      const k = beat.step(dt);
      relax(a, dt);
      poseArm(a, 0, 0, 0.05, -0.1);
      poseArm(a, 1, -0.3, 0.1, -0.5);
      a.tick(dt, t, k >= 0 ? c.lookTarget : null, k >= 0 ? 1 : 0);
    },
  };
  return c;
}

// ---------------- the busker and the lovers ----------------
/** An accordion player in a beret. play(): he squeezes out a big flourish, swaying. */
export function makeBusker() {
  const a = makeAdult({ skin: 0xe8c0a0, hair: 0x5a5a5a, style: 'short', top: 0xe8e0d0, coat: 0x3a2a24, bottom: { kind: 'trousers', color: 0x2a2a2a }, shoes: 0x1a1414, hat: { kind: 'beret', color: 0x1a1a1e }, moustache: 0x5a5a5a, face: { mouth: 'small' }, glow: 0x10140e, seed: 81 });
  const acc = new THREE.Group(); acc.position.set(0, 0.25, 0.22); a.spine.add(acc);
  const red = charToon({ color: 0xb8282a, rim: 0.5 }), ivory = charToon({ color: 0xf4efe0, rim: 0.4 });
  const left = mesh(new THREE.BoxGeometry(0.1, 0.32, 0.2), red, -0.17, 0, 0), right = mesh(new THREE.BoxGeometry(0.1, 0.32, 0.2), ivory, 0.17, 0, 0);
  const bellows = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.18), charToon({ color: 0x2a2a2a, rim: 0.3 }));
  acc.add(left, right, bellows);
  outline(left, INK, 1.3, 0.014); outline(right, INK, 1.3, 0.014);
  const beat = new Beat(3);
  const c: Character & { play(): void } = {
    group: a.group, lookTarget: null,
    play() { beat.start(); a.setFace('smile'); },
    update(dt, t) {
      const k = beat.step(dt);
      const big = k >= 0 ? envelope(k, 0, 0.3, 2.4, 3) : 0;
      const sq = Math.sin(t * (2.2 + big * 2)) * (0.5 + big * 0.5);
      bellows.scale.x = 1 + sq * 0.6;
      left.position.x = -0.17 - sq * 0.07; right.position.x = 0.17 + sq * 0.07;
      poseArm(a, 0, -0.9, 0.5 + sq * 0.15, -1.2);
      poseArm(a, 1, -0.9, 0.5 + sq * 0.15, -1.2);
      a.spine.rotation.z = Math.sin(t * 1.1) * (0.05 + big * 0.12);
      if (k < 0) a.setFace('normal');
      a.tick(dt, t, c.lookTarget, 0.5);
    },
  };
  return c;
}

/** Two lovers on a bench by the water. kiss(): they turn to each other. */
export function makeLovers() {
  const g = new THREE.Group();
  const him = makeAdult({ skin: 0xe8c0a0, hair: 0x2a1a14, style: 'short', top: 0x3a4a6a, coat: 0x2a2a34, bottom: { kind: 'trousers', color: 0x2a2a30 }, shoes: 0x1a1414, seed: 91, glow: 0x0c1410 });
  const her = makeAdult({ skin: 0xf0d0c0, hair: 0x8a4a2a, style: 'bob', fringe: 'parted', top: 0xe8d8a0, coat: 0x8a2a2a, coatSkirt: false, bottom: { kind: 'skirt', color: 0x2a2a30 }, shoes: 0x1a1414, seed: 92, glow: 0x0c1410 });
  sit(him, 0.46); sit(her, 0.46);
  him.group.position.x = -0.32; her.group.position.x = 0.32;
  g.add(him.group, her.group);
  const beat = new Beat(3.2);
  const c: Character & { kiss(): void } = {
    group: g, lookTarget: null,
    kiss() { beat.start(); },
    update(dt, t) {
      const k = beat.step(dt);
      const lean = k >= 0 ? envelope(k, 0, 0.6, 2.4, 3.2) : 0.15 + Math.sin(t * 0.5) * 0.05;
      him.spine.rotation.z = -0.2 * lean; her.spine.rotation.z = 0.25 * lean;
      him.head.rotation.y = 0.6 * lean; her.head.rotation.y = -0.6 * lean;
      poseArm(him, 1, -0.6, 1.1 * lean + 0.2, -0.5);
      poseArm(her, 0, -0.8, 0.3, -1.4);
      him.tick(dt, t, null); her.tick(dt, t, null);
      him.head.rotation.y = 0.6 * lean; her.head.rotation.y = -0.6 * lean;
    },
  };
  return c;
}

// ---------------- the travelling gnome ----------------
/** The garden gnome from Amélie's father's garden: red hat, white beard, blue coat. tipHat(): he lifts it. */
export function makeGnome() {
  const g = new THREE.Group();
  const red = charToon({ color: 0xc8282a, rim: 0.5, emissive: new THREE.Color(0x200404) }), blue = charToon({ color: 0x2a4a8a, rim: 0.4 }), white = charToon({ color: 0xf4f0e8, rim: 0.4 }), skin = charToon({ color: 0xf0c8a8, rim: 0.4 }), brown = charToon({ color: 0x5a3a24, rim: 0.3 });
  const body = mesh(new THREE.SphereGeometry(0.2, 16, 12), blue, 0, 0.26, 0); body.scale.set(1, 1.15, 0.9); g.add(body);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 14), brown, 0, 0.17, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), brown, s * 0.09, 0.05, 0.04));
  const head = mesh(new THREE.SphereGeometry(0.14, 16, 12), skin, 0, 0.55, 0.02); g.add(head);
  g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), charToon({ color: 0xe89a88, rim: 0.4 }), 0, 0.53, 0.16));
  const beard = mesh(new THREE.ConeGeometry(0.13, 0.26, 12), white, 0, 0.42, 0.08); beard.rotation.x = Math.PI; g.add(beard);
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.02, 6, 5), charToon({ color: 0x1a1210, rim: 0 }), s * 0.05, 0.58, 0.13));
  const hat = new THREE.Group(); hat.position.set(0, 0.64, 0); g.add(hat);
  const cone = mesh(new THREE.ConeGeometry(0.15, 0.36, 14), red, 0, 0.17, 0); cone.rotation.x = -0.15; hat.add(cone);
  // his little suitcase
  const case_ = mesh(new THREE.BoxGeometry(0.18, 0.13, 0.07), charToon({ color: 0x8a5a2a, rim: 0.4 }), 0.22, 0.08, 0.05); g.add(case_);
  for (const m of [body, head, cone, beard]) outline(m, INK, 1.3, 0.01);
  const beat = new Beat(1.6);
  const c: Character & { tipHat(): void } = {
    group: g, lookTarget: null,
    tipHat() { beat.start(); },
    update(dt, t) {
      const k = beat.step(dt);
      const lift = k >= 0 ? envelope(k, 0, 0.25, 1.0, 1.6) : 0;
      hat.position.y = 0.64 + lift * 0.18;
      hat.rotation.z = lift * 0.4;
      g.rotation.z = Math.sin(t * 0.7) * 0.01;
    },
  };
  return c;
}

// ---------------- pigeons ----------------
/** A flock of pigeons pecking. scatter(): they take off in a flurry, circle and settle again. */
export function makePigeons(count: number, rng: Rng, area = 2.4) {
  const g = new THREE.Group();
  const grey = charToon({ color: 0x8a909a, rim: 0.4 }), dark = charToon({ color: 0x4a5058, rim: 0.3 }), neck = charToon({ color: 0x6a8a7a, rim: 0.6 }), beakM = charToon({ color: 0x3a3030, rim: 0 });
  const birds: { g: THREE.Group; head: THREE.Object3D; wl: THREE.Object3D; wr: THREE.Object3D; home: THREE.Vector3; phase: number; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.12, 10, 8), grey, 0, 0.14, 0); body.scale.set(0.85, 0.8, 1.3); b.add(body);
    const head = new THREE.Group(); head.position.set(0, 0.24, 0.11); b.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), dark));
    head.add(mesh(new THREE.ConeGeometry(0.015, 0.05, 5), beakM, 0, -0.01, 0.07).rotateX(Math.PI / 2));
    b.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), neck, 0, 0.2, 0.08));
    const tail = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.14), dark, 0, 0.13, -0.17); tail.rotation.x = 0.3; b.add(tail);
    const wl = new THREE.Group(), wr = new THREE.Group(); wl.position.set(-0.08, 0.18, 0); wr.position.set(0.08, 0.18, 0); b.add(wl, wr);
    wl.add(mesh(new THREE.BoxGeometry(0.22, 0.015, 0.16), dark, -0.11, 0, 0)); wr.add(mesh(new THREE.BoxGeometry(0.22, 0.015, 0.16), dark, 0.11, 0, 0));
    outline(body, INK, 1.2, 0.01);
    b.traverse((o) => { o.castShadow = false; });
    const home = new THREE.Vector3(rng.range(-area, area), 0, rng.range(-area, area));
    b.position.copy(home); b.rotation.y = rng.range(0, TAU);
    g.add(b);
    birds.push({ g: b, head, wl, wr, home, phase: rng.range(0, TAU), v: new THREE.Vector3() });
  }
  let flight = -1;
  const c: Character & { scatter(): void } = {
    group: g, lookTarget: null,
    scatter() { flight = 0; for (const b of birds) b.v.set((Math.random() - 0.5) * 6, 4 + Math.random() * 3, (Math.random() - 0.5) * 6); },
    update(dt, t) {
      if (flight >= 0) flight += dt;
      for (const b of birds) {
        if (flight >= 0 && flight < 5) {
          // fly up and round in a loose circle, then glide back down
          const back = clamp((flight - 3) / 2, 0, 1);
          b.v.y -= (back > 0 ? 6 : 1.5) * dt;
          b.g.position.addScaledVector(b.v, dt);
          b.g.position.lerp(b.home, back * 0.08);
          b.g.position.y = Math.max(0, b.g.position.y);
          const f = Math.sin(t * 28 + b.phase) * 0.9;
          b.wl.rotation.z = f; b.wr.rotation.z = -f;
          b.g.rotation.y = Math.atan2(b.v.x, b.v.z);
        } else {
          b.g.position.lerp(b.home, 1 - Math.exp(-dt * 2));
          b.g.position.y = damp(b.g.position.y, 0, 6, dt);
          b.wl.rotation.z = damp(b.wl.rotation.z, 0, 10, dt); b.wr.rotation.z = damp(b.wr.rotation.z, 0, 10, dt);
          // peck, peck
          const peck = Math.max(0, Math.sin(t * 5 + b.phase)) ** 8;
          b.head.rotation.x = peck * 0.9;
          b.head.position.z = 0.11 + peck * 0.05;
        }
      }
      if (flight > 5) flight = -1;
    },
  };
  return c;
}

// ---------------- Blubber ----------------
/** Blubber the goldfish, giant and orange, who leaps out of the canal when a stone lands near him. */
export function makeBlubber() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const p = new Painter(256, 128, 801).fill('#f07a20');
  p.vgrad([[0, '#f8a040'], [0.6, '#f06a18'], [1, '#f8d0a0']]);
  p.dabs({ n: 120, colors: ['#ffb060', '#e05a10'], r: [3, 9], alpha: [0.2, 0.45] });
  const skin = charToon({ map: p.texture(), rim: 0.7, emissive: new THREE.Color(0x401808) });
  const fin = charToon({ color: 0xf8a050, rim: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85, emissive: new THREE.Color(0x401808) });
  const b = mesh(new THREE.SphereGeometry(1, 20, 14), skin); b.scale.set(0.55, 0.62, 1.0); body.add(b);
  const tail = new THREE.Group(); tail.position.z = -0.95; body.add(tail);
  const tm = mesh(new THREE.PlaneGeometry(1.2, 1.1), fin, 0, 0, -0.45); tm.rotation.y = Math.PI / 2; tail.add(tm);
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.PlaneGeometry(0.5, 0.3), fin, s * 0.5, -0.2, 0.2); f.rotation.set(0, s * 0.8, s * 0.6); body.add(f);
    body.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), charToon({ color: 0xf8f4e8, rim: 0.2 }), s * 0.36, 0.18, 0.62));
    body.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), charToon({ color: 0x0a0a0a, rim: 0.4 }), s * 0.42, 0.18, 0.68));
  }
  const dorsal = mesh(new THREE.PlaneGeometry(0.7, 0.4), fin, 0, 0.6, -0.1); dorsal.rotation.y = Math.PI / 2; body.add(dorsal);
  outline(b, INK, 1.3, 0.02);
  const tailSpring = new Spring(0, 2, 0.4);
  let leapT = -1;
  const hopEvery = 5.5;
  const c: Character & { leap(): void; up(): boolean } = {
    group: g, lookTarget: null,
    leap() { if (leapT < 0) leapT = 0; },
    up: () => body.position.y > -0.2,
    update(dt, t) {
      // a little hop every few seconds on his own; a big leap when a stone lands near
      const hopK = ((t % hopEvery) / hopEvery);
      let y = -1.2, rx = 0;
      if (leapT >= 0) {
        leapT += dt;
        const k = clamp(leapT / 1.6, 0, 1);
        y = -1.2 + Math.sin(k * Math.PI) * 4.4; rx = lerp(-1.0, 1.0, k);
        if (leapT > 1.6) leapT = -1;
      } else if (hopK > 0.78) {
        const k = (hopK - 0.78) / 0.22;
        y = -1.2 + Math.sin(k * Math.PI) * 1.8; rx = lerp(-0.8, 0.8, k);
      }
      body.position.y = y;
      body.rotation.x = rx;
      tail.rotation.y = tailSpring.update(Math.sin(t * 9) * 0.5, dt);
      body.visible = y > -1.0;
    },
  };
  return c;
}

// ---------------- Amélie and Nino on the moped ----------------
/** Nino riding his red moped with Amélie behind, her arms round him. lean(): she turns to the camera and leans her head on his back. */
export function makeRiders() {
  const g = new THREE.Group();
  // everything sways inside an inner group, so the world can set the outer group's whole orientation
  const sway = new THREE.Group(); g.add(sway);
  const bike = buildMoped({ light: false });
  sway.add(bike.group);
  const nino = makeAdult({ ...NINO, style: 'short', coat: 0x6a4a2a, coatSkirt: false, seed: 101 });
  const ame = makeAdult({ ...AMELIE, style: 'bob', fringe: 'bob', top: 0xb8282a, coat: 0x2f5a3a, coatSkirt: false, bottom: { kind: 'dress', color: 0xb8282a, length: 0.42 }, shoes: 0x1a1414, face: { mouth: 'smile', blush: 0.6 }, seed: 102 });
  sit(nino, 0.95); sit(ame, 0.95);
  nino.group.position.set(0, 0, -0.1); ame.group.position.set(0, 0.04, -0.62);
  sway.add(nino.group, ame.group);
  for (const a of [nino, ame]) { for (let i = 0; i < 2; i++) { a.hip[i].rotation.x = -1.35; a.hip[i].rotation.z = (i ? 1 : -1) * 0.25; a.knee[i].rotation.x = 1.3; } }
  const beat = new Beat(3.4);
  const c: Character & { lean(): void; bike: typeof bike } = {
    group: g, lookTarget: null, bike,
    lean() { beat.start(); },
    update(dt, t) {
      const k = beat.step(dt);
      const lean = k >= 0 ? envelope(k, 0, 0.5, 2.8, 3.4) : 0;
      // Nino holds the bars; Amélie hugs him, her bob blowing about
      poseArm(nino, 0, -1.2, 0.25, -0.5); poseArm(nino, 1, -1.2, 0.25, -0.5);
      nino.spine.rotation.x = 0.2;
      poseArm(ame, 0, -1.3 + 0.3 * lean, 0.55 - 0.4 * lean, -0.9);
      poseArm(ame, 1, -1.3 - 1.3 * lean, 0.55 + 0.2 * lean, -0.9 + 0.6 * lean);
      ame.elbow[1].rotation.z = Math.sin(t * 8) * 0.3 * lean;
      ame.spine.rotation.x = 0.3 - 0.2 * lean; ame.spine.rotation.y = 0.5 * lean;
      ame.head.rotation.z = Math.sin(t * 7) * 0.03 + 0.25 * (1 - lean);
      nino.tick(dt, t, null); ame.tick(dt, t, lean > 0.2 ? c.lookTarget : null, lean);
      bike.frontWheel.rotation.x += dt * 22; bike.rearWheel.rotation.x += dt * 22;
      bike.bars.rotation.y = Math.sin(t * 1.4) * 0.05;
      sway.rotation.z = Math.sin(t * 0.9) * 0.04;
    },
  };
  return c;
}

void css; void tmpV;
