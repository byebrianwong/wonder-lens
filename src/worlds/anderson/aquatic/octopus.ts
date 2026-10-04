import * as THREE from 'three';
import { Painter, charToon } from '../../../engine/Paint';
import { FlexTube, LookAt, envelope, outline, profileShape, sculpt } from '../../../engine/Rig';
import { Rng, TAU, clamp, lerp } from '../../../engine/math';
import { StopMotion } from '../stopmotion';

/*
 * The paisley octopus, draped over the top of the coral arch, its arms hanging down either side and curling over
 * the path, its big eyes following the Deep Search as it passes underneath. Whistle and it shows off: it flushes
 * through its colours and throws its arms wide. Throw a box and it squirts a cloud of ink. Posed on twos.
 */

/** Paisley teardrops in lilac, pink, teal and gold on a soft violet ground. Tiles round a sphere or a tube. */
function paisley(seed: number, light = false) {
  const W = 512, H = 256;
  const p = new Painter(W, H, seed).fill(light ? '#f4d4ec' : '#b48ad8');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 40, colors: light ? ['#ffe0f0', '#ecc8e4'] : ['#c49ae4', '#a07ccc'], r: [12, 40], alpha: [0.2, 0.4] });
  const cols = ['#ff8ab8', '#6fd8c8', '#ffd25a', '#8a5ac8', '#fff0f8', '#ff9a6a'];
  const drop = (x: number, y: number, s: number, a: number, c1: string, c2: string, c3: string) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    const shape = () => { g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(16, -16, 18, 8, 0, 14); g.bezierCurveTo(-14, 18, -18, -2, -6, -6); g.bezierCurveTo(4, -10, -2, -16, 0, -18); g.closePath(); };
    g.fillStyle = c1; shape(); g.fill();
    g.strokeStyle = '#4a2a5a'; g.lineWidth = 1.6 / s; shape(); g.stroke();
    g.scale(0.62, 0.62); g.translate(1, 3);
    g.fillStyle = c2; shape(); g.fill();
    g.fillStyle = c3; g.beginPath(); g.arc(0, 4, 5, 0, TAU); g.fill();
    g.restore();
    // a ring of dots round it
    for (let k = 0; k < 9; k++) { const t = (k / 9) * TAU; g.fillStyle = c3; g.beginPath(); g.arc(x + Math.cos(t) * 26 * s, y + Math.sin(t) * 26 * s, 1.8, 0, TAU); g.fill(); }
  };
  for (let i = 0; i < 34; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), s = rng.range(0.7, 1.3), a = rng.range(0, TAU);
    const [c1, c2, c3] = [rng.pick(cols), rng.pick(cols), rng.pick(cols)];
    for (const dx of [0, W, -W]) if (x + dx > -40 && x + dx < W + 40) drop(x + dx, y, s, a, c1, c2, c3);
  }
  return p.texture();
}

/** Arm skin: paisley on top, pale suckers in a row underneath (round the tube, u = 0.75 is the underside). */
function armTexture() {
  const p = new Painter(256, 512, 1503);
  const base = paisley(1505).image as HTMLCanvasElement;
  p.g.drawImage(base, 0, 0, 256, 512);
  const g = p.g;
  g.fillStyle = '#f6e0f0'; g.fillRect(256 * 0.62, 0, 256 * 0.26, 512);
  for (let y = 6; y < 512; y += 13) for (const u of [0.69, 0.81]) { g.fillStyle = '#e8b8d8'; g.beginPath(); g.arc(256 * u + (y % 26 ? 4 : -4), y, 5, 0, TAU); g.fill(); g.fillStyle = '#c890b8'; g.beginPath(); g.arc(256 * u + (y % 26 ? 4 : -4), y, 2, 0, TAU); g.fill(); }
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Octopus {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private arms: Array<{ tube: FlexTube; a: number; side: number; len: number; ph: number }> = [];
  private eyes: THREE.Group[] = [];
  private lids: THREE.Mesh[] = [];
  private look = new LookAt(1.0, 0.6);
  private sm = new StopMotion(12, 1507);
  private showT = 99;
  private inkT = 99;
  private skin: THREE.MeshToonMaterial;
  private armMat: THREE.MeshToonMaterial;
  private ink: THREE.Points;
  private inkPos: Float32Array;
  private inkVel: Float32Array;
  private rng = new Rng(1509);
  private blink = 3;
  /** the arch's half-width at the level of the body, so the arms drape down its sides */
  private reach: number;

  constructor(reach = 6) {
    this.reach = reach;
    this.skin = charToon({ map: paisley(1501), rim: 0.45 });
    this.armMat = charToon({ map: armTexture(), rim: 0.45 });
    // the mantle: a soft bag leaning back, wider at the bottom where the eyes are
    const mantle = new THREE.Mesh(sculpt(profileShape([[2.9, 0], [2.7, 0.75], [2.2, 1.2], [1.4, 1.45], [0.7, 1.4], [0.2, 1.25], [-0.15, 1.0], [-0.3, 0]], { depth: 1.0 }), 40, 28), this.skin);
    mantle.rotation.x = -0.35;
    mantle.position.set(0, 0.2, -0.4);
    outline(mantle, 0x2a1830, 1.4, 0.05);
    this.body.add(mantle);
    // the eyes: big pale globes with dark slot pupils, lids that blink
    const white = charToon({ color: 0xfff4e0, rim: 0.3 });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
    const lidM = charToon({ color: 0xa47cc8, rim: 0.3 });
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(s * 0.82, 0.35, 0.72);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), white);
      e.add(ball);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), pupil);
      pu.scale.set(1.3, 0.55, 0.5); pu.position.z = 0.36;
      e.add(pu);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      gl.position.set(-0.1, 0.12, 0.4);
      e.add(gl);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 10, 0, TAU, 0, Math.PI * 0.5), lidM);
      lid.rotation.x = -1.5;
      e.add(lid);
      this.lids.push(lid);
      outline(ball, 0x2a1830, 1.2, 0.03);
      this.body.add(e);
      this.eyes.push(e);
    }
    this.group.add(this.body);
    // eight arms: four down each side of the arch, the front pair hanging out over the path
    const rng = new Rng(1511);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const a = side * (0.5 + k * 0.42) + (side < 0 ? Math.PI : 0) * 0;
      const tube = new FlexTube(20, 9, (u) => lerp(0.5, 0.06, Math.pow(u, 0.75)), this.armMat, { uvAlong: 3, uvAround: 1 });
      this.group.add(tube.mesh);
      this.arms.push({ tube, a, side, len: rng.range(8, 10), ph: rng.range(0, TAU) });
    }
    // the ink: a few dozen soft dark puffs
    const N = 60;
    this.inkPos = new Float32Array(N * 3).fill(-9999);
    this.inkVel = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.inkPos, 3));
    this.ink = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      transparent: true, depthWrite: false,
      vertexShader: 'uniform float uA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(2200.0 / max(-mv.z, 1.0), 2.0, 240.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r) * uA * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(0.16, 0.08, 0.22, a); }',
    }));
    this.ink.frustumCulled = false;
    this.ink.visible = false;
    this.group.add(this.ink);
  }

  showOff() { this.showT = 0; }
  squirt() {
    this.inkT = 0;
    for (let i = 0; i < this.inkPos.length / 3; i++) {
      this.inkPos[i * 3] = this.rng.range(-0.5, 0.5); this.inkPos[i * 3 + 1] = 0.3; this.inkPos[i * 3 + 2] = this.rng.range(-0.5, 0.5);
      this.inkVel[i * 3] = this.rng.range(-3, 3); this.inkVel[i * 3 + 1] = this.rng.range(-1.5, 2); this.inkVel[i * 3 + 2] = this.rng.range(-1, 5);
    }
  }

  update(dt: number, cam: THREE.Vector3) {
    this.showT += dt; this.inkT += dt;
    // the ink drifts and spreads (smoothly: it is water, not a puppet)
    if (this.inkT < 6) {
      this.ink.visible = true;
      for (let i = 0; i < this.inkPos.length; i++) { this.inkPos[i] += this.inkVel[i] * dt; this.inkVel[i] *= 1 - dt * 1.2; }
      (this.ink.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.ink.material as THREE.ShaderMaterial).uniforms.uA.value = clamp(this.inkT * 4, 0, 1) * clamp((6 - this.inkT) / 3, 0, 1);
    } else this.ink.visible = false;
    if (!this.sm.tick(dt)) return;
    const st = this.sm.t;
    const show = envelope(this.showT, 0, 0.4, 2.6, 3.4);
    const startle = envelope(this.inkT, 0, 0.12, 0.5, 1.4);
    // breathing, and a jump back when it inks
    this.body.scale.set(1 + Math.sin(st * 1.6) * 0.04 + show * 0.12, 1 - Math.sin(st * 1.6) * 0.03 + show * 0.1, 1 + show * 0.08);
    this.body.position.y = startle * 0.8;
    // chromatophores: the colours flush through when it shows off
    const hue = show > 0.01 ? (this.showT * 0.6) % 1 : 0;
    const flush = new THREE.Color().setHSL(hue, 0.7, 0.75).lerp(new THREE.Color(0xffffff), 1 - show);
    this.skin.color.copy(flush); this.armMat.color.copy(flush);
    this.skin.emissive.setRGB(0.15 * show, 0.05 * show, 0.2 * show);
    // eyes follow the sub; lids blink
    const [yaw, pitch] = this.look.update(this.body, cam, 1 / 12);
    for (const e of this.eyes) e.rotation.set(pitch * 0.8, yaw * 0.8, 0);
    this.blink -= 1 / 12;
    const shut = this.blink < 0.15;
    if (this.blink < 0) this.blink = 2.5 + this.rng.next() * 3;
    for (const l of this.lids) l.rotation.x = shut ? -0.05 : -1.5 + startle * 0.6;
    // arms: each drapes down the arch's side and curls at the tip; showing off throws them wide and up
    this.arms.forEach((arm, i) => {
      const { tube, a, side, len, ph } = arm;
      const fwd = Math.cos(a) * 0.9; // spread forward and back along the path
      const curl = 1.2 + Math.sin(st * 0.9 + ph) * 0.5;
      for (let k = 0; k < tube.pts.length; k++) {
        const u = k / (tube.pts.length - 1);
        const s = u * len;
        // out to the side over the arch's crown, then down its flank
        const out = Math.min(s, this.reach * 0.8);
        const down = Math.max(0, s - this.reach * 0.55);
        let x = side * (0.6 + out * 0.95) + Math.sin(st * 1.1 + ph + u * 4) * 0.25 * u;
        let y = 0.2 - down * 0.85 - out * 0.12;
        let z = fwd * (0.3 + s * 0.35) + Math.cos(st * 0.8 + ph + u * 3) * 0.3 * u;
        // the tip curls round
        const tipK = Math.max(0, (u - 0.7) / 0.3);
        x += side * Math.sin(tipK * curl * Math.PI) * 0.6;
        y += (1 - Math.cos(tipK * curl * Math.PI)) * 0.45;
        // showing off: arms lift and spread wide like a skirt
        x = lerp(x, side * (0.8 + s * 0.9) * 1.05, show * 0.7);
        y = lerp(y, 0.4 + Math.sin(u * Math.PI) * 1.4 - s * 0.15, show * 0.7);
        z = lerp(z, fwd * s * 0.75, show * 0.6);
        tube.pts[k].set(x, y + this.body.position.y * (1 - u), z);
      }
      tube.update();
      void i;
    });
  }
}
