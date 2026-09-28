# Window Seat (wonder-lens)

Source: https://github.com/byebrianwong/wonder-lens

A slow, atmospheric photo ride through worlds worth watching. Sit in the window seat of a vehicle that
rolls through a hand-built 3D world, look anywhere, and either relax or pick up the camera Pokémon Snap
style: zoom, throw things, call out, and catch the moments that make each world feel alive.

Worlds:

- **The Sea Train** (Studio Ghibli): leave Koriko by the sea, cross Totoro's countryside in the rain, ride the flooded railway past the bathhouse under the stars.
- **The Zubrowka Express** (Wes Anderson): symmetrical pastel dioramas, from the Grand Budapest Hotel and Gabelmeister's Peak through Camp Ivanhoe and Asteroid City to the Belafonte at sundown.
- **Montmartre by Moped** (Amélie): green and gold Paris at night, from the Café des 2 Moulins to the Canal Saint-Martin.

Everything is drawn and synthesised in the browser: geometry from primitives, textures from canvas, music and
sound from the Web Audio API. There are no external assets. A fan-made tribute, not affiliated with any studio.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` makes a static bundle in `dist/` that any static host can serve.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Look | Mouse (locked, or drag) / arrows / WASD | Drag |
| Photo | Click / Space | Shutter button, or a quick tap |
| Zoom | Wheel / hold Z (X to widen) | Pinch, or the + / − buttons |
| Throw | E / right click | Tap the item button |
| Call | Q / middle click | Tap the call button |
| Faster / slower | Shift / Ctrl | |
| Hide HUD (relax) | H | |
| Pause | Esc | |
| Mute | M | |

Sound starts muted when an agent or test tool drives the page (the Claude app's built-in browser, or any
browser with `navigator.webdriver` set). Press M to unmute, or open the page with `?sound=1`. `?sound=0` starts
muted in any browser.

Snap ride: 24 shots per world. Every photo is scored on which subjects are in it, how large and centred they are,
whether they are facing you, and whether you caught a special moment. The album at the end keeps your best shot of
each subject, like the professor's review in Pokémon Snap.

Relax ride: no HUD, unlimited film, and after a few seconds without input the camera drifts on its own towards
whatever is worth looking at.

## Project layout

- `src/engine/` renderer and post-processing, input, synthesised audio, sky, particles, procedural geometry helpers
- `src/game/` ride, camera rig, photo scoring, subjects, HUD, album, the game loop
- `src/worlds/` one folder per world; see `WORLD_GUIDE.md` for how to build one
