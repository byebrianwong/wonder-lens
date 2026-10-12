import type { BoardData, SubmitBody, SubmitResult } from '../../server/types';
import type { PhotoResult } from './Photo';

/*
 * The game's side of the leaderboard: who this player is, and the two calls to the server.
 *
 * There are no accounts. The first time someone saves a score, this browser makes up a random
 * player id and keeps it, with the name they typed, in localStorage. On the same browser they
 * keep the same line on the board; on another browser or device they start a new one.
 */

const ID_KEY = 'wl.player';
const NAME_KEY = 'wl.name';

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private window: the id lasts for this visit only */ }
}

let sessionId: string | null = null;

/** This browser's player id, made on first use. */
export function playerId(): string {
  let id = stored(ID_KEY) ?? sessionId;
  if (!id) {
    id = crypto.randomUUID();
    store(ID_KEY, id);
  }
  sessionId = id;
  return id;
}

/** The id if this browser has ever saved a score, without making one. */
export const knownPlayer = () => stored(ID_KEY) ?? sessionId;

export const savedName = () => stored(NAME_KEY) ?? '';
export const rememberName = (name: string) => store(NAME_KEY, name);

export async function fetchBoard(world: string): Promise<BoardData> {
  const q = new URLSearchParams({ world });
  const player = knownPlayer();
  if (player) q.set('player', player);
  const res = await fetch(`/api/board?${q}`);
  if (!res.ok) throw new Error(`board ${res.status}`);
  return res.json();
}

/** Re-encode an album photo smaller for sharing: 640 px wide, about 50-90 KB. Returns base64 without the data: prefix. */
export async function shrinkPhoto(dataUrl: string, maxW = 640): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}

export interface SaveRun {
  world: string;
  name: string;
  score: number;
  found: number;
  rank: string;
  photos: PhotoResult[];
}

export async function submitRun(run: SaveRun): Promise<SubmitResult> {
  const body: SubmitBody = {
    world: run.world,
    player: playerId(),
    name: run.name,
    score: run.score,
    found: run.found,
    rank: run.rank,
    photos: await Promise.all(run.photos.map(async (p) => ({
      jpeg: await shrinkPhoto(p.dataUrl),
      subject: p.primary ? p.primary.subject.name : 'Scenery',
      score: p.total,
      stars: p.stars,
    }))),
  };
  try {
    const res = await fetch('/api/submit', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'offline', message: 'Could not reach the leaderboard. Check your connection and try again.' };
  }
}
