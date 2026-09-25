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

/** Clears NaN / negative pixels before bloom; one bad fragment would otherwise blacken the whole frame. */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, vec3(0.0), vec3(64.0)), 1.0);
    }
  `,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  readonly renderPass: RenderPass;
  readonly canvas: HTMLCanvasElement;
  private pixelRatio: number;
  private w = 1;
  private h = 1;
  /** rolling frame-time estimate for the quality governor */
  private frameAvg = 16;
  private governorCooldown = 0;
  maxPixelRatio: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    // threshold sits just under 1.0 so plain white surfaces stay clean and only emissive "glow" materials bloom
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.55, 0.97);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
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
    if (this.frameAvg > 24 && this.pixelRatio > 0.7) {
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
    this.composer.render();
  }
}
