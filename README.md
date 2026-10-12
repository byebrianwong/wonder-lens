# Wonder Lens

Source: https://github.com/byebrianwong/wonder-lens

A slow, atmospheric photo ride through worlds worth watching. Sit in the window seat of a vehicle that
rolls through a hand-built 3D world, look anywhere, and either relax or pick up the camera Pokémon Snap
style: zoom, throw things, call out, and catch the moments that make each world feel alive.

Worlds:

- **Catbus to Anywhere** (Studio Ghibli): ride on the Catbus's back through one night of a dream: up the tree that grows in Totoro's garden, along the power lines with Totoro flying alongside, through the Forest Spirit's wood, into the storm to Laputa, across Howl's meadow and through his castle's door to the bathhouse, and on Haku's back until his scales burst, then home by dawn.
- **The Zubrowka Express** (Wes Anderson): a ride in nine parts through the films, joined by title cards, whip pans and a theatre curtain: up the funicular into the Grand Budapest, through Mendl's in a pastry box, down Gabelmeister's Peak on a toboggan, under Mr. Fox's hill, across New Penzance in the storm, into the play of Asteroid City, over Trash Island in a gondola, under the sea in the Deep Search, and on to the curtain call. Still being finished (see NEXT_STEPS.md).
- **Montmartre by Moped** (Amélie): a dream of Amélie's Paris that drifts from one film scene into the next: into a giant green grocer, through the Café des 2 Moulins and up a tablecloth to a crème brûlée, out of her bedroom window over the rooftops at sunset, down the Sacré-Cœur steps, along the canal at night and through a giant photo booth into sunrise.

Everything is drawn and synthesised in the browser: geometry from primitives, textures from canvas, music and
sound from the Web Audio API. There are no external assets. A fan-made tribute, not affiliated with any studio.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` makes the game's static bundle in `dist/`. The leaderboard needs the
serverless functions in `api/`, so the full site runs on Vercel (see below).

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

Throws go where the reticle points: at a character that reacts to them (up to 80 units away), or else at the ground
or water under the reticle. The throw and call buttons light up when the character in the viewfinder would react, and
the reticle turns gold and names the moment while a special moment is on.

Relax ride: no HUD, unlimited film, and after a few seconds without input the camera drifts on its own towards
whatever is worth looking at.

## Leaderboard and shared photos

After a Snap ride, players can save their score with a name and share up to 3 photos. There are no accounts: the
browser keeps a random player id in localStorage, so a player keeps their line on the board on the same browser.
Each world has one board covering the last 30 days. A player's line shows their best run from those 30 days.
The menu's Leaderboards button shows each world's board and the 12 best shared photos.

Safety checks, all on the server (`server/moderate.ts`):

- Names: 1 to 16 letters, numbers, spaces or `. - _ '`, then a word filter (the `obscenity` package), then Claude.
- Photos: must be small JPEGs. Claude checks that each one looks like a frame from the game and is fit for anyone
  to see. Approved photos appear at once. Rejected photos are deleted straight away. If the check is not set up or
  fails, the photo stays hidden until you approve it on `/admin.html`.
- At most 12 saves per IP address per hour, and scores above what a world allows are refused (`server/worlds.ts`).
- At most 100 Claude checks a day across all players (`CLAUDE_DAILY_LIMIT` changes it). After that, names get only
  the word filter and photos wait for review, so a flood of saves cannot run up the API bill.

On Vercel the functions need these environment variables:

| Variable | What it is | How to get it |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis, which stores scores | Vercel dashboard → Storage → Upstash for Redis, connected to the project |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, which stores shared photos | Vercel dashboard → Storage → Blob, connected to the project |
| `ANTHROPIC_API_KEY` | Claude, for the name and photo checks | A key from platform.claude.com. Without it, every photo waits for review. |
| `ADMIN_TOKEN` | The password for `/admin.html` | Any long random string |

Locally, `npm run dev` runs the same functions inside the dev server and keeps everything in memory (the admin
password is `dev`). Put the variables in `.env.local` to use the real services instead.

## Project layout

- `src/engine/` renderer and post-processing, input, synthesised audio, sky, particles, procedural geometry helpers
- `src/game/` ride, camera rig, photo scoring, subjects, HUD, album, the game loop
- `src/worlds/` one folder per world; see `WORLD_GUIDE.md` for how to build one
- `api/` and `server/` the leaderboard's serverless functions and their rules; `public/admin.html` the moderation page
