# Next steps: the Wes Anderson rebuild

The Zubrowka Express (`src/worlds/anderson/`) was rebuilt as a ride in nine parts through Wes Anderson's
films, in the scene framework the Amélie world and Catbus to Anywhere use. It is playable from start to end,
type-checks and builds, but it is not finished. This file lists what is left, roughly in order. Delete it when
the work is done.

## What is in place

- The route and scene framework: `layout.ts` (scenes, screen covers with title cards, the 1.37:1 opening frame,
  captions), `route/<scene>.ts` (each scene's path, speed keys and captions), `common.ts` (the scene contract,
  including `MountDef` for vehicles other than the train and `ZLightKey` lighting keyed by z),
  `AndersonWorld.ts` (mounts, covers, lighting, sound, captions).
- `film.ts`: the screen effects drawn over the picture (whip pan, fade, theatre curtain, splash with bubbles,
  iris, title cards, frame bars). `train.ts`: the new observation car. `people.ts`: the Amélie adult figure
  and the Ghibli child figure with the films' hats. `stopmotion.ts`: puppets animated on twos.
- Nine scenes in `sets/<scene>.ts`, with helpers in `<scene>/`: hotel, mendls (rides in a pastry box), ski
  (toboggan), fox, moonrise, asteroid, isle (trash gondola), aquatic (the Deep Search), finale.
- Engine: optional `BuiltWorld.vehicleAt(u)` quiets the train's sound while the rider is on another vehicle.
- `shot.html` and `scripts/shoot.mjs`: a snapshot page and a Playwright driver for checking a point of the
  ride without playing it (see "Tools" below).

The eight film scenes were built by separate agents that were stopped before their final polish pass, so no
scene has had a full visual review. The finale was built and checked in its own session.

## 1. Review and finish each scene

Ride the whole thing in the browser (`npm run dev`) and look at each scene, especially where each cover clears
and closes. Known gaps:

- **aquatic**: the surface section is incomplete. `aquatic/crew.ts` exists, but there is no Belafonte ship
  (the cutaway set with every room lit), and the subject list has no Belafonte, Steve Zissou, Team Zissou or
  Pelé. The route already rises to the surface at z -2332 and runs along where the ship should be.
- **aquatic**: no `aquatic/cast.ts` (the finale wants `makeZissou()` and `makePele()`).
- **all scenes**: check subjects, reactions (whistle and thrown box), lighting at the joins, and that nothing
  pops in view.

## 2. Put the real cast in the finale

`finale/cast.ts` still uses stand-in figures. Replace them with the scenes' exports. Each export returns
`{ group, update(dt, t), bow() }` (check each one's actual signature):

- hotel/cast.ts: makeGustave, makeZero (also makeLobbyBoys, makeLiftOperator, makeMadameD, makeConductor, makePorter, makeTraveller)
- mendls/cast.ts: makeAgatha (also makeMendl, makeZero)
- ski/cast.ts: makeJopling (also makeGustave, makeZero, makeSledPair, makeSkier)
- fox/cast.ts: makeMrFox, makeKylie, makeWolf
- moonrise/cast.ts: makeSam, makeSuzy, makeScout
- asteroid/cast.ts: makeAlien, makeAugie
- isle/cast.ts: makeChief, makeAtari
- aquatic/cast.ts: not written yet (see 1)

Check each character's scale and facing on the stage (the line faces +z), the bow wave, and the closing crane
shot's framing in `sets/finale.ts`. The curtain call is the busiest point of the ride (see the table below);
the cast's outlines are most of it.

## 3. Remove the old world

The old world's `environment.ts`, `characters.ts` and `hotel.ts` in `src/worlds/anderson/` are no longer used by
the game, only by the stories and the dev gallery. Once those are updated (4 and 5), delete them. Keep
`textures.ts` and `characterTextures.ts`: the new code uses them. `kit.ts` holds the small helpers that were
moved out of `environment.ts`.

## 4. Update Storybook

- `src/worlds/anderson/Characters.stories.ts` and `Environment.stories.ts` still show the old world's
  characters and props. Point them at the new builders: the scenes' `cast.ts` exports, the mounts, the train
  (`train.ts`), the finale's theatre and dollhouse.
- `src/worlds/Worlds.stories.ts`: the Anderson ride views (`view(AndersonWorld, i)`) index the captions, and the
  new world has more captions than the old one's ten. Add a view per caption (the captions are listed in
  `route/*.ts`).
- Chromatic will then show the changed snapshots; accept them as the new baselines.

## 5. Update the dev gallery

`src/dev/gallery.ts`: the `ANDERSON` entries still build the old characters; switch them to the new
`cast.ts` exports and mounts, and replace the lighting presets (alps, wood, desert, sea, sundown) with one per
scene (`LIGHT_KEYS` in `AndersonWorld.ts` already has one key per scene).

## 6. Docs

`WORLD_GUIDE.md` describes the old Anderson world. Replace that paragraph with one on the new one (the route,
covers and title cards in `layout.ts` and `film.ts`, mounts, `ZLightKey`, `SetModule`, `vehicleAt`), in the
style of the Amélie and Catbus to Anywhere paragraphs.

## 7. Performance

Draw calls and triangles at points along the ride, from `scripts/shoot.mjs` (rider's seat, looking ahead, with
every scene built), before any tuning:

| z | where | draw calls | triangles |
| --- | --- | --- | --- |
| 50 | Nebelsbad station | 363 | 500k |
| -200 | the hotel lobby | 188 | 404k |
| -420 | Mendl's | 205 | 722k |
| -720 | the toboggan chase | 381 | 586k |
| -1000 | under the hill | 457 | 278k |
| -1300 | Summer's End | 380 | 1.04M |
| -1650 | Asteroid City | 289 | 298k |
| -1950 | Trash Island | 170 | 294k |
| -2360 | the Belafonte (incomplete) | 90 | 230k |
| -2560 | the curtain call | 548 | 873k |

The whole world takes about 4.5 s to build in the software renderer the snapshot tool uses. Check frame rate on
a real laptop. The console prints many "toNonIndexed(): BufferGeometry is already non-indexed" warnings while
building; they come from merging geometry that is already non-indexed and are harmless, but noisy.

## Tools

`shot.html` (dev server only) builds a world, parks the ride at one point and draws one frame. Drive it with:

    npm run dev
    node scripts/shoot.mjs shots "lobby|w=anderson&z=-200&yaw=30" "booth|w=anderson&beat=3"

Each spec is `name|query`. Query: `w=<world id>`; `z=<z on the path>`, `u=<0..1>` or `beat=<caption index>`;
`yaw`/`pitch` in degrees (+yaw turns left); `settle=<seconds>` of simulation first; `moving=1` to arrive at
speed; `cam=x,y,z&look=x,y,z` for a free camera; `all=1` to build every scene (by default only the scenes near
the point are built). It prints build time, draw calls, triangles, active subjects and the caption, plus console
errors and warnings, and saves a PNG per spec. Rendering is software WebGL, so a shot takes 5-30 s.
