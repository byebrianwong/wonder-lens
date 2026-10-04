import * as THREE from 'three';
import { Rain } from '../../../engine/Particles';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU, smoothstep } from '../../../engine/math';
import { ISLAND, type Road } from '../layout';
import type { ScreenFx } from '../common';
import { GLSL_NOISE } from './shared';

/*
 * Through the storm wall (z -1185 to -1262). The screen is covered with storm grey there (the world's
 * cover, which this scene starts a little early so the camera meets the wall's outer face unseen). On
 * top of the cover, this draws lightning flashes, rain, and torn wisps of cloud rushing past, and in one
 * bright flash the dark silhouette of the floating castle ahead.
 *
 * The rain, the wisps and the silhouette are drawn after the world's lens (render order above 10000, no
 * depth test), because the cover hides everything in the scene.
 */

/** The grey of the world's storm cover (layout.ts COVERS). */
export const STORM_GREY = 0x4a5464;

/** Lightning flashes inside the storm: [z, strength]. The one at -1228 shows the castle. */
const FLASHES: Array<[number, number]> = [[-1203, 0.7], [-1210.5, 0.95], [-1218, 0.6], [-1228, 1.2], [-1240, 0.85], [-1250, 0.6]];
const CASTLE_Z = -1228;
const pulse = (z: number, z0: number, w: number) => Math.exp(-(((z - z0) / w) ** 2));
/** a flash and a fainter second flicker just after it */
const flashAt = (z: number, z0: number) => Math.max(pulse(z, z0, 0.9), 0.65 * pulse(z, z0 - 2.1, 0.7));

/** Laputa as a dark shape: the great tree on top, the tiered castle and the hanging roots and spires below. */
function castleSilhouette() {
  const p = new Painter(512, 512, 1986);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = '#161b26';
  g.shadowColor = '#161b26';
  g.shadowBlur = 10;
  const cx = 256, deck = 300;
  // the rock bowl underneath, with roots and spires hanging from it
  g.beginPath();
  g.moveTo(cx - 175, deck);
  g.quadraticCurveTo(cx - 150, deck + 120, cx, deck + 175);
  g.quadraticCurveTo(cx + 150, deck + 120, cx + 175, deck);
  g.closePath(); g.fill();
  for (let i = 0; i < 14; i++) {
    const x = cx + rng.range(-120, 120), top = deck + 60 + (1 - Math.abs(x - cx) / 130) * 90, len = rng.range(30, 90) * (1 - Math.abs(x - cx) / 200);
    g.beginPath(); g.moveTo(x - 5, top - 10); g.lineTo(x + rng.range(-8, 8), top + len); g.lineTo(x + 5, top - 10); g.fill();
  }
  // tiers of the castle, each with little towers round its rim
  const tiers: Array<[number, number, number]> = [[165, deck, deck - 26], [125, deck - 26, deck - 58], [86, deck - 58, deck - 96]];
  for (const [w, y0, y1] of tiers) {
    g.fillRect(cx - w, y1, w * 2, y0 - y1);
    for (let k = -1; k <= 1; k += 2) for (const f of [0.95, 0.6]) {
      const x = cx + k * w * f;
      g.fillRect(x - 6, y1 - 22, 12, 24);
      g.beginPath(); g.moveTo(x - 9, y1 - 22); g.lineTo(x, y1 - 40); g.lineTo(x + 9, y1 - 22); g.fill();
    }
  }
  // the great tree: a trunk and a big round crown of leaf clumps
  g.fillRect(cx - 14, deck - 150, 28, 60);
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, 1);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d * 120, deck - 205 + Math.sin(a) * d * 62, rng.range(26, 46), 0, TAU);
    g.fill();
  }
  return p.texture({ wrap: false });
}

export function buildCrossing(road: Road, camera: THREE.Camera, lowDetail: boolean) {
  const group = new THREE.Group();

  // ---------- rain ----------
  const rain = new Rain(lowDetail ? 450 : 800, 4711);
  rain.lines.renderOrder = 10001;
  (rain.lines.material as THREE.LineBasicMaterial).depthTest = false;
  group.add(rain.lines);

  // ---------- torn streaks of cloud rushing past: long thin cards along the direction of travel ----------
  const rng = new Rng(5309);
  const n = lowDetail ? 24 : 40;
  const geo = new THREE.PlaneGeometry(1, 1);
  const info = new Float32Array(n * 4);
  const wispU = {
    uAmount: { value: 0 }, uTime: { value: 0 }, uDir: { value: new THREE.Vector3(0, 0, -1) },
    uDark: { value: new THREE.Color(0x2c3340) }, uLight: { value: new THREE.Color(0x98a2b2) },
  };
  const wisps = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    uniforms: wispU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aInfo;
      uniform vec3 uDir;
      varying vec2 vUv; varying float vTone; varying float vSeed; varying float vFade;
      void main() {
        vec3 C = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 toCam = cameraPosition - C;
        float dist = length(toCam);
        vec3 tc = toCam / max(dist, 1e-3);
        // long along the direction of travel, turned about that line to face the camera
        vec3 cr = cross(uDir, tc);
        float cl = length(cr);
        vec3 across = cl > 1e-3 ? cr / cl : vec3(1.0, 0.0, 0.0);
        vec3 wp = C + uDir * position.y * aInfo.x + across * position.x * aInfo.y;
        // seen end-on (far ahead on the path's line) a streak would be a dot, so it fades; it also fades
        // in from the distance and out just before the camera reaches it
        vFade = (1.0 - smoothstep(0.8, 0.96, abs(dot(uDir, tc)))) * smoothstep(1.5, 6.0, dist) * (1.0 - smoothstep(40.0, 60.0, dist));
        vUv = uv; vTone = aInfo.z; vSeed = aInfo.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount; uniform float uTime; uniform vec3 uDark; uniform vec3 uLight;
      varying vec2 vUv; varying float vTone; varying float vSeed; varying float vFade;
      ${GLSL_NOISE}
      void main() {
        float across = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 1.5);
        float along = sin(3.14159 * clamp(vUv.y, 0.0, 1.0));
        float n = noise2(vec2(vUv.x * 3.0 + vSeed * 13.0, vUv.y * 9.0 + uTime * 2.0));
        float a = across * along * (0.45 + 0.55 * n) * uAmount * vFade * 0.6;
        gl_FragColor = vec4(mix(uDark, uLight, vTone), a);
      }
    `,
  }), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const z = rng.range(-1180, -1262), p = road.at(z);
    // never right in the camera's line: off to a side, or well above or below
    const lat = rng.sign() * rng.range(2.5, 18), up = rng.range(-6, 9);
    m.makeTranslation(p.x + p.rx * lat, p.y + 5 + up, p.z + p.rz * lat);
    wisps.setMatrixAt(i, m);
    // length, width, dark or light, pattern seed
    info.set([rng.range(10, 28), rng.range(0.5, 2.2), rng.chance(0.55) ? 0 : 1, rng.next()], i * 4);
  }
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  wisps.instanceMatrix.needsUpdate = true;
  wisps.frustumCulled = false;
  wisps.renderOrder = 10001;
  group.add(wisps);

  // ---------- the castle in the lightning ----------
  const castleMat = new THREE.MeshBasicMaterial({ map: castleSilhouette(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const castle = new THREE.Mesh(new THREE.PlaneGeometry(270, 270), castleMat);
  castle.position.set(ISLAND.x, ISLAND.y + 22, ISLAND.z);
  castle.renderOrder = 10002;
  castle.frustumCulled = false;
  castle.visible = false;
  group.add(castle);

  const camPos = new THREE.Vector3();
  return {
    group,
    /** how bright the storm's lightning is this frame (0..1.2) */
    flash: 0,
    /** `dir` is the direction of travel (flat, unit length) */
    update(dt: number, t: number, z: number, dir: THREE.Vector3, fx: ScreenFx) {
      camera.getWorldPosition(camPos);
      // the camera meets the outer face at z -1198: cover the screen just before, until the world's cover is full
      if (z > -1222) fx.wash(smoothstep(-1184, -1197, z), STORM_GREY);
      let f = 0;
      for (const [z0, a] of FLASHES) f = Math.max(f, a * flashAt(z, z0));
      this.flash = f;
      if (f > 0.01) fx.flash(f, 0xe2e8ff);
      const inside = smoothstep(-1176, -1194, z) * (1 - smoothstep(-1246, -1264, z));
      rain.intensity = inside;
      rain.update(dt, camPos);
      wispU.uAmount.value = smoothstep(-1180, -1194, z) * (1 - smoothstep(-1246, -1262, z));
      wispU.uTime.value = t;
      wispU.uDir.value.copy(dir);
      wisps.visible = wispU.uAmount.value > 0.01;
      const c = 0.9 * flashAt(z, CASTLE_Z);
      castle.visible = c > 0.01;
      castleMat.opacity = c;
      if (castle.visible) castle.rotation.y = Math.atan2(camPos.x - castle.position.x, camPos.z - castle.position.z);
    },
  };
}
