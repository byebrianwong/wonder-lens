import { SetupError } from './store.js';

/* Small helpers shared by the functions in api/. */

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** The caller's IP address, as Vercel reports it. */
export const clientIp = (req: Request) =>
  req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';

/** Turn a missing database or Blob store into a clear 503 instead of a crash. */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SetupError) return json({ ok: false, error: 'offline', message: err.message }, 503);
    console.error('[leaderboard]', err);
    return json({ ok: false, error: 'offline', message: 'The leaderboard is having trouble. Try again soon.' }, 500);
  }
}

/** True when the request carries the admin password set in the ADMIN_TOKEN environment variable. */
export function isAdmin(req: Request) {
  const want = process.env.ADMIN_TOKEN ?? (process.env.VERCEL ? '' : 'dev');
  return want.length > 0 && req.headers.get('x-admin-token') === want;
}
