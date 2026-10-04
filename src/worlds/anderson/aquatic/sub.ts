import * as THREE from 'three';
import { canvasTexture, mergeStatic } from '../../../engine/Builders';
import { Painter, charToon } from '../../../engine/Paint';
import { TAU, clamp, smoothstep } from '../../../engine/math';
import type { MountDef } from '../common';
import { FUTURA } from '../film';
import { css } from '../textures';
import { Z } from './plan';

/*
 * The Deep Search: Team Zissou's bright yellow submarine, its old name painted out on the flanks. The rider sits
 * in the glass bubble on top of its nose, so the nose (with the Team Zissou emblem, two floodlights and the
 * sampling claw) runs out ahead at the bottom of the view, the dive planes stick out at the sides, and the
 * conning tower with its periscope, pennant and beacon stands just behind. Inside the bubble: a little brass
 * panel with a depth gauge and a sonar screen.
 *
 * Origin: on the path. Local +z is forward. The hull's axis is 0.35 above the origin.
 */

const AXIS = 0.35;
const EYE = new THREE.Vector3(0, 1.95, 0.3);
const DOME = { y: 1.55, z: 0.25, r: 0.98 };
/** the hull's radius along its length (z), stern to nose */
const PROFILE: Array<[number, number]> = [
  [-4.7, 0.001], [-4.6, 0.3], [-4.3, 0.6], [-3.8, 0.88], [-3.1, 1.06], [-2.2, 1.17], [-1.0, 1.22], [0.4, 1.22],
  [1.6, 1.18], [2.4, 1.08], [3.0, 0.9], [3.4, 0.62], [3.62, 0.3], [3.7, 0.001],
];
const YELLOW = 0xf6c51c, RED = 0xd8323a, BRASS = 0xd8b25a, STEEL = 0x4a5058;

/** The hull's paint: yellow with seams and rivets, a red stripe, the name in black over the painted-out old one. */
function hullPaint() {
  const W = 512, H = 512;
  const p = new Painter(W, H, 901).fill(css(YELLOW));
  const g = p.g;
  p.dabs({ n: 70, colors: [css(YELLOW, 1.05), css(YELLOW, 0.93)], r: [10, 40], alpha: [0.12, 0.25], squash: 0.6 });
  // around the hull is across the canvas (u: 0 bottom, 0.25 right flank, 0.5 top, 0.75 left flank); along is up
  // the canvas (top = nose). Seams round the hull, with rivets.
  for (let v = 0.08; v < 0.95; v += 0.105) {
    const y = H * (1 - v);
    g.fillStyle = css(YELLOW, 0.72); g.fillRect(0, y, W, 2.5);
    g.fillStyle = css(YELLOW, 1.15); g.fillRect(0, y + 2.5, W, 1.2);
    for (let x = 4; x < W; x += 11) { g.fillStyle = css(YELLOW, 0.7); g.beginPath(); g.arc(x, y + 7, 1.8, 0, TAU); g.fill(); g.fillStyle = css(YELLOW, 1.2); g.beginPath(); g.arc(x - 0.5, y + 6.5, 0.8, 0, TAU); g.fill(); }
  }
  // the seam along the keel and two stripes down the flanks
  g.fillStyle = css(YELLOW, 0.75); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
  for (const u of [0.32, 0.68]) { g.fillStyle = css(RED); g.fillRect(u * W - 7, 0, 14, H); g.fillStyle = '#fbf6ea'; g.fillRect(u * W + (u < 0.5 ? -11 : 7), 0, 4, H); }
  // the name on both flanks, reading along the hull with the letters' tops towards the top of the hull
  for (const [u, rot] of [[0.255, Math.PI / 2], [0.745, -Math.PI / 2]] as Array<[number, number]>) {
    g.save(); g.translate(u * W, H * 0.6); g.rotate(rot);
    // the old name, painted over in a fresher yellow that does not quite match
    g.font = `bold 22px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(90,70,30,0.4)'; g.fillText('J A C Q U E L I N E', 0, 18);
    g.fillStyle = css(YELLOW, 1.07); g.globalAlpha = 0.8; g.fillRect(-100, 7, 200, 22); g.globalAlpha = 1;
    g.fillStyle = '#1e1e22'; g.font = `bold 26px ${FUTURA}`; g.fillText('DEEP SEARCH', 0, -12);
    g.restore();
  }
  return p.texture();
}

/** The emblem on top of the nose: the Team Zissou Z in a ring, with the sub's name round it. */
function noseEmblem() {
  return canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.fill();
    g.strokeStyle = '#2f5a8a'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, TAU); g.stroke();
    g.fillStyle = '#7ab8e8'; g.beginPath(); g.arc(128, 128, 74, 0, TAU); g.fill();
    g.fillStyle = RED === 0xd8323a ? '#d8323a' : '#c00'; g.font = `bold 120px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Z', 128, 134);
    g.fillStyle = '#2f5a8a'; g.font = `bold 20px ${FUTURA}`;
    const t = 'TEAM ZISSOU  •  DEEP SEARCH  •  ';
    for (let i = 0; i < t.length; i++) { g.save(); g.translate(128, 128); g.rotate(-Math.PI / 2 + (i / t.length) * TAU); g.fillText(t[i], 0, -90); g.restore(); }
  });
}

/** A gauge face: a ring of ticks and numbers. */
function gaugeFace(label: string, color = '#f6f0e0') {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = color; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    g.strokeStyle = '#2a2a30'; g.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; g.beginPath(); g.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
    g.fillStyle = '#2a2a30'; g.font = `bold 15px ${FUTURA}`; g.textAlign = 'center'; g.fillText(label, 64, 96);
    g.fillStyle = '#d8323a'; g.fillRect(84, 26, 16, 5);
  });
}

/** The sonar screen: green rings and a cross on black. */
function sonarFace() {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#06210f'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(90,255,140,0.7)'; g.lineWidth = 1.5;
    for (const r of [18, 36, 54]) { g.beginPath(); g.arc(64, 64, r, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(10, 64); g.lineTo(118, 64); g.moveTo(64, 10); g.lineTo(64, 118); g.stroke();
    // a big blip with spots: the shark
    g.fillStyle = 'rgba(140,255,170,0.9)'; g.beginPath(); g.ellipse(88, 40, 9, 4, -0.5, 0, TAU); g.fill();
  });
}

export interface DeepSearch { mount: MountDef; /** the stern, in the model's space, where bubbles come from */ stern: THREE.Object3D; lamps: THREE.Object3D[] }

export function buildDeepSearch(): DeepSearch {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const statics = new THREE.Group();
  body.add(statics);

  const paint = charToon({ map: hullPaint(), rim: 0.3 });
  const yellow = charToon({ color: YELLOW, rim: 0.3 });
  const red = charToon({ color: RED, rim: 0.3 });
  const brass = charToon({ color: BRASS, rim: 0.5, emissive: new THREE.Color(0x3a2a08) });
  const steel = charToon({ color: STEEL, rim: 0.4 });
  const cream = charToon({ color: 0xfbf6ea, rim: 0.3 });
  const add = (o: THREE.Object3D) => { statics.add(o); return o; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

  // ---------- the hull ----------
  const lathePts = PROFILE.map(([z, r]) => new THREE.Vector2(r, z));
  const hullGeo = new THREE.LatheGeometry(lathePts, 32);
  hullGeo.rotateX(Math.PI / 2);
  add(mesh(hullGeo, paint, 0, AXIS, 0));
  // the emblem on top of the nose: a patch of the same surface, raised a hair
  {
    const sub = PROFILE.filter(([z]) => z >= 1.5 && z <= 3.0).map(([z, r]) => new THREE.Vector2(r + 0.006, z));
    // add points between for a smooth patch
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k <= 10; k++) {
      const z = 1.85 + (k / 10) * 1.05;
      let r = 1;
      for (let i = 0; i < PROFILE.length - 1; i++) if (z >= PROFILE[i][0] && z <= PROFILE[i + 1][0]) r = THREE.MathUtils.lerp(PROFILE[i][1], PROFILE[i + 1][1], (z - PROFILE[i][0]) / (PROFILE[i + 1][0] - PROFILE[i][0]));
      pts.push(new THREE.Vector2(r + 0.008, z));
    }
    void sub;
    const span = 1.0 / 1.12;
    const g = new THREE.LatheGeometry(pts, 12, Math.PI - span / 2, span);
    g.rotateX(Math.PI / 2);
    const m = mesh(g, new THREE.MeshLambertMaterial({ map: noseEmblem(), transparent: true, alphaTest: 0.3 }), 0, AXIS, 0);
    add(m);
  }

  // ---------- the bubble's turret, collar and the little cockpit ----------
  add(mesh(new THREE.CylinderGeometry(DOME.r + 0.02, DOME.r + 0.08, 0.75, 36, 1, true), yellow, 0, DOME.y - 0.36, DOME.z));
  const collar = mesh(new THREE.TorusGeometry(DOME.r + 0.02, 0.045, 8, 48), brass, 0, DOME.y, DOME.z);
  collar.rotation.x = Math.PI / 2;
  add(collar);
  const floor = mesh(new THREE.CircleGeometry(DOME.r, 36), charToon({ color: 0x5a2a2a, rim: 0 }), 0, DOME.y - 0.02, DOME.z);
  floor.rotation.x = -Math.PI / 2;
  add(floor);
  // the panel at the front of the bubble: brass, with a depth gauge, a compass and the sonar
  // (the panel's faces tilt up towards the rider's eye; local +x is the rider's left)
  const panel = new THREE.Group();
  panel.add(mesh(new THREE.BoxGeometry(0.72, 0.12, 0.26), charToon({ color: 0x3a2a24, rim: 0.2 }), 0, 0.06, 0));
  panel.add(mesh(new THREE.BoxGeometry(0.75, 0.025, 0.29), brass, 0, 0.13, 0));
  const faceMat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t });
  const TILT = -(Math.PI / 2 + 0.55);
  const dial = (tex: THREE.Texture, x: number, r: number) => {
    const d = mesh(new THREE.CircleGeometry(r, 24), faceMat(tex), x, 0.15, 0.0);
    d.rotation.set(TILT, 0, Math.PI);
    const ring = mesh(new THREE.TorusGeometry(r, 0.01, 5, 24), brass, x, 0.15, 0);
    ring.rotation.set(TILT, 0, 0);
    panel.add(d, ring);
    return d;
  };
  dial(gaugeFace('FATHOMS'), 0.23, 0.075);
  dial(gaugeFace('COMPASS', '#e8f0f6'), -0.23, 0.065);
  const sonar = dial(sonarFace(), 0, 0.095);
  panel.position.set(0, DOME.y - 0.2, DOME.z + 0.72);
  add(panel);
  // a red knit beanie left beside the panel
  {
    const cap = mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, TAU, 0, Math.PI * 0.55), charToon({ color: 0xc8202a, rim: 0.3 }), 0.5, DOME.y - 0.01, DOME.z + 0.45);
    cap.rotation.z = 0.25;
    add(cap);
  }

  // ---------- the nose: floodlights, the claw, a bumper ----------
  const lamps: THREE.Object3D[] = [];
  const lampGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c8).multiplyScalar(1.6) });
  for (const s of [-1, 1]) {
    const lp = new THREE.Group();
    const housing = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.34, 16), steel);
    housing.rotation.x = Math.PI / 2;
    lp.add(housing);
    const rim = mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 18), brass, 0, 0, 0.17);
    lp.add(rim);
    lp.add(mesh(new THREE.CircleGeometry(0.17, 18), lampGlass, 0, 0, 0.175));
    // the bracket to the hull
    lp.add(mesh(new THREE.BoxGeometry(0.12, 0.3, 0.14), steel, -s * 0.1, -0.16, -0.06));
    lp.position.set(s * 1.02, AXIS + 0.12, 2.6);
    lp.rotation.y = s * 0.06;
    add(lp);
    const anchor = new THREE.Object3D();
    anchor.position.set(s * 1.02, AXIS + 0.12, 2.8);
    group.add(anchor);
    lamps.push(anchor);
  }
  // a bumper hoop round the nose, below the lamps
  {
    const bump = mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24, Math.PI), steel, 0, AXIS - 0.3, 3.15);
    bump.rotation.set(Math.PI / 2, 0, 0);
    add(bump);
  }
  // the sampling claw, folded under the chin
  {
    const arm = new THREE.Group();
    const seg = (len: number, r: number) => { const m = mesh(new THREE.CylinderGeometry(r, r, len, 8), steel); m.position.z = len / 2; m.rotation.x = Math.PI / 2; return m; };
    arm.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), brass));
    arm.add(seg(0.7, 0.05));
    const elbow = new THREE.Group(); elbow.position.z = 0.7; arm.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), brass));
    const fore = seg(0.5, 0.04); elbow.add(fore);
    elbow.rotation.x = 0.9;
    for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.ConeGeometry(0.03, 0.22, 5), steel);
      const a = (k / 3) * TAU;
      f.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.6);
      f.rotation.x = Math.PI / 2 + Math.sin(a) * 0.4; f.rotation.y = Math.cos(a) * 0.4;
      elbow.add(f);
    }
    arm.position.set(0, AXIS - 0.85, 2.0);
    arm.rotation.x = 0.35;
    add(arm);
  }

  // ---------- dive planes, skids ----------
  for (const s of [-1, 1]) {
    const pl = new THREE.Group();
    pl.add(mesh(new THREE.BoxGeometry(1.25, 0.07, 0.62), yellow, s * 0.62, 0, 0));
    pl.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.64), red, s * 1.2, 0, 0));
    pl.position.set(s * 1.1, AXIS - 0.05, 1.7);
    pl.rotation.z = -s * 0.05;
    add(pl);
    // skids for setting down on the sea floor
    const skid = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 8), steel, s * 0.62, AXIS - 1.32, -0.3);
    skid.rotation.x = Math.PI / 2;
    add(skid);
    for (const z of [-1.8, 1.2]) add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.08), steel, s * 0.6, AXIS - 1.12, z));
  }

  // ---------- the conning tower behind the bubble ----------
  {
    const sh = new THREE.Shape();
    const L = 1.9, W = 0.82;
    sh.moveTo(-W / 2, -L / 2 + W / 2);
    sh.absarc(0, -L / 2 + W / 2, W / 2, Math.PI, 0, false);
    sh.lineTo(W / 2, L / 2 - W / 2);
    sh.absarc(0, L / 2 - W / 2, W / 2, 0, Math.PI, false);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.15, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    const sail = mesh(g, yellow, 0, AXIS + 0.95, -1.85);
    add(sail);
    // a white band round the top, and the emblem on each side
    const band = mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24, 1, true), cream, 0, AXIS + 2.0, -1.85);
    band.scale.set(W / 2 + 0.07, 1, L / 2 + 0.07);
    add(band);
    const emb = noseEmblem();
    for (const s of [-1, 1]) {
      const d = mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshLambertMaterial({ map: emb, transparent: true, alphaTest: 0.3 }), s * (W / 2 + 0.075), AXIS + 1.55, -1.85);
      d.rotation.y = s * Math.PI / 2;
      add(d);
      // two little portholes
      for (const z of [-1.3, -2.35]) {
        const ring = mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 16), brass, s * (W / 2 + 0.07), AXIS + 1.5, z);
        ring.rotation.y = Math.PI / 2;
        add(ring);
      }
    }
    // periscope and a rail
    add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.3, 8), steel, 0.18, AXIS + 2.55, -2.2));
    add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), steel, 0.18, AXIS + 3.2, -2.1));
  }
  // portholes along the flanks, lit warm from inside
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.1) });
  for (const s of [-1, 1]) for (const z of [-0.4, -1.5, -2.6]) {
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 18), brass, s * 1.205, AXIS + 0.18, z);
    ring.rotation.y = Math.PI / 2;
    add(ring);
    const gl = mesh(new THREE.CircleGeometry(0.15, 16), warm, s * 1.2, AXIS + 0.18, z);
    gl.rotation.y = s * Math.PI / 2;
    add(gl);
  }

  // ---------- the stern: cross fins, the propeller in its duct ----------
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Group();
    fin.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.9), yellow, 0, 0.75, 0));
    fin.add(mesh(new THREE.BoxGeometry(0.07, 0.2, 0.92), red, 0, 1.15, 0));
    fin.position.set(0, AXIS, -3.95);
    fin.rotation.z = (k / 4) * TAU + Math.PI / 4;
    add(fin);
  }
  const duct = mesh(new THREE.TorusGeometry(0.66, 0.08, 8, 32), yellow, 0, AXIS, -4.75);
  add(duct);
  for (let k = 0; k < 4; k++) {
    const strut = mesh(new THREE.BoxGeometry(0.04, 0.66, 0.06), steel, 0, 0, 0);
    strut.position.set(Math.cos((k / 4) * TAU) * 0.33, AXIS + Math.sin((k / 4) * TAU) * 0.33, -4.75);
    strut.rotation.z = (k / 4) * TAU + Math.PI / 2;
    add(strut);
  }
  const prop = new THREE.Group();
  prop.add(mesh(new THREE.ConeGeometry(0.14, 0.4, 10), brass, 0, 0, -0.1).rotateX(-Math.PI / 2));
  for (let k = 0; k < 3; k++) {
    const b = mesh(new THREE.BoxGeometry(0.16, 0.56, 0.03), brass, 0, 0.3, 0);
    const holder = new THREE.Group();
    b.rotation.y = 0.5;
    holder.add(b);
    holder.rotation.z = (k / 3) * TAU;
    prop.add(holder);
  }
  prop.position.set(0, AXIS, -4.78);
  body.add(prop);
  const stern = new THREE.Object3D();
  stern.position.set(0, AXIS, -5.0);
  group.add(stern);

  // ---------- the pennant and the beacon (animated) ----------
  const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), steel, -0.22, AXIS + 2.65, -2.55);
  add(pole);
  const flagTex = canvasTexture(128, 64, (g) => {
    g.fillStyle = '#8ec8ee'; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 26); g.lineTo(128, 38); g.lineTo(0, 64); g.closePath(); g.fill();
    g.fillStyle = '#d8323a'; g.font = `bold 40px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 34, 33);
  });
  const flagGeo = new THREE.PlaneGeometry(0.9, 0.42, 8, 1);
  flagGeo.translate(-0.45, 0, 0);
  const flag = mesh(flagGeo, new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide, transparent: true, alphaTest: 0.4 }), -0.22, AXIS + 3.0, -2.55);
  flag.rotation.y = Math.PI / 2;
  body.add(flag);
  const flagBase = (flagGeo.attributes.position as THREE.BufferAttribute).array.slice() as Float32Array;
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  body.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), beaconMat, 0.18, AXIS + 2.18, -1.15));

  // ---------- the needle on the depth gauge ----------
  const needle = mesh(new THREE.BoxGeometry(0.006, 0.06, 0.004), new THREE.MeshBasicMaterial({ color: 0xc8202a }), 0, 0, 0);
  needle.geometry.translate(0, 0.025, 0);
  const needleHolder = new THREE.Group();
  needleHolder.position.set(0.23, DOME.y - 0.2 + 0.152, DOME.z + 0.72 - 0.001);
  needleHolder.rotation.set(TILT, 0, Math.PI);
  needleHolder.add(needle);
  body.add(needleHolder);
  const sweep = mesh(new THREE.PlaneGeometry(0.01, 0.09), new THREE.MeshBasicMaterial({ color: 0x8affb0, transparent: true, opacity: 0.85 }), 0, 0, 0);
  sweep.geometry.translate(0, 0.045, 0);
  const sweepHolder = new THREE.Group();
  sweepHolder.position.set(0, DOME.y - 0.2 + 0.153, DOME.z + 0.72 - 0.001);
  sweepHolder.rotation.set(TILT, 0, Math.PI);
  sweepHolder.add(sweep);
  body.add(sweepHolder);
  void sonar;

  // ---------- the glass bubble (seen from inside) ----------
  const wet = { value: 0 };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWet: wet },
    transparent: true, depthWrite: false, side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uWet;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float az = atan(d.x, d.z);
        // the glass thickens towards the collar, where it is seen edge-on
        float a = 0.02 + 0.16 * smoothstep(0.28, 0.0, d.y);
        vec3 col = vec3(0.85, 0.97, 1.0);
        // two long reflections of the cockpit lamp, off to the sides
        float hl = exp(-pow((abs(az) - 1.95) * 7.0, 2.0)) * smoothstep(0.15, 0.45, d.y) * smoothstep(0.9, 0.55, d.y);
        hl += 0.6 * exp(-pow((d.y - 0.93) * 18.0, 2.0)) * smoothstep(0.5, 1.5, abs(az));
        a += hl * 0.16;
        // drops running down the glass after the sub breaks the surface
        if (uWet > 0.001) {
          vec2 g = vec2(az * 9.0, d.y * 14.0 + uTime * 0.9);
          vec2 cell = floor(g), f = fract(g) - 0.5;
          float h = hash(cell);
          vec2 off = vec2(hash(cell + 2.3) - 0.5, hash(cell + 5.1) - 0.5) * 0.5;
          float r = 0.1 + 0.18 * h;
          float drop = smoothstep(r, r * 0.6, length((f - off) * vec2(1.0, 0.7))) * step(0.45, h);
          float trail = smoothstep(0.06, 0.0, abs(f.x - off.x)) * step(0.0, f.y - off.y) * step(0.72, h) * 0.35;
          a += (drop * 0.45 + trail) * uWet;
          col = mix(col, vec3(1.0), drop * uWet);
        }
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.8));
      }
    `,
  });
  const dome = mesh(new THREE.SphereGeometry(DOME.r, 40, 16, 0, TAU, 0, Math.PI / 2), domeMat, 0, DOME.y, DOME.z);
  dome.renderOrder = 9000;
  body.add(dome);
  // the outside of the glass, for anyone looking at the sub (the rider, inside, never sees these faces)
  const shell = mesh(new THREE.SphereGeometry(DOME.r, 32, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.22, depthWrite: false, emissive: 0x204050 }), 0, DOME.y, DOME.z);
  body.add(shell);

  statics.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  mergeStatic(statics);

  // ---------- the floodlight beams: soft additive cones ----------
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main() {
        vAlong = uv.y;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount; varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main() {
        float along = pow(clamp(vAlong, 0.0, 1.0), 2.2);
        float soft = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float a = along * (0.35 + 0.65 * soft) * uAmount * 0.16;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a);
      }
    `,
  });
  for (const s of [-1, 1]) {
    // a cone whose tip is at the lamp, opening forward; uv.y is 1 at the lamp and 0 at the far end
    const cone = new THREE.ConeGeometry(2.6, 15, 20, 1, true);
    cone.translate(0, -7.5, 0);
    cone.rotateX(-Math.PI / 2);
    const m = mesh(cone, beamMat, s * 1.02, AXIS + 0.12, 2.8);
    m.rotation.y = s * 0.06;
    m.renderOrder = 5;
    body.add(m);
  }

  // ---------- life ----------
  const seat = EYE.clone();
  let ping = 0;
  const mount: MountDef = {
    kind: 'sub', group, seat, z0: Z.start, z1: Z.end, tilt: 0.5, bank: 0.15,
    update(dt, t, ride) {
      const z = ride.position.z;
      // after breaking the surface the sub settles lower in the water, rocking on the swell
      const settle = smoothstep(Z.surface - 3, Z.surface - 16, z);
      const swell = settle * (Math.sin(t * 1.3) * 0.06 + Math.sin(t * 0.7 + 1) * 0.04);
      const drift = (1 - settle) * Math.sin(t * 0.6) * 0.04;
      body.position.y = -1.25 * settle + swell + drift;
      body.rotation.z = settle * Math.sin(t * 0.9) * 0.025;
      seat.set(EYE.x, EYE.y + body.position.y, EYE.z);
      prop.rotation.z += dt * (6 + 4 * (1 - settle));
      // the pennant flutters (in the water it waves slowly; in the air it snaps)
      const pa = flag.geometry.attributes.position as THREE.BufferAttribute;
      const f = 1 + settle * 3;
      for (let i = 0; i < pa.count; i++) {
        const x = flagBase[i * 3];
        pa.setZ(i, Math.sin(t * 2.2 * f - x * 5) * 0.12 * (-x / 0.9));
      }
      pa.needsUpdate = true;
      beaconMat.color.setHex(Math.sin(t * 3.1) > 0.6 ? 0xff3a2a : 0x5a1410);
      // the depth gauge reads the depth; the sonar sweeps
      const depth = clamp(-ride.position.y, 0, 30);
      needle.rotation.z = Math.PI * 0.75 - (depth / 30) * Math.PI * 1.5 + Math.sin(t * 7) * 0.01;
      ping += dt;
      sweep.rotation.z = -ping * 2.2;
      // the floodlights show up in the dark
      const dark = clamp((-ride.position.y - 6) / 14, 0, 1) * (1 - smoothstep(Z.surface + 18, Z.surface + 2, z));
      beamMat.uniforms.uAmount.value = dark;
      // water running off the bubble after the surface
      wet.value = smoothstep(Z.surface + 1, Z.surface - 1, z) * (1 - smoothstep(Z.surface - 4, Z.surface - 26, z));
      domeMat.uniforms.uTime.value = t;
    },
  };
  return { mount, stern, lamps };
}
