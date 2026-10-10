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
(`aquatic/belafonte.ts`, `aquatic/cast.ts`), the curtain call uses the scenes' real characters, the closing crane
shot no longer passes through the observation car's canopy, the stories, ride views and dev gallery use the new
world, the old world's files are deleted, and WORLD_GUIDE.md describes the new world.

## 1. Play it and review each scene

A frame at every caption (`scripts/shoot.mjs` with `beat=0..24`) was checked on 2026-10-10. It found one bug, now
fixed: the aquatic scene was drawn before the splash covered the screen, so its sea and coral showed through the
island's sea while the gondola fell. Still to do, which needs the real game in a browser:

- Ride the whole thing and watch every join between scenes as the covers clear and close.
- Try the whistle and a thrown box on every subject. The Belafonte's four (the ship, Steve, Team Zissou, Pelé)
  have not been tried in play.
- Check frame rate on a real laptop (see 3).

## 2. Chromatic

The stories changed a lot: `Anderson/Characters` and `Anderson/Buildings and props` were rewritten for the new
world, and `Worlds/Ride views` now has 25 Anderson views (one per caption) instead of 10. The first Chromatic build
of this branch will show them as new or changed; review them and accept them as the new baselines.

## 3. Performance

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
