import * as THREE from 'three';

/**
 * Gradient sky dome with a soft sun, moon and procedural stars.
 * The mesh follows the camera so it always fills the background.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms: {
    topColor: { value: THREE.Color };
    midColor: { value: THREE.Color };
    bottomColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    horizonHeight: { value: number };
    sunDir: { value: THREE.Vector3 };
    sunColor: { value: THREE.Color };
    sunSize: { value: number };
    sunGlow: { value: number };
    moonDir: { value: THREE.Vector3 };
    moonAmount: { value: number };
    starAmount: { value: number };
    time: { value: number };
  };

  constructor(radius = 1200) {
    this.uniforms = {
      topColor: { value: new THREE.Color(0x4a7bd0) },
      midColor: { value: new THREE.Color(0x9ec7f2) },
      bottomColor: { value: new THREE.Color(0xf6e3c8) },
      horizonColor: { value: new THREE.Color(0xf6e3c8) },
      horizonHeight: { value: 0.08 },
      sunDir: { value: new THREE.Vector3(0.3, 0.4, -0.8).normalize() },
      sunColor: { value: new THREE.Color(0xfff2d0) },
      sunSize: { value: 0.02 },
      sunGlow: { value: 0.6 },
      moonDir: { value: new THREE.Vector3(-0.4, 0.5, -0.7).normalize() },
      moonAmount: { value: 0 },
      starAmount: { value: 0 },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor; uniform vec3 horizonColor; uniform float horizonHeight;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; uniform float sunGlow;
        uniform vec3 moonDir; uniform float moonAmount; uniform float starAmount; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          // three-stop gradient, denser near the horizon
          float t1 = smoothstep(-0.05, 0.25, h);
          float t2 = smoothstep(0.2, 0.85, h);
          vec3 c = mix(bottomColor, midColor, t1);
          c = mix(c, topColor, t2);
          // fog band hides the seam where distant ground meets the sky
          c = mix(horizonColor, c, smoothstep(-0.02, horizonHeight, h));
          // sun
          float sd = dot(d, sunDir);
          float ss = max(sunSize, 0.0015);
          float disc = smoothstep(1.0 - ss, 1.0 - ss * 0.55, sd) * step(0.0001, sunSize);
          float glow = pow(max(sd, 0.0), 6.0) * sunGlow;
          float halo = pow(max(sd, 0.0), 40.0) * sunGlow * 0.8;
          c += sunColor * (glow * 0.35 + halo * 0.6);
          c = mix(c, sunColor * 1.6, disc);
          // moon
          float md = dot(d, moonDir);
          float mdisc = smoothstep(0.9975, 0.9985, md) * moonAmount;
          float mglow = pow(max(md, 0.0), 30.0) * moonAmount * 0.35;
          c += vec3(0.85, 0.9, 1.0) * mglow;
          c = mix(c, vec3(1.0, 0.98, 0.9) * 1.5, mdisc);
          // stars: cell hash on the direction
          if (starAmount > 0.001 && h > -0.02) {
            vec3 sp = floor(d * 180.0);
            float hs = hash(sp);
            float star = step(0.9935, hs);
            vec3 cell = fract(d * 180.0) - 0.5;
            float r = length(cell);
            float pt = smoothstep(0.22, 0.02, r);
            float tw = 0.65 + 0.35 * sin(time * (1.5 + hs * 3.0) + hs * 40.0);
            c += star * pt * tw * starAmount * smoothstep(0.0, 0.25, h) * vec3(0.9, 0.95, 1.0);
          }
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  update(cameraPos: THREE.Vector3, time: number) {
    this.mesh.position.copy(cameraPos);
    this.uniforms.time.value = time;
  }
}
