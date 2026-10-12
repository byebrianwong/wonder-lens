import { submit } from '../server/board.js';
import { clientIp, guarded, json } from '../server/http.js';
import { getKv, getPhotos } from '../server/store.js';
import type { SubmitBody } from '../server/types.js';

/** POST /api/submit : save a run to the leaderboard, with up to three photos to share. */
export function POST(req: Request) {
  return guarded(async () => {
    let body: SubmitBody;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid', message: 'Bad request.' }, 400); }
    const result = await submit(getKv(), getPhotos(), body, clientIp(req));
    const status = result.ok ? 200 : result.error === 'rate' ? 429 : 400;
    return json(result, status);
  });
}
