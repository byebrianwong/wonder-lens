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
- `onItem(pos, dist)` fires when a thrown item lands within `reactRange` (default 14), or with `dist` 0 when the item strikes the subject in mid-air. `onCall(dist)` fires for subjects within 90 units of the camera. Return `true` if the subject reacted. After reacting to an item a subject ignores items for 1.2 s, so a quick second throw does not restart its animation.
- Throws are aimed for the player. If a subject with `onItem` is near the reticle and within 80 units, the item follows the arc that reaches it, leading it if it moves. Otherwise the item lands on the ground, water or large scenery under the reticle. So `radius` matters: it sets how easy the subject is to aim at and the sphere a thrown item hits.
- `crowd: true` is for a group spread over an area (a flock, a school, a troop): items aimed at it come down on the ground among them (the height of the group's origin, so a deck or platform works) and never hit them in mid-air.
- `swallows: true` makes an item that hits the subject disappear instead of bouncing off.
- Toggle `subject.active` (and `group.visible`) for subjects that only exist in part of the ride, so they are not scored or tagged elsewhere.
- Characters face local +z. Use `group.lookAt(target)` to orient. For "facing the camera" bonus supply `facing: () => forwardVector`.

## Building blocks (`src/engine/Builders.ts`)
`toon(color)`, `lambert(color)`, `glow(color, intensity)` (emissive-looking, blooms), `sphere/box/cyl/cone/capsule/ellipsoid(...)`, `roofGeometry`, `pagodaRoofGeometry`, `canvasTexture(w, h, draw)`, `facadeTextures({...})` (walls with windows + emissive map), `textTexture`, `PathField` (distance to the track, for flattening terrain), `buildTerrain({...})` (chunked heightfield with vertex colours), `buildTrack(curve, opts)` (rails + sleepers), `ribbonGeometry(curve, width, segs)` (roads, canals), `waterMaterial({...})`, `treeGeometry/instancedTrees(style, placements)`, `instanced(geo, mat, placements, colorFn)`, `grassField(placements, opts)`, `cloudField(rng, placements)`, `scatter(...)`, `hills(x, z)`.
Particles (`src/engine/Particles.ts`): `Puffs` (bursts), `Drift` (drifting sprites: petals, snow, dust, fireflies), `Rain`.

Higher-quality building blocks (used by the Ghibli world; any world can use them):
- `HeightGrid` (`src/engine/HeightGrid.ts`): samples your height function once on the terrain grid. Pass `height: (x, z) => grid.sample(x, z)` to `buildTerrain` and place everything with `grid.sample`, so objects sit exactly on the visible ground. `grid.texture()` gives shaders the same heights.
- `GrassField` (`src/engine/Grass.ts`): dense wind-blown grass drawn only around the camera. You give it a `sample(x, z, out)` function that returns colour, density (0 = none) and height. Use an `ExclusionMask` to keep grass off roads, floors and buildings.
- `ExclusionMask`, `paintedDetailTexture`, `addGroundDetail` (`src/engine/Ground.ts`): a 2D mask you draw rectangles, circles and paths into; a painterly ground texture; and a shader patch that adds that texture (and optional dirt lanes from a mask) to a terrain material.
- `fluffyForest`, `fluffyTree`, `flowerField` (`src/engine/Foliage.ts`): trees whose canopies are made of camera-facing leaf cards, and meadow flowers. Forests are split into stretches along z so off-screen trees are skipped.
- `CumulusField` (`src/engine/Clouds.ts`): large soft clouds. Call `update(sky.uniforms, fog, sun.intensity)` every frame.
- `SeaMaterial` (`src/engine/Water.ts`): water that reads the terrain height to show shallows, shore foam, sky reflection and sun glitter. Call `update(...)` every frame.
- `buildDetailedTrack` and `mergeStatic` (`src/engine/Builders.ts`): a track with a gravel bed and shaped rails; and a helper that merges a static prop's meshes into one mesh per material, which cuts draw calls a lot.
- Lighting keys accept `cloudShadow` (0..1): soft cloud shadows that drift over the ground (drawn in a post pass from the depth buffer).
- Painted characters and props (`src/engine/Paint.ts`):
  - `charToon({ map, color, rim, shade, ... })` is a cel-shaded material for characters. Its shadow side is a cool violet instead of grey, and it adds a thin rim of light on the silhouette that is strongest when the sun is behind the character.
  - `Painter` paints canvas textures: gradients, soft blotches, brushed fur strokes, fine lines. `painter.at([x, y, z], draw)` draws at the point where a direction meets a sphere, so you can paint faces and markings straight onto a sphere's texture.
  - `boxUV(geo, scale)` and `repeatUV(geo, u, v)` make a tiling texture keep the same size on every box face or cylinder, instead of stretching.
  - UV layouts: on spheres and capsules the front (+z) is a quarter of the way across the texture; on cylinders and cones it is at the left edge. The top of the shape is the top of the canvas.
  - The Ghibli painters in `src/worlds/ghibli/characterTextures.ts` (fur, anime faces, hair, cloth, scales, stone) and `propTextures.ts` (train panels, deck boards, bark, granite) are examples to copy.
- Character gallery (dev only): with the dev server running, open `/gallery.html`. It shows one Ghibli character (or the sea train) at a time under the ride's own lighting presets; drag to orbit, wheel to zoom. From the console, `view('catbus', { u: 0.4, yaw: 0.6, dist: 14 })` frames a character and `advance(2)` steps the animation when the tab is in the background.
Deterministic randomness: `new Rng(seed)` from `src/engine/math.ts` (`range`, `int`, `pick`, `chance`, `sign`), `fbm`/`noise2`.

## Gotchas learned the hard way
- `group.add(mesh)` returns the GROUP. Never write `g.add(mesh(...)).rotation.x = ...`; make the mesh, rotate it, then add.
- `Object3D.position` is read-only; use `.position.set(...)`, never `Object.assign(obj, { position })`.
- Any NaN in a fragment shader blackens the whole frame through bloom. Use `clamp(x, 0.0, 1.0)` before `pow`, never `smoothstep(a, a, x)`.
- Keep triangle counts sane: instanced meshes for trees/props, merged geometry for clouds, `SphereGeometry(r, 14, 10)` style segment counts. Target 60 fps on a laptop.
- Draw calls matter as much as triangles. A prop built from 40 primitives is 40 draw calls (80 with shadows) until you run it through `mergeStatic`. One big instanced mesh that spans the whole ride is never culled; split it into stretches along z.
- Only a few `PointLight`s per world (2-6), placed at hero spots.
- Every mesh near the camera at the start should look good: the vehicle is always in frame.
- The camera can look ±150° yaw and -55°/+65° pitch: put things behind and above the rider too.
- Type-check with `npx tsc --noEmit -p .` before finishing. Do not run the dev server or a browser; the integrator does visual QA.
