# Building a world for Window Seat

Window Seat is an on-rails 3D photo ride (Pokémon Snap style) built with Vite + TypeScript + three.js.
Every asset is procedural: geometry from primitives, textures from canvas, audio synthesised. No external files.

## Where things live
- `src/engine/` — renderer, input, audio, sky, particles, `Builders.ts` (geometry helpers). Do not edit these from a world.
- `src/game/` — `types.ts` (the `WorldDef` / `BuiltWorld` contracts), `Subject.ts` (photographable things), `lighting.ts` (keyframes), `Game.ts` (the loop). Do not edit these from a world.
- `src/worlds/<id>/` — one folder per world. The Ghibli world (`src/worlds/ghibli/`) is the reference implementation:
  `GhibliWorld.ts` (assembly + subjects + lighting), `environment.ts` (buildings, props, vehicle), `characters.ts` (animated figures).

## The contract (see `src/game/types.ts`)
`WorldDef` = menu metadata + `build(ctx) => BuiltWorld`. `BuiltWorld` supplies:
- `scene`, `curve` (a `CatmullRomCurve3`; the ride moves along it, generally in the -z direction), `speed` (units/s; ~10 gives a 3-4 minute ride for ~2300 units),
- `vehicle` (a `Group` the ride moves and orients; its local +z is the direction of travel) and `cameraAnchor` (child of the vehicle, `rotation.y = Math.PI` so the camera looks forward; place it ~2.3 above the track),
- `subjects` (array of `Subject`), `occluders` (large meshes that can hide subjects: terrain, big buildings),
- `sky` (`new Sky(1400)` added to the scene), `sun` (a `DirectionalLight` with `castShadow`, plus `scene.add(sun.target)`), `hemi` (`HemisphereLight`),
- `lighting` (use `makeLighting([...keys])` from `src/game/lighting.ts`; keyed on ride progress `u` in 0..1; the game applies sky colours, fog, sun, hemi, exposure, bloom, saturation, sun glow),
- `env(u)` (audio levels: wind, sea, rain, birds, crickets), `ambience` (an `AmbienceProfile`: musical root/scale/chords, melody voice `musicbox | pluck | accordion | vibes | piano`, vehicle sound `train | moped | none`),
- `groundHeight(x, z)`, `waterLevel`, `makeProjectile()` (the thrown item mesh), `captions` ([u, text] story beats), `update(dt, ride)`, `onItemLand(pos)`, `onCall(pos, ride)`, `dispose()`.
- `scene.fog` must be a `THREE.FogExp2` (the game writes colour/density into it). Shader materials (water/grass) need fog uniforms updated in `update`.

## Subjects
`new Subject({ id, name, from, group, radius, base, rarity, hint, poses, centerOffset, facing, onItem, onCall, update, maxDistance, reactRange })`.
- `base` points: landmarks 300-900, characters 500-1500 (legendary ~1300-1500).
- `poses`: named special moments with a score multiplier (1.4-2.0) and a label shown on the photo card. Trigger with `subject.setPose('name', seconds)` from `onItem`/`onCall`/scripted moments.
- `onItem(pos, dist)` fires when a thrown item lands within `reactRange` (default 14). `onCall(dist)` fires for subjects within 90 units of the camera. Return `true` if the subject reacted.
- Toggle `subject.active` (and `group.visible`) for subjects that only exist in part of the ride, so they are not scored or tagged elsewhere.
- Characters face local +z. Use `group.lookAt(target)` to orient. For "facing the camera" bonus supply `facing: () => forwardVector`.

## Building blocks (`src/engine/Builders.ts`)
`toon(color)`, `lambert(color)`, `glow(color, intensity)` (emissive-looking, blooms), `sphere/box/cyl/cone/capsule/ellipsoid(...)`, `roofGeometry`, `pagodaRoofGeometry`, `canvasTexture(w, h, draw)`, `facadeTextures({...})` (walls with windows + emissive map), `textTexture`, `PathField` (distance to the track, for flattening terrain), `buildTerrain({...})` (chunked heightfield with vertex colours), `buildTrack(curve, opts)` (rails + sleepers), `ribbonGeometry(curve, width, segs)` (roads, canals), `waterMaterial({...})`, `treeGeometry/instancedTrees(style, placements)`, `instanced(geo, mat, placements, colorFn)`, `grassField(placements, opts)`, `cloudField(rng, placements)`, `scatter(...)`, `hills(x, z)`.
Particles (`src/engine/Particles.ts`): `Puffs` (bursts), `Drift` (drifting sprites: petals, snow, dust, fireflies), `Rain`.
Deterministic randomness: `new Rng(seed)` from `src/engine/math.ts` (`range`, `int`, `pick`, `chance`, `sign`), `fbm`/`noise2`.

## Gotchas learned the hard way
- `group.add(mesh)` returns the GROUP. Never write `g.add(mesh(...)).rotation.x = ...`; make the mesh, rotate it, then add.
- `Object3D.position` is read-only; use `.position.set(...)`, never `Object.assign(obj, { position })`.
- Any NaN in a fragment shader blackens the whole frame through bloom. Use `clamp(x, 0.0, 1.0)` before `pow`, never `smoothstep(a, a, x)`.
- Keep triangle counts sane: instanced meshes for trees/props, merged geometry for clouds, `SphereGeometry(r, 14, 10)` style segment counts. Target 60 fps on a laptop.
- Only a few `PointLight`s per world (2-6), placed at hero spots.
- Every mesh near the camera at the start should look good: the vehicle is always in frame.
- The camera can look ±150° yaw and -55°/+65° pitch: put things behind and above the rider too.
- Type-check with `npx tsc --noEmit -p .` before finishing. Do not run the dev server or a browser; the integrator does visual QA.
