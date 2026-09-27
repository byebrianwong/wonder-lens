import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Vignette + grain + colour grade, applied after bloom while still in linear HDR. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.35 },
    grain: { value: 0.035 },
    saturation: { value: 1.05 },
    tint: { value: new THREE.Color(1, 1, 1) },
    lift: { value: 0.0 },
    time: { value: 0 },
    flash: { value: 0 },
    fade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float grain; uniform float saturation;
    uniform vec3 tint; uniform float lift; uniform float time; uniform float flash; uniform float fade;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint + lift;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      vec2 q = vUv - 0.5;
      float v = 1.0 - smoothstep(0.35, 1.05, length(q) * 1.35);
      col *= mix(1.0, v, vignette);
      float g = (hash(vUv * vec2(1920.0, 1080.0) + fract(time * 13.7)) - 0.5) * grain;
      col += g;
      col = mix(col, vec3(1.0), flash);
      col = mix(col, vec3(0.0), fade);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

/**
 * Runs right after the scene render, while depth is still available:
 * clears NaN / negative pixels (one bad fragment would otherwise blacken the whole frame through bloom)
 * and darkens the ground under slowly drifting cloud shadows, found by rebuilding world positions from depth.
 */
const SceneFxShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    projInv: { value: new THREE.Matrix4() },
    camWorld: { value: new THREE.Matrix4() },
    time: { value: 0 },
    cloudShadow: { value: 0 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 projInv; uniform mat4 camWorld;
    uniform float time; uniform float cloudShadow; uniform vec3 sunDir;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      vec3 col = clamp(c.rgb, vec3(0.0), vec3(64.0));
      if (cloudShadow > 0.001) {
        float d = texture2D(tDepth, vUv).r;
        if (d < 0.99999) {
          vec4 v = projInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec3 wp = (camWorld * vec4(v.xyz / v.w, 1.0)).xyz;
          // project along the sun so shadows fall where the light comes from; drift with the wind
          vec2 p = (wp.xz - sunDir.xz / max(sunDir.y, 0.2) * wp.y) * 0.0065 + vec2(time * 0.006, time * 0.0025);
          float n = noise(p) * 0.6 + noise(p * 2.1 + 5.3) * 0.3 + noise(p * 4.7 - 2.1) * 0.1;
          float sh = smoothstep(0.52, 0.66, n) * cloudShadow;
          col *= mix(vec3(1.0), vec3(0.7, 0.74, 0.86), sh);
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

class SceneFxPass extends ShaderPass {
  camera: THREE.Camera | null = null;
  constructor() { super(SceneFxShader); }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    if (this.camera) {
      (this.uniforms.projInv.value as THREE.Matrix4).copy((this.camera as THREE.PerspectiveCamera).projectionMatrixInverse);
      (this.uniforms.camWorld.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

export interface RendererOptions {
  /** Draw at this size in CSS pixels. Without it the renderer fills the window and follows resizes. */
  size?: { width: number; height: number };
  /** Use this pixel ratio instead of the screen's. */
  pixelRatio?: number;
  /** Keep the last frame in the canvas after it is shown, so it can be read back or screenshotted. */
  preserveDrawingBuffer?: boolean;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  readonly fx: SceneFxPass;
  readonly renderPass: RenderPass;
  readonly canvas: HTMLCanvasElement;
  private pixelRatio: number;
  private w = 1;
  private h = 1;
  /** rolling frame-time estimate for the quality governor */
  private frameAvg = 16;
  private governorCooldown = 0;
  maxPixelRatio: number;
  private fixedSize: RendererOptions['size'];
  private onResize = () => this.resize();

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.fixedSize = opts.size;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = opts.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.fx = new SceneFxPass();
    this.composer.addPass(this.fx);
    // threshold sits just under 1.0 so plain white surfaces stay clean and only emissive "glow" materials bloom
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.55, 0.97);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize();
    if (!this.fixedSize) window.addEventListener('resize', this.onResize);
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.fx.camera = camera;
  }

  resize() {
    this.w = this.fixedSize?.width ?? window.innerWidth;
    this.h = this.fixedSize?.height ?? window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.w, this.h);
    const cam = this.renderPass.camera as THREE.PerspectiveCamera;
    if (cam && cam.isPerspectiveCamera) {
      cam.aspect = this.w / this.h;
      cam.updateProjectionMatrix();
    }
  }

  get aspect() { return this.w / this.h; }

  /** Lower the pixel ratio if frames are consistently slow; raise it back when there is headroom. */
  govern(dtMs: number) {
    this.frameAvg = this.frameAvg * 0.95 + dtMs * 0.05;
    this.governorCooldown -= dtMs;
    if (this.governorCooldown > 0) return;
    if (this.frameAvg > 20 && this.pixelRatio > 0.7) {
      this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.25);
      this.governorCooldown = 2500;
      this.resize();
    } else if (this.frameAvg < 13.5 && this.pixelRatio < this.maxPixelRatio) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
      this.governorCooldown = 4000;
      this.resize();
    }
  }

  render(time: number) {
    this.grade.uniforms.time.value = time;
    this.fx.uniforms.time.value = time;
    this.composer.render();
  }

  /** Free the GPU resources. The game never calls this; Storybook does, because a page can hold only a few WebGL contexts. */
  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.bloom.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
