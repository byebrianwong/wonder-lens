import * as THREE from 'three';
import { clamp } from '../../engine/math';
import type { Card } from './layout';

/**
 * The film tricks of the Zubrowka Express, drawn over everything by one small sphere round the camera (like
 * `Lens` in ../amelie/lens.ts, which this extends). Each effect is worked out per pixel from the view
 * direction and the camera's field of view, so it fills the screen at any zoom:
 *
 *  iris     a circle that closes to black, as in an old film
 *  wash     a flat colour over the picture (a fade to white or black, sea water)
 *  splash   bubbles rising through the wash
 *  whip     the streaks of a whip pan (the world also swings the camera itself)
 *  curtain  a red velvet theatre curtain: two halves that meet in the middle, under a scalloped pelmet
 *  card     a title card (painted by `paintCard`)
 *  frame    black bars that narrow the picture to another aspect ratio (1.37 : 1 for the 1930s)
 *  flash    a flash of light; above 1 it blooms
 */
export class FilmLens {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    tanHalf: { value: Math.tan(THREE.MathUtils.degToRad(29)) },
    aspect: { value: 16 / 9 },
    time: { value: 0 },
    iris: { value: 2 },
    irisSoft: { value: 0.05 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    wash: { value: 0 },
    washColor: { value: new THREE.Color(0, 0, 0) },
    bubbles: { value: 0 },
    whip: { value: 0 },
    whipDir: { value: 1 },
    whipA: { value: new THREE.Color(1, 0.8, 0.8) },
    whipB: { value: new THREE.Color(1, 1, 0.9) },
    curtain: { value: 0 },
    curtainColor: { value: new THREE.Color(0x8a1020) },
    card: { value: 0 },
    cardMap: { value: null as THREE.Texture | null },
    cardAspect: { value: 16 / 9 },
    frameAspect: { value: 1.37 },
    frame: { value: 0 },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float tanHalf; uniform float aspect; uniform float time;
        uniform float iris; uniform float irisSoft;
        uniform float flash; uniform vec3 flashColor;
        uniform float wash; uniform vec3 washColor; uniform float bubbles;
        uniform float whip; uniform float whipDir; uniform vec3 whipA; uniform vec3 whipB;
        uniform float curtain; uniform vec3 curtainColor;
        uniform float card; uniform sampler2D cardMap; uniform float cardAspect;
        uniform float frameAspect; uniform float frame;
        varying vec3 vView;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        void main() {
          vec3 d = normalize(vView);
          float iz = max(-d.z, 0.001);
          // this pixel's place on the screen, -1..1 both ways
          vec2 ndc = vec2(d.x / iz / (tanHalf * aspect), d.y / iz / tanHalf);
          vec2 suv = ndc * 0.5 + 0.5;
          vec3 col = vec3(0.0);
          float a = 0.0;

          // wash, with bubbles rising through it
          if (wash > 0.001) {
            vec3 w = washColor;
            if (bubbles > 0.001) {
              // two layers of bubbles of different sizes rising at different speeds, wobbling as they go
              for (int L = 0; L < 2; L++) {
                float sc = L == 0 ? 6.0 : 13.0, sp = L == 0 ? 1.4 : 2.3;
                vec2 bp = vec2(suv.x * aspect * sc, suv.y * sc - time * sp);
                vec2 cell = floor(bp);
                float h = hash(cell + float(L) * 17.0);
                vec2 f = fract(bp) - 0.5;
                float r = 0.06 + 0.2 * hash(cell + 11.3);
                // keep each bubble, and its wobble, inside its own cell so none is cut off at a cell's edge
                float room = 0.46 - r;
                vec2 off = vec2(hash(cell + 3.1) - 0.5, hash(cell + 7.7) - 0.5) * 2.0 * room * 0.8;
                off.x += sin(time * 3.0 + h * 20.0) * room * 0.2;
                float d = length(f - off);
                float ring = smoothstep(r + 0.02, r - 0.01, d) * (0.35 + 0.65 * smoothstep(r * 0.55, r, d));
                float glint = smoothstep(r * 0.35, 0.0, length(f - off + vec2(r * 0.35, -r * 0.35)));
                w = mix(w, vec3(0.92, 0.98, 1.0), clamp(ring * 0.75 + glint, 0.0, 1.0) * step(0.62, h) * bubbles);
              }
              w *= 0.8 + 0.35 * suv.y;
            }
            col = w; a = wash;
          }

          // whip pan: long horizontal streaks, smeared in the direction of the swing
          if (whip > 0.001) {
            float n = noise(vec2(suv.x * 1.5 - time * 9.0 * whipDir, suv.y * 70.0));
            float n2 = noise(vec2(suv.x * 0.6 - time * 5.0 * whipDir, suv.y * 18.0 + 4.0));
            vec3 s = mix(whipA, whipB, smoothstep(0.2, 0.8, n2)) * (0.82 + 0.36 * n);
            col = mix(col, s, whip); a = max(a, whip);
          }

          // iris: black outside a shrinking circle
          float ang = acos(clamp(-d.z, -1.0, 1.0));
          float dark = smoothstep(iris, iris + irisSoft, ang);
          col = mix(col, vec3(0.0), dark); a = max(a, dark);

          // the theatre curtain
          if (curtain > 0.001) {
            float c = clamp(curtain, 0.0, 1.0);
            float sway = 0.025 * sin(suv.y * 7.0 + time * 0.8) * (1.0 - c * 0.6);
            // each half's leading edge, gathered into a curve towards the floor
            float edge = mix(1.18, 0.0, c) + sway + 0.05 * (1.0 - c) * (1.0 - suv.y) * (1.0 - suv.y);
            float ax = abs(ndc.x);
            if (ax > edge - 0.004) {
              // folds bunch up as the curtain is drawn back
              float k = (ax - edge) * mix(9.0, 4.5, c) * 6.2832;
              float fold = 0.5 + 0.5 * cos(k + suv.y * 0.6);
              float shade = 0.42 + 0.58 * pow(fold, 0.7);
              shade *= 0.72 + 0.28 * smoothstep(0.0, 0.9, suv.y);
              shade *= 1.0 - 0.35 * smoothstep(0.02, 0.0, ax - edge);
              vec3 cc = curtainColor * shade * 1.15 + vec3(0.05, 0.01, 0.0) * pow(fold, 6.0);
              col = cc; a = 1.0;
            }
            // the pelmet across the top, with a scalloped hem and a gold fringe
            float drop = 0.2 * c;
            float hem = 1.0 - drop - 0.035 * abs(sin(ndc.x * 6.0 * aspect));
            if (ndc.y > hem && drop > 0.001) {
              float swag = 0.6 + 0.4 * abs(sin(ndc.x * 6.0 * aspect));
              col = curtainColor * (0.7 + 0.35 * smoothstep(hem, 1.0, ndc.y)) * swag; a = 1.0;
            } else if (ndc.y > hem - 0.03 && drop > 0.001) {
              float tassel = step(0.5, fract(ndc.x * aspect * 40.0));
              col = mix(col, vec3(0.95, 0.72, 0.3) * (0.7 + 0.3 * tassel), c); a = max(a, c);
            }
          }

          // black bars for another aspect ratio
          if (frame > 0.001) {
            if (frameAspect < aspect) {
              float hw = mix(1.0, frameAspect / aspect, frame);
              float bar = step(hw, abs(ndc.x));
              col = mix(col, vec3(0.0), bar); a = max(a, bar);
            } else {
              float hh = mix(1.0, aspect / frameAspect, frame);
              float bar = step(hh, abs(ndc.y));
              col = mix(col, vec3(0.0), bar); a = max(a, bar);
            }
          }

          // the title card, its height filling the screen
          if (card > 0.001) {
            vec2 cuv = vec2(ndc.x * aspect / cardAspect * 0.5 + 0.5, suv.y);
            vec3 cc = texture2D(cardMap, clamp(cuv, vec2(0.001), vec2(0.999))).rgb;
            col = mix(col, cc, card); a = max(a, card);
          }

          col = mix(col, flashColor * 2.4, flash);
          a = max(a, clamp(flash, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat);
    this.mesh.renderOrder = 10000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Follow the camera's field of view and shape (call every frame, before `set`). */
  fit(camera: THREE.PerspectiveCamera, time: number) {
    this.uniforms.tanHalf.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    this.uniforms.aspect.value = camera.aspect;
    this.uniforms.time.value = time;
  }

  /** Set the effects for this frame. iris: 1 open .. 0 closed; everything else 0 off .. 1 full. */
  set(o: {
    iris?: number; flash?: number; flashColor?: THREE.ColorRepresentation;
    wash?: number; washColor?: THREE.ColorRepresentation; bubbles?: number;
    whip?: number; whipDir?: number; whipA?: THREE.ColorRepresentation; whipB?: THREE.ColorRepresentation;
    curtain?: number; card?: number; cardMap?: THREE.Texture | null; frame?: number; frameAspect?: number;
  }) {
    const u = this.uniforms;
    const open = clamp(o.iris ?? 1, 0, 1);
    u.iris.value = open >= 0.999 ? 2 : -0.06 + Math.pow(open, 1.4) * 1.1;
    u.flash.value = clamp(o.flash ?? 0, 0, 1.5);
    if (o.flashColor !== undefined) u.flashColor.value.set(o.flashColor);
    u.wash.value = clamp(o.wash ?? 0, 0, 1);
    if (o.washColor !== undefined) u.washColor.value.set(o.washColor);
    u.bubbles.value = clamp(o.bubbles ?? 0, 0, 1);
    u.whip.value = clamp(o.whip ?? 0, 0, 1);
    if (o.whipDir !== undefined) u.whipDir.value = o.whipDir;
    if (o.whipA !== undefined) u.whipA.value.set(o.whipA);
    if (o.whipB !== undefined) u.whipB.value.set(o.whipB);
    u.curtain.value = clamp(o.curtain ?? 0, 0, 1);
    u.card.value = o.cardMap ? clamp(o.card ?? 0, 0, 1) : 0;
    if (o.cardMap) {
      u.cardMap.value = o.cardMap;
      const img = o.cardMap.image as { width: number; height: number } | undefined;
      if (img) u.cardAspect.value = img.width / img.height;
    }
    u.frame.value = clamp(o.frame ?? 0, 0, 1);
    if (o.frameAspect !== undefined) u.frameAspect.value = o.frameAspect;
    this.mesh.visible = open < 0.999 || u.flash.value > 0.002 || u.wash.value > 0.002 || u.whip.value > 0.002 || u.curtain.value > 0.002 || u.card.value > 0.002 || u.frame.value > 0.002;
  }
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** A typeface like the films' (Futura), with fallbacks for machines that lack it. */
export const FUTURA = 'Futura, "Futura PT", "Century Gothic", "Avenir Next", Avenir, Montserrat, "Trebuchet MS", sans-serif';

/** Draw text with extra space between the letters, centred on x. */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  g.textAlign = 'left';
  chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
  return total;
}

const cardCache = new Map<string, THREE.CanvasTexture>();
/**
 * A title card in the films' manner: centred, symmetrical, a flat colour with a thin double border, a small
 * letter-spaced line above a large title in capitals and an optional line in italics below.
 */
export function paintCard(card: Card): THREE.CanvasTexture {
  const key = `${card.kicker}|${card.title}|${card.sub}|${card.bg}|${card.fg}`;
  const hit = cardCache.get(key);
  if (hit) return hit;
  const W = 1280, H = 720;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const fg = hex(card.fg);
  g.fillStyle = hex(card.bg); g.fillRect(0, 0, W, H);
  // a faint paper grain
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = fg; g.lineWidth = 3;
  g.strokeRect(150, 150, W - 300, H - 300);
  g.lineWidth = 1.2;
  g.strokeRect(162, 162, W - 324, H - 324);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  const hasSub = !!card.sub;
  const cy = hasSub ? H / 2 + 4 : H / 2 + 18;
  g.font = `500 30px ${FUTURA}`;
  const kw = spaced(g, card.kicker.toUpperCase(), W / 2, cy - 84, 9);
  // short rules either side of the kicker
  g.fillRect(W / 2 - kw / 2 - 64, cy - 85, 44, 2); g.fillRect(W / 2 + kw / 2 + 20, cy - 85, 44, 2);
  let size = 84;
  g.font = `bold ${size}px ${FUTURA}`;
  const title = card.title.toUpperCase();
  const fit = () => { const ch = [...title]; return ch.reduce((s, x) => s + g.measureText(x).width, 0) + 6 * (ch.length - 1); };
  while (fit() > W - 400 && size > 40) { size -= 4; g.font = `bold ${size}px ${FUTURA}`; }
  spaced(g, title, W / 2, cy, 6);
  if (hasSub) {
    g.font = `italic 34px Georgia, "Times New Roman", serif`;
    g.textAlign = 'center';
    g.fillText(card.sub!, W / 2, cy + 86);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  cardCache.set(key, tex);
  return tex;
}
