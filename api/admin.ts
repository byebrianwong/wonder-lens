import { adminView, isWorld, removePlayer, removeShot, setShotStatus } from '../server/board.js';
import { guarded, isAdmin, json } from '../server/http.js';
import { getKv, getPhotos } from '../server/store.js';

/*
 * Brian's moderation page (public/admin.html) talks to this.
 * Every request needs the x-admin-token header to match the ADMIN_TOKEN environment variable.
 */

export function GET(req: Request) {
  return guarded(async () => {
    if (!isAdmin(req)) return json({ ok: false, error: 'auth' }, 401);
    return json(await adminView(getKv()));
  });
}

type Action =
  | { action: 'approve' | 'hide' | 'delete'; id: string }
  | { action: 'remove-player'; world: string; player: string };

export function POST(req: Request) {
  return guarded(async () => {
    if (!isAdmin(req)) return json({ ok: false, error: 'auth' }, 401);
    const a = (await req.json()) as Action;
    const kv = getKv(), photos = getPhotos();
    if (a.action === 'approve' || a.action === 'hide') {
      return json({ ok: await setShotStatus(kv, photos, String(a.id), a.action === 'approve' ? 'approved' : 'rejected') });
    }
    if (a.action === 'delete') { await removeShot(kv, photos, String(a.id)); return json({ ok: true }); }
    if (a.action === 'remove-player' && isWorld(a.world)) {
      await removePlayer(kv, photos, a.world, String(a.player));
      return json({ ok: true });
    }
    return json({ ok: false, error: 'invalid' }, 400);
  });
}
