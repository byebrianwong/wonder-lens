# Building a world for Window Seat

Window Seat is an on-rails 3D photo ride (Pokémon Snap style) built with Vite + TypeScript + three.js.
Every asset is procedural: geometry from primitives, textures from canvas, audio synthesised. No external files.

## Where things live
- `src/engine/` — renderer, input, audio, sky, particles, `Builders.ts` (geometry helpers). Do not edit these from a world.
- `src/game/` — `types.ts` (the `WorldDef` / `BuiltWorld` contracts), `Subject.ts` (photographable things), `lighting.ts` (keyframes), `Game.ts` (the loop). Do not edit these from a world.
- `src/worlds/<id>/` — one folder per world. The Ghibli world (`src/worlds/ghibli/`) is the reference implementation:
  `GhibliWorld.ts` (assembly + subjects + lighting), `environment.ts` (buildings, props, vehicle), `characters.ts` (animated figures; the main
  characters live in their own files, `totoro.ts`, `catbus.ts`, `haku.ts`, `people.ts` and `spirits.ts`, and `characters.ts` re-exports them).

## The contract (see `src/game/types.ts`)
`WorldDef` = menu metadata + `build(ctx) => BuiltWorld`. `BuiltWorld` supplies:
- `scene`, `curve` (a `CatmullRomCurve3`; the ride moves along it, generally in the -z direction), `speed` (units/s; ~10 gives a 3-4 minute ride for ~2300 units),
- `vehicle` (a `Group` the ride moves and orients; its local +z is the direction of travel) and `cameraAnchor` (child of the vehicle, `rotation.y = Math.PI` so the camera looks forward; place it ~2.3 above the track),
- `subjects` (array of `Subject`), `occluders` (large meshes that can hide subjects: terrain, big buildings),
- `sky` (`new Sky(1400)` added to the scene), `sun` (a `DirectionalLight` with `castShadow`, plus `scene.add(sun.target)`), `hemi` (`HemisphereLight`),
- `lighting` (use `makeLighting([...keys])` from `src/game/lighting.ts`; keyed on ride progress `u` in 0..1; the game applies sky colours, fog, sun, hemi, exposure, bloom, saturation, sun glow),
- `env(u)` (audio levels: wind, sea, rain, birds, crickets), `ambience` (an `AmbienceProfile`: musical root/scale/chords, melody voice `musicbox | pluck | accordion | vibes | piano`, vehicle sound `train | moped | none`),
- `groundHeight(x, z)`, `waterLevel`, `makeProjectile()` (the thrown item mesh), `captions` ([u, text] story beats), `update(dt, ride)`, `onItemLand(pos)`, `onCall(pos, ride)`, `dispose()`.
- Optional `speedAt(u)`: a speed multiplier along the ride (about 0.4 to 1.6), on top of `speed` and the rider's own faster or slower. Use it to linger in a small room and to rush through a flight. The ride eases towards it, but change it gently.
- `update(dt, ride)` runs after the ride has placed the vehicle and before the camera follows it, so a world can add to the vehicle's transform there (a bounce down steps, banking in a flight) and move `cameraAnchor` for a camera move (a crane shot).
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
- `fluffyForest`, `fluffyTree`, `flowerField` (`src/engine/Foliage.ts`): trees whose canopies are made of camera-facing leaf cards, and meadow flowers. Forests are split into stretches along z so off-screen trees are skipped. Give a style `snow: 0..1` for snow lying on the upward-facing cards (the Zubrowka firs).
- `CumulusField` (`src/engine/Clouds.ts`): large soft clouds. Call `update(sky.uniforms, fog, sun.intensity)` every frame.
- `SeaMaterial` (`src/engine/Water.ts`): water that reads the terrain height to show shallows, shore foam, sky reflection and sun glitter. Call `update(...)` every frame. Options set the deep, shallow, sand and night colours, and `waterY` for water that is not at height 0 (a lake).
- `FogCuller` (`src/engine/Culling.ts`): hides static objects that are completely lost in the fog. On a straight track frustum culling does nothing (everything ahead is in view), so register each building, stretch of trees and terrain chunk with `add` or `addChildren`, and call `update(camera, fog)` every frame. A child marked `userData.chunked = true` has its own children registered one by one. Only register things nothing else shows or hides.
- `buildDetailedTrack` and `mergeStatic` (`src/engine/Builders.ts`): a track with a gravel bed and shaped rails; and a helper that merges a static prop's meshes into one mesh per material, which cuts draw calls a lot.
- Lighting keys accept `cloudShadow` (0..1): soft cloud shadows that drift over the ground (drawn in a post pass from the depth buffer).
- Painted characters and props (`src/engine/Paint.ts`):
  - `charToon({ map, color, rim, shade, ... })` is a cel-shaded material for characters. Its shadow side is a cool violet instead of grey, and it adds a thin rim of light on the silhouette that is strongest when the sun is behind the character.
  - `Painter` paints canvas textures: gradients, soft blotches, brushed fur strokes, fine lines. `painter.at([x, y, z], draw)` draws at the point where a direction meets a sphere, so you can paint faces and markings straight onto a sphere's texture.
  - `boxUV(geo, scale)` and `repeatUV(geo, u, v)` make a tiling texture keep the same size on every box face or cylinder, instead of stretching.
  - UV layouts: on spheres and capsules the front (+z) is a quarter of the way across the texture; on cylinders and cones it is at the left edge. The top of the shape is the top of the canvas.
  - The Ghibli painters in `src/worlds/ghibli/characterTextures.ts` (fur, anime faces, hair, cloth, scales, stone) and `propTextures.ts` (train panels, deck boards, bark, granite) are examples to copy.
- Rigged characters (`src/engine/Rig.ts`). The Ghibli characters are built with these:
  - `sculpt(shape)` makes one smooth closed body from a function that moves each point of a unit sphere, and `profileShape([[height, radius], ...])` gives such a function from an outline. The body keeps the sphere's UVs, so `Painter.at(direction)` still paints marks in the right place (Totoro's belly and chevrons are painted this way).
  - `new Rig(group, joints)` makes a skeleton from named joints placed in the character's own space; `rig.skin(geometry, material, weights)` turns a geometry into a mesh that bends smoothly at those joints (Totoro's head tilts back in the roar without a crease). Build the rig and its meshes before you move or scale the group. Put rigid parts (eyes, ears, arms) on a joint as children of that bone.
  - Put every limb in a group placed at its joint (shoulder, elbow, hip, knee), and rotate the group. A limb rotated around its own middle looks like it flips over. `limbGeometry(r0, r1, len)` makes a tapered limb that hangs down from its joint.
  - `Spring`, `Heading`, `LookAt` and `envelope` give eased motion: a reaction that winds up, overshoots a little and settles; a turn that never snaps; a head that follows the camera within limits. Drive timed reactions from an elapsed time and `envelope(t, a, b, c, d)` rather than from `Math.sin` of the clock.
  - `outline(mesh)` adds a thin ink line around a mesh (the back faces pushed out). `FlexTube` is a tube whose centre line you set each frame (Haku's body, whiskers, locks of hair); `taperedTube` is a fixed one (horns, ponytails). `surfaceMouth` in `ghibli/character.ts` opens a mouth on a sculpted, skinned body.
- Characters that come and go: never hide a character while it can be seen. Fliers arrive from far ahead and leave by flying off into the fog; ground characters are switched on and off where fog or the tunnel already hides them. Fliers that keep pace with the train should add the train's measured velocity to their own steering, so they do not drop behind when the rider speeds up.
- The vehicle can block the view behind. A world can set `lookBackLean: { out, up }` so the camera leans out over the side when the rider turns round (the Ghibli sea train uses it).
- Character gallery (dev only): with the dev server running, open `/gallery.html` (Ghibli), `/gallery.html?w=anderson` or `/gallery.html?w=amelie`. It shows one character (or the world's vehicle) at a time under the ride's own lighting presets; drag to orbit, wheel to zoom. From the console, `view('catbus', { u: 0.4, yaw: 0.6, dist: 14 })` frames a character, `act()` triggers its reaction and `advance(2)` steps the animation when the tab is in the background.
- The Amélie world (`src/worlds/amelie/`) is built as a dream that passes through separate film scenes ("sets") rather than one landscape:
  - `layout.ts` holds the whole route: each set's stretch of z, the path's control points and the speed profile. `common.ts` defines `BuiltSet` (a group, the ride progress range in which it is drawn, its own `floor(x, z)` for thrown items, and an `update`). Each set lives in `sets/` and is only drawn near the rider; sets may even overlap in space, because the switch happens while the screen is covered.
  - `lens.ts`: `Lens` is a small sphere round the camera drawn over everything: an iris that closes to black like an old film, a white flash and a colour wash. Scenes change while it covers the screen (the iris into Amélie's bedroom, the flash off the carousel, the photo booth's four flashes). `LightPool` is a fixed set of point lights that move from scene to scene (the count never changes, so no shader recompiles), and `lightShaft` draws a soft beam of light.
  - `buildings.ts` builds Paris buildings (painted facades, zinc mansards with dormers, iron balconies, geraniums, shopfronts) and `textures.ts` paints the facades, shopfronts, cobbles, zinc, panelling and wall advertisements.
  - `figure.ts` builds grown-ups in the Ghibli children's style (sculpted hair, painted faces, ink outlines, jointed limbs); `characters.ts` builds the cast on it and `cast.ts` places them and makes their photo subjects.
  - `optimize(group)` in `common.ts` makes a static group cheap: it splits meshes that use one material per face (a box with a facade on one side, which `mergeStatic` would skip), pools instanced meshes that share a geometry and material, then merges. Run it on every static group; it took the first street from about 3,000 draw calls to 600.
- The Zubrowka Express world (`src/worlds/anderson/`) is a second example of all of the above: `textures.ts` paints tiling facades (`facadeTile`: a pastel wall of framed windows with an emissive map for lit ones), fish-scale roofs, paving, planks and awnings; `characterTextures.ts` paints faces with hair, jackets with lapels, buttons and badges, and fur; `hotel.ts` builds a landmark from tiled boxes and merges it. `chunkedParts` and `lampPosts` in `environment.ts` split long rows of props into stretches for the fog culler.
Deterministic randomness: `new Rng(seed)` from `src/engine/math.ts` (`range`, `int`, `pick`, `chance`, `sign`), `fbm`/`noise2`.

## Gotchas learned the hard way
- The game compiles every material in the scene while the loading card is up (`Renderer.precompile`), hidden objects included, so a part of the world that only appears later does not stall the ride. Two things still compile on first use: a material swapped in at runtime, and shadow-depth variants. Never toggle a light's `visible` during the ride: the number of lights is part of every shader's key, so all lit materials would recompile. Set its intensity to 0 instead.
- Keep `shadowMap.type` at `PCFShadowMap`. three.js r18x silently replaces `PCFSoftShadowMap` with it on the first shadow render, which changes every shader's key and throws away anything compiled before that render.
- After copying a quaternion into an object, never set a single Euler angle on it (`g.rotation.z = sway`): the Euler angles re-derived from that quaternion can be (π, 0, π), so changing one of them turns the object upside down. Put the extra motion on an inner group.
- `group.add(mesh)` returns the GROUP. Never write `g.add(mesh(...)).rotation.x = ...`; make the mesh, rotate it, then add.
- `Object3D.position` is read-only; use `.position.set(...)`, never `Object.assign(obj, { position })`.
- Any NaN in a fragment shader blackens the whole frame through bloom. Use `clamp(x, 0.0, 1.0)` before `pow`, never `smoothstep(a, a, x)`.
- Keep triangle counts sane: instanced meshes for trees/props, merged geometry for clouds, `SphereGeometry(r, 14, 10)` style segment counts. Target 60 fps on a laptop.
- Draw calls matter as much as triangles. A prop built from 40 primitives is 40 draw calls (80 with shadows) until you run it through `mergeStatic`. One big instanced mesh that spans the whole ride is never culled; split it into stretches along z. On a straight track, register props with a `FogCuller` too.
- A character's painted details (eyes, buttons, collars, badges, hair) cost nothing on a texture and a draw call each as separate meshes. Materials shared between look-alike characters (a troop, a crew) should be created once and reused.
- Only a few `PointLight`s per world (2-6), placed at hero spots.
- Every mesh near the camera at the start should look good: the vehicle is always in frame.
- The camera can look ±150° yaw and -55°/+65° pitch: put things behind and above the rider too.
- Type-check with `npx tsc --noEmit -p .` before finishing. Do not run the dev server or a browser; the integrator does visual QA.
