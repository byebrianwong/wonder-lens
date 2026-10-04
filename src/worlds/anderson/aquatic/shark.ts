import * as THREE from 'three';
import { Painter, charToon } from '../../../engine/Paint';
import { Rig, envelope, profileShape, sculpt } from '../../../engine/Rig';
import { TAU, clamp, smoothstep } from '../../../engine/math';
import { StopMotion } from '../stopmotion';

/*
 * The jaguar shark: huge (twenty units long), slate blue with a pale belly, covered in jaguar rosettes whose centres
 * glow in the dark. A skinned body on a spine of five bones swims in a slow S on twos, with its fins and the long
 * upper lobe of its tail on the bones. The eye is pale and glowing, and turns to look at the sub. Whistle and a
 * wave of light runs down its spots from head to tail.
 *
 * Local +z is the head. The origin is the middle of the body.
 */

const LEN = 10;

/** The skin, on the sculpted body's sphere uvs: the snout at the top of the canvas; u 0.25 is the belly, 0.75 the back. */
function skin() {
  const W = 1024, H = 512;
  const p = new Painter(W, H, 1601);
  const e = new Painter(W / 2, H / 2, 1602).fill('#000');
  const g = p.g, eg = e.g, rng = p.rng;
  eg.scale(0.5, 0.5);
  // round the body: pale belly (u 0.25), slate flanks, dark back (u 0.75)
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#6a7e92'); gr.addColorStop(0.12, '#a8b4b8'); gr.addColorStop(0.25, '#ece6d8'); gr.addColorStop(0.38, '#a8b4b8');
  gr.addColorStop(0.5, '#6a7e92'); gr.addColorStop(0.75, '#34465e'); gr.addColorStop(1, '#6a7e92');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  p.dabs({ n: 140, colors: ['#4a5c76', '#3a4862', '#6a7c94'], r: [8, 30], alpha: [0.15, 0.3], squash: 0.6 });
  // rosettes over the back and flanks (not on the belly), thinning towards the snout and tail
  const rosette = (x: number, y: number, r: number) => {
    const arcs: Array<[number, number]> = [];
    for (let k = 0; k < 5; k++) { const a0 = (k / 5) * TAU + rng.range(0, 0.4); arcs.push([a0, a0 + rng.range(0.45, 0.8)]); }
    for (const dx of [0, W, -W]) {
      if (x + dx < -r * 2 || x + dx > W + r * 2) continue;
      g.fillStyle = '#b8b490'; g.beginPath(); g.ellipse(x + dx, y, r * 0.55, r * 0.42, 0, 0, TAU); g.fill();
      g.strokeStyle = '#141a28'; g.lineWidth = r * 0.26; g.lineCap = 'round';
      g.beginPath(); for (const [a0, a1] of arcs) { g.moveTo(x + dx + Math.cos(a0) * r, y + Math.sin(a0) * r); g.arc(x + dx, y, r, a0, a1); } g.stroke();
      eg.fillStyle = '#bff8ff'; eg.beginPath(); eg.ellipse(x + dx, y, r * 0.42, r * 0.32, 0, 0, TAU); eg.fill();
    }
  };
  for (let i = 0; i < 260; i++) {
    const v = rng.range(0.1, 0.95), u = rng.range(0, 1);
    const belly = Math.abs(u - 0.25);
    if (belly < 0.09 && rng.chance(0.85)) continue;
    const r = rng.range(8, 17) * (1 - Math.abs(v - 0.45) * 0.7);
    rosette(u * W, v * H, r);
  }
  // little spots near the snout
  for (let i = 0; i < 90; i++) { const x = rng.range(0, W), y = rng.range(H * 0.02, H * 0.14); g.fillStyle = '#1a2232'; g.beginPath(); g.arc(x, y, rng.range(2, 4), 0, TAU); g.fill(); eg.fillStyle = '#7fe8ff'; eg.beginPath(); eg.arc(x, y, 1.5, 0, TAU); eg.fill(); }
  // gill slits on both flanks
  for (const u of [0.0, 0.5, 1.0]) for (let k = 0; k < 5; k++) {
    g.strokeStyle = '#1a2232'; g.lineWidth = 4; g.beginPath(); g.moveTo(u * W - 18, H * (0.19 + k * 0.022)); g.quadraticCurveTo(u * W, H * (0.2 + k * 0.022), u * W + 18, H * (0.19 + k * 0.022)); g.stroke();
  }
  return { map: p.texture(), glow: e.texture() };
}

/** A fin: a 2D outline (x along the body, y up), extruded thin and turned so x runs along z. */
function finGeo(pts: Array<[number, number]>, thick: number) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.5, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

export class JaguarShark {
  readonly group = new THREE.Group();
  /** the head end, for the photo subject */
  readonly head = new THREE.Object3D();
  private rig: Rig;
  private sm = new StopMotion(12, 1607);
  private mat: THREE.MeshToonMaterial;
  private eyes: THREE.Mesh[] = [];
  private eyeGlow: THREE.MeshBasicMaterial;
  private glowT = 99;
  /** 0..1, how much of it shows (it fades its glow as it leaves) */
  presence = 1;
  private swim = 0;

  constructor() {
    const { map, glow } = skin();
    this.mat = charToon({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.8, rim: 0.55, shade: 0x6a78b0 });
    const finMat = charToon({ color: 0x3a4862, rim: 0.5, shade: 0x6a78b0 });
    const inner = new THREE.Group();
    this.group.add(inner);
    // ---- the skeleton along the body ----
    this.rig = new Rig(inner, [
      { name: 'head', at: [0, 0, 5.5] },
      { name: 'b1', parent: 'head', at: [0, 0, 2] },
      { name: 'b2', parent: 'b1', at: [0, 0, -2] },
      { name: 'b3', parent: 'b2', at: [0, 0, -5.5] },
      { name: 'b4', parent: 'b3', at: [0, 0, -8.4] },
    ]);
    // ---- the body: a smooth spindle, deeper than it is wide, flattened under the belly ----
    const shape = profileShape([
      [LEN, 0], [9.7, 0.5], [9.0, 1.05], [7.8, 1.6], [6.0, 2.05], [3.5, 2.35], [0.5, 2.3], [-2.5, 1.95], [-5.5, 1.35], [-8.0, 0.75], [-9.6, 0.42], [-10.4, 0],
    ], { depth: 1.08, front: () => 0.82 });
    const geo = sculpt(shape, 64, 40);
    geo.rotateX(Math.PI / 2);
    geo.scale(0.86, 1, 1);
    // each stretch of the body belongs to the bone at its front, blended across each joint
    const joints: Array<[string, number]> = [['head', 5.5], ['b1', 2], ['b2', -2], ['b3', -5.5], ['b4', -8.4]];
    const S = (c: number, z: number) => smoothstep(c - 1.2, c + 1.2, z);
    const body = this.rig.skin(geo, this.mat, (p) => {
      const w: Record<string, number> = {};
      joints.forEach(([name], i) => {
        const above = i + 1 < joints.length ? S(joints[i + 1][1], p.z) : 1;
        const below = i > 0 ? 1 - S(joints[i][1], p.z) : 1;
        const k = above * below;
        if (k > 1e-3) w[name] = k;
      });
      return w;
    });
    body.castShadow = true;
    // ---- fins on the bones ----
    const B = this.rig.bones;
    const onBone = (bone: string, g: THREE.BufferGeometry, m: THREE.Material, at: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(g, m);
      const boneZ = { head: 5.5, b1: 2, b2: -2, b3: -5.5, b4: -8.4 }[bone]!;
      mesh.position.set(at[0], at[1], at[2] - boneZ);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      mesh.castShadow = true;
      B[bone].add(mesh);
      return mesh;
    };
    // first dorsal: tall and swept back
    onBone('b1', finGeo([[1.8, 0], [0.4, 2.0], [-1.2, 3.3], [-1.0, 2.2], [-0.6, 0.6], [-1.2, 0]], 0.22), finMat, [0, 2.15, 0.2]);
    // second dorsal and anal fin, small
    onBone('b3', finGeo([[0.6, 0], [-0.2, 0.9], [-0.9, 1.1], [-0.6, 0]], 0.14), finMat, [0, 1.15, -6.0]);
    onBone('b3', finGeo([[0.5, 0], [-0.3, -0.8], [-0.9, -0.9], [-0.6, 0]], 0.14), finMat, [0, -0.95, -6.6]);
    // the tail: a long upper lobe and a shorter lower one
    onBone('b4', finGeo([[0.8, 0.5], [-1.4, 2.4], [-3.4, 4.6], [-3.0, 3.6], [-1.6, 0.6], [-2.6, -1.2], [-2.2, -2.4], [-0.6, -0.9], [0.8, -0.4]], 0.2), finMat, [0, 0.1, -9.0]);
    // pectoral fins: long, swept down and back
    for (const s of [-1, 1]) {
      const pec = onBone('head', finGeo([[0.9, 0], [-1.0, -0.2], [-3.4, -1.5], [-2.6, -0.6], [-0.8, 0.25]], 0.18), finMat, [s * 1.7, -0.9, 3.4]);
      pec.rotation.set(0, 0, s * 0.55);
      onBone('b2', finGeo([[0.4, 0], [-0.6, -0.4], [-1.3, -0.8], [-0.8, 0]], 0.12), finMat, [s * 1.2, -1.3, -3.2]).rotation.set(0, 0, s * 0.5);
    }
    // ---- the eyes: pale, glowing a little, set back from the snout ----
    this.eyeGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbff4ff).multiplyScalar(1.3) });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x0a0c14 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), this.eyeGlow);
      eye.position.set(s * 1.32, 0.55, 7.5 - 5.5);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), pupil);
      pu.position.set(s * 0.2, 0, 0.08);
      pu.scale.set(0.5, 1, 1);
      eye.add(pu);
      B.head.add(eye);
      this.eyes.push(eye);
    }
    // the head anchor for the subject
    this.head.position.set(0, 0.3, 6.5 - 5.5);
    B.head.add(this.head);
  }

  /** the wave of light, head to tail */
  flare() { this.glowT = 0; }

  update(dt: number, cam: THREE.Vector3, swimSpeed = 1) {
    this.glowT += dt;
    this.swim += dt * swimSpeed;
    // the spots pulse slowly; a whistle sends a bright wave along them (the glow map is lit all at once, so the
    // wave is a swell of brightness that peaks and settles)
    const wave = envelope(this.glowT, 0, 0.5, 1.6, 3.2);
    const pulse = 0.65 + 0.25 * Math.sin(this.swim * 1.3) + 0.08 * Math.sin(this.swim * 5.1);
    this.mat.emissiveIntensity = (pulse + wave * 1.6) * clamp(this.presence, 0, 1);
    this.eyeGlow.color.setHex(0xbff4ff).multiplyScalar((0.9 + wave * 1.2) * clamp(this.presence * 1.2, 0, 1.3));
    if (!this.sm.tick(dt)) return;
    const t = this.swim;
    // the swimming S: small at the head, large at the tail, travelling backwards
    const amp = [0.05, 0.08, 0.12, 0.16, 0.24];
    this.rig.list.forEach((b, i) => { b.rotation.y = Math.sin(t * 1.5 - i * 0.85) * amp[i]; b.rotation.x = Math.sin(t * 0.7 - i * 0.5) * 0.015; });
    // the eyes turn towards the camera
    for (const e of this.eyes) {
      const local = e.parent!.worldToLocal(cam.clone());
      const d = local.sub(e.position).normalize();
      e.rotation.y = clamp(Math.atan2(d.x, d.z) * 0.5, -0.6, 0.6);
      e.rotation.x = clamp(-d.y * 0.5, -0.4, 0.4);
    }
  }
}
