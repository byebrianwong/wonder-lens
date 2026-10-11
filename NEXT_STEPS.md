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

Second stage (2026-10-10): the Belafonte and Team Zissou were added to the Life Aquatic scene
(`aquatic/belafonte.ts`, `aquatic/cast.ts`), with the albino scout dolphins leaping alongside
(`aquatic/dolphins.ts`), the curtain call uses the scenes' real characters, the closing crane
shot no longer passes through the observation car's canopy, the stories, ride views and dev gallery use the new
world, the old world's files are deleted, and WORLD_GUIDE.md describes the new world.

## 1. Play it and review each scene

Done on 2026-10-10, in the real game from start to end, at real speed, on the M5 (headless Chromium on the GPU
at 1440x900 and 2x, driven by Playwright). Four bugs were found and fixed:

- **A freeze of up to 1.4 s at most scene changes.** The train's lamp was inside the train's group, so it left the
  scene whenever the rider changed to another vehicle. The number of lights is part of every shader, so everything
  drawn compiled again. The lamp now rides on the vehicle and is turned down instead. Textures are also uploaded
  at load now (`Renderer.precompile`). Worst frame over the whole ride: 1417 ms before, 19 ms after.
- **The pixel ratio fell to 0.7 and stayed there.** Each of those freezes lowered it one step, and at 60 Hz it is
  never raised again. `Renderer.govern` now caps a single frame at 40 ms, so only sustained slow frames lower it.
- **Nothing in the curtain call could be photographed or whistled at.** A hidden scene's subjects are switched
  off, and the finale's four (the cast, the dollhouse, the conductor, the proscenium) had nothing to switch them
  back on. A scene now switches its subjects on when it comes into view.
- **The "Asteroid City" title card never showed.** The lightning that strikes St. Jack's flashes for 9 s, and the
  flash was drawn over the card. A title card now shows through a scene's flash.
- **A box thrown into Bean's cider never splashed.** The cellar's hit sphere (radius 9) hung in the air above the
  cider, so a box aimed at the cellar, or passing near it, bounced off it and dropped without effect. The cellar
  is now a crowd subject, so a box aimed at it comes down on the cider.

The whistle reached every subject that has a reaction, and a thrown box worked on every one that has one. One
design question is left: the flying saucer comes down by itself at z -1726, and it is only in whistle range from
about z -1728, so the whistle almost never gets the credit the hint promises. Starting it later would push the
alien's photograph further under the closing curtain.

## 2. Chromatic

The second stage's stories were accepted on build 38. Main's build 41 has three pending changes, all from the Kiki
rebuild (#17): Kiki and Kiki Wave, and Sam, whose cap's speckles changed because he is built on the same kid
figure (`ghibli/people.ts`). All three look intended.

## 3. Performance

On the M5 (headless Chromium on the GPU, 1440x900 at 2x, 60 Hz), the whole ride now holds 60 frames a second at
full resolution: over 21,787 frames the worst was 18.7 ms and 99% were under 18.5 ms. A slower laptop has not
been tried; if it struggles, the table below says where.

Draw calls and triangles from `scripts/shoot.mjs` at the rider's seat, looking ahead, building only the scenes
near the point (the tool's default), after the second stage:

| z | where | draw calls | triangles |
| --- | --- | --- | --- |
| -622 | Gabelmeister's Peak | 442 | 608k |
| -938 | the Fox family's burrow | 684 | 357k |
| -1227 | Summer's End | 366 | 979k |
| -2064 | the gondola falls | 240 | 276k |
| -2340 | coming up beside the Belafonte | 384 | 275k |
| -2370 | along the Belafonte | 375 | 275k |
| -2560 | the curtain call | 656 | 913k |

The figures are the main cost wherever people stand together: each grown-up from `people.ts` is about 36 meshes
(body parts and their ink outlines). At the Belafonte, Team Zissou's five figures are 179 of the 375 calls. If
the frame rate on a laptop is poor at the Belafonte, the curtain call or the Fox burrow, merging each figure's
rigid parts per joint would be the biggest single saving.

## Tools

`shot.html` (dev server only) builds a world, parks the ride at one point and draws one frame. Drive it with:

    npm run dev
    node scripts/shoot.mjs shots "lobby|w=anderson&z=-200&yaw=30" "booth|w=anderson&beat=3"

On Brian's Mac Playwright is not installed in this repo; point the script at another copy, for example
`PLAYWRIGHT=~/.claude/skills/gstack/node_modules/playwright/index.mjs`, and set `BASE` if the dev server is not on
port 5173.

Each spec is `name|query`. Query: `w=<world id>`; `z=<z on the path>`, `u=<0..1>` or `beat=<caption index>`;
`yaw`/`pitch` in degrees (+yaw turns left); `settle=<seconds>` of simulation first; `moving=1` to arrive at
speed; `cam=x,y,z&look=x,y,z` for a free camera; `all=1` to build every scene (by default only the scenes near
the point are built). It prints build time, draw calls, triangles, active subjects and the caption, plus console
errors and warnings, and saves a PNG per spec. Rendering is software WebGL, so a shot takes 5-30 s.
