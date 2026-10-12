import { isWorld, readBoard } from '../server/board.js';
import { guarded, json } from '../server/http.js';
import { getKv, getPhotos } from '../server/store.js';

/** GET /api/board?world=dream&player=<id> : the 30-day leaderboard and shared photos for one world. */
export function GET(req: Request) {
  return guarded(async () => {
    const q = new URL(req.url).searchParams;
    const world = q.get('world');
    if (!isWorld(world)) return json({ ok: false, error: 'invalid', message: 'Unknown world.' }, 400);
    return json(await readBoard(getKv(), getPhotos(), world, q.get('player')));
  });
}
