import * as THREE from 'three';

/*
 * Night water for the flooded rice fields. Each paddy is a flat pane of still water with young rice standing
 * in it in rows. The water mirrors the night sky: the sky's colours, the stars, the dark line of the hills
 * round the valley and a soft sheen towards the moon. The moon itself never shows as a mirror image (on
 * nearly flat water, seen at a low angle, that smears into a whole bright field); instead tiny patches of
 * water, each tipped a little at random, flash it at the eye as a narrow path of glittering specks. Nothing
 * from the moon gets bright enough to bloom. Lit windows and lamps nearby leave warm streaks on the water.
 *
 * Every paddy vertex carries `aCell`: x the direction the rice rows run (radians), y how much rice is
 * planted (0 a bare mirror, 1 a full field), z a tint (-1..1) and w a random number.
 */

export const MAX_LAMPS = 8;

export interface PaddyWater {
  material: THREE.ShaderMaterial;
  uniforms: {
    uTime: { value: number };
    uSkyTop: { value: THREE.Color };
    uSkyMid: { value: THREE.Color };
    uHorizon: { value: THREE.Color };
    uMoonDir: { value: THREE.Vector3 };
    uMoonAmount: { value: number };
    uStars: { value: number };
    uFogColor: { value: THREE.Color };
    uFogDensity: { value: number };
    uLamps: { value: THREE.Vector4[] };
    uLampColor: { value: THREE.Color };
    uMud: { value: THREE.Color };
    uRice: { value: THREE.Color };
  };
}

export function paddyWater(): PaddyWater {
  const uniforms: PaddyWater['uniforms'] = {
    uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color(0x081430) },
    uSkyMid: { value: new THREE.Color(0x182c56) },
    uHorizon: { value: new THREE.Color(0x1a2c44) },
    uMoonDir: { value: new THREE.Vector3(-0.25, 0.32, -0.92).normalize() },
    uMoonAmount: { value: 1 },
    uStars: { value: 1 },
    uFogColor: { value: new THREE.Color(0x1a2c44) },
    uFogDensity: { value: 0.004 },
    uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uLampColor: { value: new THREE.Color(0xffc070) },
    uMud: { value: new THREE.Color(0x0c0f0a) },
    uRice: { value: new THREE.Color(0x1f3a1c) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aCell;
      varying vec3 vWorld; varying float vFogDepth; varying vec4 vCell;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vCell = aCell;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSkyTop; uniform vec3 uSkyMid; uniform vec3 uHorizon;
      uniform vec3 uMoonDir; uniform float uMoonAmount; uniform float uStars;
      uniform vec3 uFogColor; uniform float uFogDensity;
      uniform vec4 uLamps[${MAX_LAMPS}]; uniform vec3 uLampColor;
      uniform vec3 uMud; uniform vec3 uRice;
      varying vec3 vWorld; varying float vFogDepth; varying vec4 vCell;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      // a light breeze over still water: two slow layers of ripples
      float ripple(vec2 p) {
        return noise(p * 0.7 + vec2(uTime * 0.28, uTime * 0.15)) * 0.6 + noise(p * 1.9 - vec2(uTime * 0.2, -uTime * 0.31)) * 0.4;
      }

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec2 p = vWorld.xz;

        // ---- the surface normal: still water with a slow, faint ripple ----
        float e = 0.15;
        float r0 = ripple(p), rx = ripple(p + vec2(e, 0.0)), rz = ripple(p + vec2(0.0, e));
        float amp = 0.05 * (1.0 - smoothstep(40.0, 260.0, dist));
        vec3 n = normalize(vec3(-(rx - r0) / e * amp, 1.0, -(rz - r0) / e * amp));

        // ---- the mirrored sky ----
        vec3 R = reflect(-V, n);
        float ry = R.y;
        vec3 sky = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.3, ry));
        sky = mix(sky, uSkyTop, smoothstep(0.25, 0.9, ry));
        // stars, the same way the sky dome draws them
        vec3 sc = floor(R * 180.0);
        float hs = hash3(sc);
        float star = step(0.9935, hs) * (1.0 - smoothstep(0.02, 0.22, length(fract(R * 180.0) - 0.5)));
        star *= 0.65 + 0.35 * sin(uTime * (1.5 + hs * 3.0) + hs * 40.0);
        sky += star * uStars * smoothstep(0.03, 0.25, ry) * vec3(0.8, 0.86, 0.95);
        // a soft sheen towards the moon (no mirror image of its disc)
        float md = clamp(dot(R, uMoonDir), 0.0, 1.0);
        sky += vec3(0.6, 0.68, 0.82) * (pow(md, 8.0) * 0.05 + pow(md, 50.0) * 0.06) * uMoonAmount;
        // the hills and woods round the valley, mirrored as a dark ragged band above the horizon
        float az = atan(R.x, R.z);
        float ridge = 0.06 + 0.045 * noise(vec2(az * 3.0 + 1.3, 1.7)) + 0.025 * noise(vec2(az * 11.0, 4.1));
        float hill = 1.0 - smoothstep(ridge - 0.01, ridge + 0.004, ry);
        sky = mix(sky, uFogColor * 0.42 + uMud * 0.5, hill);

        // ---- moon glitter ----
        // The water is cut into little cells (0.4 across). Each is a facet tipped a little at random, and
        // tipped again a few times a second. Where a facet throws the moon at the eye, a small dot in the
        // middle of its cell lights up. Seen at a low angle a dot is squashed into a short streak, and the
        // facets that can catch the moon lie along a narrow path towards it. Cells smaller than a pixel (far
        // off) fade out rather than flicker.
        vec2 cp = p / 0.4;
        vec2 ci = floor(cp), cf = fract(cp) - 0.5;
        float tick = floor(uTime * 2.5 + hash(ci) * 9.0);
        vec2 tilt = vec2(hash(ci + vec2(tick * 1.37, 3.1)), hash(ci.yx + vec2(5.7, tick * 2.11))) - 0.5;
        // tipped less from side to side than front to back, so the path stays narrow
        vec3 nF = normalize(n + vec3(tilt.x * 0.12, 0.0, tilt.y * 0.26));
        float mf = clamp(dot(reflect(-V, nF), uMoonDir), 0.0, 1.0);
        float dotMask = 1.0 - smoothstep(0.1, 0.24, length(cf));
        float tiny = 1.0 - smoothstep(0.6, 1.4, max(fwidth(cp.x), fwidth(cp.y)));
        float glint = pow(mf, 600.0) * dotMask * tiny * uMoonAmount * (1.0 - hill);

        // ---- water colour: dark mud below, the sky on top, more sky at a glancing angle ----
        float fres = 0.38 + 0.62 * pow(clamp(1.0 - dot(V, n), 0.0, 1.0), 4.0);
        vec3 mud = uMud * (1.0 + vCell.z * 0.25);
        vec3 water = mix(mud, sky, clamp(fres * (0.94 - vCell.z * 0.05), 0.0, 1.0));
        water += vec3(0.85, 0.85, 0.8) * min(glint, 1.0);
        // nothing on the water from the moon or the sky may bloom
        water = min(water, vec3(0.88));

        // ---- lamps: a warm streak on the water from below each light towards the eye ----
        vec2 cam = cameraPosition.xz;
        vec3 lamp = vec3(0.0);
        for (int i = 0; i < ${MAX_LAMPS}; i++) {
          vec4 L = uLamps[i];
          if (L.w <= 0.0) continue;
          vec2 foot = L.xz;
          vec2 toC = cam - foot;
          float len = length(toC);
          vec2 dir = toC / max(len, 0.001);
          vec2 d = p - foot;
          float along = dot(d, dir);
          float across = abs(dot(d, vec2(-dir.y, dir.x)));
          float reach = L.y * 2.6 + len * 0.1;
          float wdt = 0.25 + along * 0.03;
          float streak = exp(-across * across / (wdt * wdt)) * smoothstep(-0.8, 0.6, along) * (1.0 - smoothstep(reach * 0.35, reach, along));
          float broken = smoothstep(0.3, 0.75, noise(vec2(along * 1.8 - uTime * 1.2, across * 2.5 + float(i))));
          lamp += uLampColor * L.w * streak * (0.3 + 1.2 * broken);
        }
        water += min(lamp, vec3(0.8));

        // ---- young rice in rows: little clumps standing in the water ----
        float ang = vCell.x;
        vec2 rd = vec2(cos(ang), sin(ang));
        vec2 q = vec2(dot(p, rd), dot(p, vec2(-rd.y, rd.x)));
        vec2 sp = vec2(0.5, 0.72);
        vec2 f = (fract(q / sp + vCell.w) - 0.5) * sp;
        float clump = 1.0 - smoothstep(0.09, 0.16, length(f * vec2(1.0, 1.25)));
        // far away the clumps blur into an even green; seen at a glancing angle the shoots hide more water
        float fw = fwidth(q.x) + fwidth(q.y);
        float far = smoothstep(0.06, 0.3, fw);
        float cover = mix(clump, 0.11, far) + 0.45 * pow(clamp(1.0 - V.y, 0.0, 1.0), 7.0);
        cover = clamp(cover * vCell.y, 0.0, 0.85);
        // the shoots catch a little moonlight on their tops
        vec2 fn = f / max(length(f), 0.001);
        vec2 moonXZ = uMoonDir.xz / max(length(uMoonDir.xz), 0.001);
        float lit = 0.75 + 0.5 * clamp(dot(fn, -moonXZ), 0.0, 1.0) * (1.0 - far);
        vec3 rice = uRice * lit * (1.0 + vCell.z * 0.12);
        vec3 col = mix(water, rice, cover);

        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return { material, uniforms };
}
