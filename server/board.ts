import { randomUUID } from 'node:crypto';
import { cleanName, review } from './moderate.js';
import type { Kv, PhotoStore } from './store.js';
import type { BoardData, BoardRow, SharedShot, SubmitBody, SubmitResult, Verdict } from './types.js';
import { WORLD_LIMITS } from './worlds.js';

/*
 * The leaderboard rules.
 *
 * Each world has one board covering the last 30 days. A player (one browser) has one line on it:
 * their best run from those 30 days. When that run turns 31 days old, their next best run from
 * the window takes its place, or the line goes away.
 *
 * Shared photos also last 30 days. Each world's gallery shows the 12 best approved ones.
 */

export const WINDOW_DAYS = 30;
const WINDOW = WINDOW_DAYS * 24 * 3600 * 1000;
const TOP = 50;
const GALLERY = 12;
/** runs kept per player per world, best first */
const RUNS_KEPT = 5;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 250_000;
/** submissions allowed per IP address per hour */
const RATE = 12;

interface Run { at: number; score: number; found: number; rank: string; shots: string[] }
interface PlayerRec { name: string; runs: Run[] }
export interface Shot {
  id: string; world: string; player: string; name: string; subject: string;
  score: number; stars: number; url: string | null; status: Verdict; reason: string; at: number;
}

const K = {
  player: (w: string, p: string) => `wl:p:${w}:${p}`,
  /** player -> best score in the window */
  board: (w: string) => `wl:lb:${w}`,
  /** player -> when their best run leaves the window */
  boardEnds: (w: string) => `wl:lbx:${w}`,
  shot: (id: string) => `wl:shot:${id}`,
  /** approved shot id -> score */
  gallery: (w: string) => `wl:shots:${w}`,
  /** every shot id -> when it leaves the window */
  shotEnds: 'wl:shotx',
  /** shot id -> when it was sent, for shots waiting for a person to look */
  pending: 'wl:pending',
  rate: (ip: string) => `wl:rate:${ip}`,
};

const RANKS = ['Legend', 'Wanderer', 'Explorer', 'Visitor', 'Passenger'];
const PLAYER_ID = /^[a-z0-9-]{8,64}$/;

export function isWorld(w: unknown): w is string {
  return typeof w === 'string' && Object.hasOwn(WORLD_LIMITS, w);
}

// ---------- expiry ----------

/** Drop runs and photos that have left the 30-day window. Cheap when there is nothing to drop. */
async function prune(kv: Kv, photos: PhotoStore, world: string, now: number) {
  const ended = await kv.zupTo(K.boardEnds(world), now, 50);
  for (const player of ended) {
    const rec = await kv.get<PlayerRec>(K.player(world, player));
    const runs = (rec?.runs ?? []).filter((r) => r.at + WINDOW > now);
    if (!rec || !runs.length) {
      await kv.zrem(K.board(world), player);
      await kv.zrem(K.boardEnds(world), player);
      await kv.del(K.player(world, player));
    } else {
      rec.runs = runs;
      await kv.set(K.player(world, player), rec);
      await kv.zadd(K.board(world), runs[0].score, player);
      await kv.zadd(K.boardEnds(world), runs[0].at + WINDOW, player);
    }
  }
  const oldShots = await kv.zupTo(K.shotEnds, now, 20);
  for (const id of oldShots) await removeShot(kv, photos, id);
}

export async function removeShot(kv: Kv, photos: PhotoStore, id: string) {
  const shot = await kv.get<Shot>(K.shot(id));
  if (shot?.url) await photos.remove(shot.url).catch((e) => console.error('[leaderboard] blob delete failed', e));
  if (shot) await kv.zrem(K.gallery(shot.world), id);
  await kv.zrem(K.shotEnds, id);
  await kv.zrem(K.pending, id);
  await kv.del(K.shot(id));
}

// ---------- reading ----------

export async function readBoard(kv: Kv, photos: PhotoStore, world: string, player: string | null, now = Date.now()): Promise<BoardData> {
  await prune(kv, photos, world, now);
  const total = WORLD_LIMITS[world].subjects;
  const top = await kv.ztop(K.board(world), TOP);
  const recs = await kv.mget<PlayerRec>(top.map((t) => K.player(world, t.member)));
  const firstShots = recs.map((r) => r?.runs[0]?.shots[0] ?? null);
  const shotRecs = await kv.mget<Shot>(firstShots.filter((s): s is string => !!s).map(K.shot));
  const shotUrl = new Map(shotRecs.filter((s): s is Shot => !!s && s.status === 'approved').map((s) => [s.id, s.url]));
  const row = (place: number, member: string, rec: PlayerRec): BoardRow => {
    const run = rec.runs[0];
    const first = run.shots[0];
    return {
      place, name: rec.name, score: run.score, found: run.found, total, rank: run.rank, at: run.at,
      you: member === player, photo: (first && shotUrl.get(first)) ?? null,
    };
  };
  const rows: BoardRow[] = [];
  top.forEach((t, i) => { const rec = recs[i]; if (rec?.runs.length) rows.push(row(i + 1, t.member, rec)); });

  let you = rows.find((r) => r.you) ?? null;
  if (!you && player) {
    const place = await kv.zplace(K.board(world), player);
    const rec = place == null ? null : await kv.get<PlayerRec>(K.player(world, player));
    if (place != null && rec?.runs.length) you = row(place + 1, player, rec);
  }

  const best = await kv.ztop(K.gallery(world), GALLERY);
  const shots: SharedShot[] = (await kv.mget<Shot>(best.map((b) => K.shot(b.member))))
    .filter((s): s is Shot => !!s && s.status === 'approved' && !!s.url)
    .map((s) => ({ id: s.id, url: s.url!, name: s.name, subject: s.subject, score: s.score, stars: s.stars, at: s.at, you: s.player === player }));

  return { world, windowDays: WINDOW_DAYS, players: await kv.zcount(K.board(world)), rows, you, shots };
}

// ---------- writing ----------

const bad = (message: string): SubmitResult => ({ ok: false, error: 'invalid', message });
const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Read the width and height from a JPEG's header, or null if it is not a JPEG. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

export async function submit(kv: Kv, photos: PhotoStore, body: SubmitBody, ip: string, now = Date.now()): Promise<SubmitResult> {
  // 1. check the shape of what was sent
  if (!body || typeof body !== 'object') return bad('Nothing was sent.');
  const { world, player } = body;
  if (!isWorld(world)) return bad('Unknown world.');
  if (typeof player !== 'string' || !PLAYER_ID.test(player)) return bad('Bad player id.');
  const lim = WORLD_LIMITS[world];
  if (!int(body.score, 1, lim.maxScore)) return bad('That score is not possible in this world.');
  if (!int(body.found, 1, lim.subjects)) return bad('That count of subjects is not possible in this world.');
  if (!RANKS.includes(body.rank)) return bad('Unknown rank.');
  const sent = Array.isArray(body.photos) ? body.photos : [];
  if (sent.length > MAX_PHOTOS) return bad(`Share at most ${MAX_PHOTOS} photos.`);
  const jpegs: Uint8Array[] = [];
  for (const p of sent) {
    if (!p || typeof p.jpeg !== 'string' || typeof p.subject !== 'string' || p.subject.length > 40) return bad('Bad photo.');
    if (!int(p.score, 0, lim.maxScore) || !int(p.stars, 0, 4)) return bad('Bad photo score.');
    const bytes = Buffer.from(p.jpeg, 'base64');
    const size = jpegSize(bytes);
    if (bytes.length > MAX_PHOTO_BYTES || !size || size.w > 1024 || size.h > 1024) return bad('Photos must be small JPEGs.');
    jpegs.push(bytes);
  }

  // 2. limit how often one address can post
  if ((await kv.hit(K.rate(ip), 3600)) > RATE) {
    return { ok: false, error: 'rate', message: 'Too many saves from here in the last hour. Try again later.' };
  }

  // 3. the name and photos must pass the safety checks
  const name = cleanName(body.name);
  if (!name) return { ok: false, error: 'name', message: 'Please choose another name (up to 16 letters, numbers or spaces).' };
  const checked = await review(name, jpegs);
  if (!checked.nameOk) return { ok: false, error: 'name', message: 'Please choose another name.' };

  // 4. store the photos. Rejected images are thrown away; only the reason is kept for /admin.html.
  await prune(kv, photos, world, now);
  const shotIds: string[] = [];
  for (let i = 0; i < jpegs.length; i++) {
    const { verdict, reason } = checked.photos[i];
    const id = randomUUID();
    const url = verdict === 'rejected' ? null : await photos.put(id, jpegs[i]);
    const shot: Shot = {
      id, world, player, name, subject: sent[i].subject, score: sent[i].score, stars: sent[i].stars,
      url, status: verdict, reason, at: now,
    };
    await kv.set(K.shot(id), shot);
    await kv.zadd(K.shotEnds, now + WINDOW, id);
    if (verdict === 'approved') await kv.zadd(K.gallery(world), shot.score, id);
    if (verdict === 'pending') await kv.zadd(K.pending, now, id);
    shotIds.push(id);
  }

  // 5. record the run and update the player's line
  const rec = (await kv.get<PlayerRec>(K.player(world, player))) ?? { name, runs: [] };
  rec.name = name;
  rec.runs = [...rec.runs.filter((r) => r.at + WINDOW > now), { at: now, score: body.score, found: body.found, rank: body.rank, shots: shotIds }]
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, RUNS_KEPT);
  await kv.set(K.player(world, player), rec);
  await kv.zadd(K.board(world), rec.runs[0].score, player);
  await kv.zadd(K.boardEnds(world), rec.runs[0].at + WINDOW, player);

  const board = await readBoard(kv, photos, world, player, now);
  return { ok: true, place: board.you?.place ?? 0, photos: checked.photos.map((p) => p.verdict), board };
}

// ---------- admin ----------

export interface AdminData {
  pending: Shot[];
  recent: Shot[];
  boards: Record<string, (BoardRow & { player: string })[]>;
}

export async function adminView(kv: Kv): Promise<AdminData> {
  const pendingIds = (await kv.ztop(K.pending, 100)).map((t) => t.member);
  const recentIds = (await kv.ztop(K.shotEnds, 80)).map((t) => t.member);
  const pending = (await kv.mget<Shot>(pendingIds.map(K.shot))).filter((s): s is Shot => !!s);
  const recent = (await kv.mget<Shot>(recentIds.map(K.shot))).filter((s): s is Shot => !!s);
  const boards: AdminData['boards'] = {};
  for (const world of Object.keys(WORLD_LIMITS)) {
    const top = await kv.ztop(K.board(world), TOP);
    const recs = await kv.mget<PlayerRec>(top.map((t) => K.player(world, t.member)));
    boards[world] = top.flatMap((t, i) => {
      const rec = recs[i];
      const run = rec?.runs[0];
      if (!rec || !run) return [];
      return [{ place: i + 1, player: t.member, name: rec.name, score: run.score, found: run.found,
        total: WORLD_LIMITS[world].subjects, rank: run.rank, at: run.at, you: false, photo: null }];
    });
  }
  return { pending, recent, boards };
}

export async function setShotStatus(kv: Kv, photos: PhotoStore, id: string, status: 'approved' | 'rejected') {
  const shot = await kv.get<Shot>(K.shot(id));
  if (!shot) return false;
  if (status === 'rejected') {
    if (shot.url) await photos.remove(shot.url).catch((e) => console.error('[leaderboard] blob delete failed', e));
    shot.url = null;
    await kv.zrem(K.gallery(shot.world), id);
  } else {
    if (!shot.url) return false; // a rejected photo's image is already gone
    await kv.zadd(K.gallery(shot.world), shot.score, id);
  }
  shot.status = status;
  shot.reason = status === 'approved' ? 'Approved by hand' : 'Hidden by hand';
  await kv.set(K.shot(id), shot);
  await kv.zrem(K.pending, id);
  return true;
}

/** Take a player off a world's board and hide every photo they shared there. */
export async function removePlayer(kv: Kv, photos: PhotoStore, world: string, player: string) {
  const rec = await kv.get<PlayerRec>(K.player(world, player));
  for (const run of rec?.runs ?? []) for (const id of run.shots) await removeShot(kv, photos, id);
  await kv.zrem(K.board(world), player);
  await kv.zrem(K.boardEnds(world), player);
  await kv.del(K.player(world, player));
}
