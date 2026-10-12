import type { PhotoResult } from './Photo';
import type { PhotoBookData } from './PhotoBook';

/*
 * Photo requests: before each ride a character of the world asks for three shots the photo book does not
 * have yet. They are picked from the world's catalog, so they change as the book fills.
 */

export interface PhotoRequest {
  /** a first photo of a subject, a subject in a pose, or a film still */
  kind: 'subject' | 'pose' | 'still';
  /** subject id or still id */
  target: string;
  /** pose id, for kind 'pose' */
  pose?: string;
  /** what to photograph, for example 'Totoro' */
  title: string;
  /** the pose label, 'a first photo', or 'film still' */
  detail: string;
}

export const requestText = (r: PhotoRequest) => `${r.title} · ${r.detail}`;

/** True when the photo does what the request asks. Any subject in the photo counts, not only the main one. */
export function requestMet(r: PhotoRequest, photo: PhotoResult): boolean {
  if (r.kind === 'still') return !!photo.stills?.some((h) => h.id === r.target);
  return photo.shots.some((s) => s.subject.id === r.target && (r.kind === 'subject' || s.pose === r.pose));
}

/**
 * Pick up to `n` requests the book does not have yet, at most one per subject. Poses of subjects that react
 * to the thrown item or the call are preferred, because the rider can cause them. Secret subjects are only
 * asked for once they are in the book, so a request never gives one away.
 */
export function pickRequests(book: PhotoBookData, n = 3, random = Math.random): PhotoRequest[] {
  const cat = book.catalog;
  if (!cat) return [];
  const cands: Array<{ r: PhotoRequest; w: number; order: number }> = [];
  // two subjects can share a name (the Anderson world has two prosceniums): then the film tells them apart
  const named = new Map<string, number>();
  for (const s of cat.subjects) named.set(s.name, (named.get(s.name) ?? 0) + 1);
  cat.subjects.forEach((s, i) => {
    const entry = book.entries[s.id];
    if (s.secret && !entry) return;
    const title = named.get(s.name)! > 1 ? `${s.name} (${s.from})` : s.name;
    for (const p of s.poses) {
      if (entry && p.id in entry.poses) continue;
      cands.push({ r: { kind: 'pose', target: s.id, pose: p.id, title, detail: p.label }, w: (s.reacts ? 3 : 1.5) * (entry ? 1 : 0.6), order: i });
    }
    if (!entry) cands.push({ r: { kind: 'subject', target: s.id, title, detail: 'a first photo' }, w: 2, order: i });
  });
  cat.stills.forEach((f, i) => {
    if (!book.stills[f.id]) cands.push({ r: { kind: 'still', target: f.id, title: f.name, detail: 'film still' }, w: 2.5, order: cat.subjects.length + i });
  });
  const picked: typeof cands = [];
  while (picked.length < n && cands.length) {
    const total = cands.reduce((a, c) => a + c.w, 0);
    let x = random() * total;
    let k = 0;
    while (k < cands.length - 1 && (x -= cands[k].w) > 0) k++;
    const c = cands[k];
    picked.push(c);
    // one request per subject; a second film still only when little else is left
    for (let j = cands.length - 1; j >= 0; j--) {
      if (cands[j].r.target === c.r.target) cands.splice(j, 1);
      else if (c.r.kind === 'still' && cands[j].r.kind === 'still') cands[j].w *= 0.2;
    }
  }
  return picked.sort((a, b) => a.order - b.order).map((c) => c.r);
}

const cache = new Map<string, PhotoRequest[]>();

/**
 * The requests for a world's next ride. They stay the same until dropRequests is called (at the end of a
 * ride), so the start screen, the HUD and the album show the same three.
 */
export function currentRequests(book: PhotoBookData): PhotoRequest[] {
  let list = cache.get(book.world);
  if (!list || !list.length) {
    list = pickRequests(book);
    if (list.length) cache.set(book.world, list);
  }
  return list;
}
/** Forget a world's requests, so the next ride picks new ones from the book as it is now. */
export function dropRequests(world: string) { cache.delete(world); }
