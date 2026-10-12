import type { PhotoResult } from './Photo';
import { starsFor } from './Photo';
import type { BuiltWorld } from './types';

/*
 * The saved photo book: for each world, the best photo ever taken of each subject and of each film still,
 * every pose each subject has been photographed in, and the photo requests the rider has completed.
 *
 * Storage:
 * - A small index per world in localStorage (`wonderlens.book.<world>`): scores, stars, poses, dates and
 *   the key of each image. Also the world's catalog (`wonderlens.catalog.<world>`): its subjects and film
 *   stills, saved when the world is built, so the menu can show missing entries without building it.
 * - The images (JPEG data URLs, about 60 KB each) in IndexedDB, database `wonder-lens`, store `images`,
 *   keyed `<world>/s/<subject id>` and `<world>/f/<still id>`.
 * Either can fail (a private window, a full disk). Then the book keeps working for this page session from
 * memory, and `storageStatus` says what was not saved. Nothing here throws.
 *
 * The API is async so the store can later move or sync elsewhere:
 *   loadBook(world)            the world's book and catalog
 *   recordPhoto(world, photo)  keep the photo where it beats the book; says what changed
 *   recordRequest(world, text) remember a completed photo request
 *   listEntries(world)         every saved entry with its image
 *   loadImage(key)             one image
 *   clearBook(world)           forget the world's photos, poses and requests (keeps the catalog)
 *   saveCatalog(catalog)       remember a world's subjects and stills
 * and two pure helpers: catalogOf(world, built) and bookProgress(book).
 */

/** One subject as the book knows it, without building the world. */
export interface CatalogSubject {
  id: string;
  name: string;
  from: string;
  hint: string;
  secret: boolean;
  rarity: 'common' | 'rare' | 'legendary';
  /** reacts to the thrown item or the call, so its reaction poses can be caused on purpose */
  reacts: boolean;
  /** its named poses, without the plain idle one */
  poses: Array<{ id: string; label: string }>;
}
export interface CatalogStill { id: string; name: string; from: string; hint: string; bonus: number; }
/** A world's subjects and film stills, in ride order. */
export interface Catalog { world: string; subjects: CatalogSubject[]; stills: CatalogStill[]; savedAt: number; }

/** The best photo of one subject. */
export interface BookEntry {
  /** the subject's own score in that photo */
  score: number;
  stars: number;
  /** pose id and label in that photo */
  pose: string;
  poseLabel: string;
  /** when it was taken, ms since 1970 */
  date: number;
  /** image key for loadImage */
  image: string;
  /** every pose it has been photographed in: pose id to label (idle included) */
  poses: Record<string, string>;
}
/** The best photo that recreated one film still. */
export interface StillEntry { score: number; date: number; image: string; }
export interface DoneRequest { text: string; date: number; }

export interface PhotoBookData {
  world: string;
  /** null until the world has been built once on this browser */
  catalog: Catalog | null;
  entries: Record<string, BookEntry>;
  stills: Record<string, StillEntry>;
  requests: DoneRequest[];
}

/** What one photo changed in the book. */
export interface BookChange {
  /** subjects photographed for the first time ever */
  newSubjects: string[];
  /** subjects whose best photo this beat */
  better: string[];
  /** [subject id, pose id] pairs never photographed before */
  newPoses: Array<[string, string]>;
  /** film stills matched for the first time */
  newStills: string[];
  /** film stills whose best photo this beat */
  betterStills: string[];
}

/**
 * One saved entry with its image, shaped to map onto a PhotoResult: `image` is the photo's dataUrl, `score`
 * the subject's own score (a film still's: the photo's total), `stars` 0..4.
 */
export interface ListedEntry {
  kind: 'subject' | 'still';
  /** subject id or still id */
  id: string;
  /** the subject's or still's name, from the catalog ('' if the world has no catalog yet) */
  name: string;
  score: number;
  stars: number;
  /** the pose label in that photo ('' for a plain photo or a still) */
  poseLabel: string;
  date: number;
  image: string | null;
}

/** What could not be saved in this browser. Both start true and turn false on the first failure. */
export const storageStatus = { index: true, images: true };

const INDEX_KEY = (world: string) => `wonderlens.book.${world}`;
const CATALOG_KEY = (world: string) => `wonderlens.catalog.${world}`;
const subjectImageKey = (world: string, id: string) => `${world}/s/${id}`;
const stillImageKey = (world: string, id: string) => `${world}/f/${id}`;

/** Copies kept for this page session: the index when localStorage fails, and every image read or written. */
const memIndex = new Map<string, Stored>();
const memCatalog = new Map<string, Catalog>();
const memImages = new Map<string, string>();

interface Stored { entries: Record<string, BookEntry>; stills: Record<string, StillEntry>; requests: DoneRequest[]; }
const emptyStored = (): Stored => ({ entries: {}, stills: {}, requests: [] });

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (storageStatus.index) console.warn('[wonder lens] photo book index not saved', err);
    storageStatus.index = false;
  }
}

function readStored(world: string): Stored {
  const mem = memIndex.get(world);
  if (mem) return mem;
  const s = readJson<Stored>(INDEX_KEY(world));
  const out = emptyStored();
  if (s && typeof s === 'object') {
    out.entries = s.entries ?? {};
    out.stills = s.stills ?? {};
    out.requests = Array.isArray(s.requests) ? s.requests : [];
  }
  memIndex.set(world, out);
  return out;
}
function writeStored(world: string, s: Stored) {
  memIndex.set(world, s);
  writeJson(INDEX_KEY(world), s);
}
function readCatalog(world: string): Catalog | null {
  return memCatalog.get(world) ?? readJson<Catalog>(CATALOG_KEY(world));
}

// ---------- images in IndexedDB ----------
let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open('wonder-lens', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('images');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }).then((d) => {
      if (!d) { storageStatus.images = false; console.warn('[wonder lens] IndexedDB unavailable: photo book images kept for this session only'); }
      return d;
    });
  }
  return dbPromise!;
}
/** Run one request in a transaction; resolves with its result, or null on any failure. */
async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction('images', mode);
      const req = run(tx.objectStore('images'));
      let result: T | null = null;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result ?? (mode === 'readwrite' ? (true as T) : null));
      tx.onerror = tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function putImage(key: string, dataUrl: string) {
  memImages.set(key, dataUrl);
  const ok = await idb('readwrite', (s) => s.put(dataUrl, key));
  if (ok === null && storageStatus.images) {
    storageStatus.images = false;
    console.warn('[wonder lens] photo book image not saved (kept for this session)', key);
  }
}

/** One saved image as a data URL, or null if it was never saved or storage failed. */
export async function loadImage(key: string): Promise<string | null> {
  const mem = memImages.get(key);
  if (mem) return mem;
  const v = await idb<string>('readonly', (s) => s.get(key) as IDBRequest<string>);
  if (typeof v === 'string') { memImages.set(key, v); return v; }
  return null;
}

// ---------- the API ----------

/** A world's book and catalog. Always resolves; an unreadable book comes back empty. */
export async function loadBook(world: string): Promise<PhotoBookData> {
  const s = readStored(world);
  return { world, catalog: readCatalog(world), entries: s.entries, stills: s.stills, requests: s.requests };
}

/** Remember a world's subjects and film stills (called each time the world is built). */
export async function saveCatalog(catalog: Catalog) {
  memCatalog.set(catalog.world, catalog);
  writeJson(CATALOG_KEY(catalog.world), catalog);
}

/**
 * Keep a photo wherever it beats the book: the best photo of each subject in it (by that subject's own
 * score) and of each film still it matched (by the photo's total). Records every pose seen. The index is
 * updated before the first await, so photos taken in quick succession never overwrite each other.
 */
export async function recordPhoto(world: string, photo: PhotoResult): Promise<BookChange> {
  const change: BookChange = { newSubjects: [], better: [], newPoses: [], newStills: [], betterStills: [] };
  const s = readStored(world);
  const date = Date.now();
  const writes: Array<[string, string]> = [];
  for (const shot of photo.shots) {
    const id = shot.subject.id;
    const cur = s.entries[id];
    const stars = photo.primary === shot ? photo.stars : starsFor(shot.score, shot.subject.base);
    if (!cur || !(shot.pose in cur.poses)) change.newPoses.push([id, shot.pose]);
    if (!cur || shot.score > cur.score) {
      const image = subjectImageKey(world, id);
      s.entries[id] = { score: shot.score, stars, pose: shot.pose, poseLabel: shot.poseLabel, date, image, poses: { ...(cur?.poses ?? {}) } };
      (cur ? change.better : change.newSubjects).push(id);
      writes.push([image, photo.dataUrl]);
    }
    s.entries[id].poses[shot.pose] = shot.poseLabel;
  }
  for (const hit of photo.stills ?? []) {
    const cur = s.stills[hit.id];
    if (!cur || photo.total > cur.score) {
      const image = stillImageKey(world, hit.id);
      s.stills[hit.id] = { score: photo.total, date, image };
      (cur ? change.betterStills : change.newStills).push(hit.id);
      writes.push([image, photo.dataUrl]);
    }
  }
  if (change.newPoses.length || writes.length) writeStored(world, s);
  await Promise.all(writes.map(([k, v]) => putImage(k, v)));
  return change;
}

/** Remember a completed photo request, by its text. */
export async function recordRequest(world: string, text: string) {
  const s = readStored(world);
  s.requests.push({ text, date: Date.now() });
  writeStored(world, s);
}

/** Every saved entry of a world (subjects, then film stills), with its image loaded. */
export async function listEntries(world: string): Promise<ListedEntry[]> {
  const s = readStored(world);
  const cat = readCatalog(world);
  const subjectName = (id: string) => cat?.subjects.find((x) => x.id === id)?.name ?? '';
  const stillName = (id: string) => cat?.stills.find((x) => x.id === id)?.name ?? '';
  const list: ListedEntry[] = [
    ...Object.entries(s.entries).map(([id, e]) => ({ kind: 'subject' as const, id, name: subjectName(id), score: e.score, stars: e.stars, poseLabel: e.pose === 'idle' ? '' : e.poseLabel, date: e.date, image: e.image })),
    ...Object.entries(s.stills).map(([id, e]) => ({ kind: 'still' as const, id, name: stillName(id), score: e.score, stars: 4, poseLabel: '', date: e.date, image: e.image })),
  ];
  return Promise.all(list.map(async (e) => ({ ...e, image: await loadImage(e.image!) })));
}

/** Forget a world's photos, poses and completed requests. The catalog stays, so missing entries still show. */
export async function clearBook(world: string) {
  memIndex.set(world, emptyStored());
  try { localStorage.removeItem(INDEX_KEY(world)); } catch { /* the in-memory copy is already empty */ }
  const prefix = `${world}/`;
  for (const k of [...memImages.keys()]) if (k.startsWith(prefix)) memImages.delete(k);
  await idb('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿')));
}

/** A built world's catalog: its subjects and film stills, in the order the world lists them. */
export function catalogOf(world: string, built: Pick<BuiltWorld, 'subjects' | 'filmStills'>): Catalog {
  return {
    world,
    savedAt: Date.now(),
    subjects: built.subjects.map((s) => ({
      id: s.id, name: s.name, from: s.from, hint: s.hint, secret: s.secret, rarity: s.rarity,
      reacts: s.reactsToItems || s.reactsToCall,
      poses: Object.entries(s.poses).filter(([id, p]) => id !== 'idle' && p.label).map(([id, p]) => ({ id, label: p.label })),
    })),
    stills: (built.filmStills ?? []).map((f) => ({ id: f.id, name: f.name, from: f.from, hint: f.hint, bonus: f.bonus })),
  };
}

export interface BookProgress {
  /** regular (not secret) subjects in the book, and how many there are */
  found: number;
  total: number;
  secretsFound: number;
  secretsTotal: number;
  stillsFound: number;
  stillsTotal: number;
}

/** How full a book is. Without a catalog, the totals are unknown and come back 0. */
export function bookProgress(book: Pick<PhotoBookData, 'catalog' | 'entries' | 'stills'>): BookProgress {
  const subs = book.catalog?.subjects ?? [];
  const regular = subs.filter((s) => !s.secret);
  const secrets = subs.filter((s) => s.secret);
  const stills = book.catalog?.stills ?? [];
  return {
    found: regular.filter((s) => book.entries[s.id]).length,
    total: regular.length,
    secretsFound: secrets.filter((s) => book.entries[s.id]).length,
    secretsTotal: secrets.length,
    stillsFound: stills.filter((s) => book.stills[s.id]).length,
    stillsTotal: stills.length,
  };
}
