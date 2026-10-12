import { Redis } from '@upstash/redis';
import { del as blobDel, put as blobPut } from '@vercel/blob';

/*
 * Where the leaderboard keeps its data.
 * On Vercel, scores live in Upstash Redis and photos in Vercel Blob. Both are set up from the
 * Vercel dashboard, which adds their environment variables to the project.
 * On your Mac (`npm run dev`), with no such variables, both live in memory and vanish when the
 * dev server stops.
 */

/** The few key-value and sorted-set operations the leaderboard needs. */
export interface Kv {
  get<T>(key: string): Promise<T | null>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown): Promise<void>;
  del(...keys: string[]): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, ...members: string[]): Promise<void>;
  /** The highest-scoring members, highest first. */
  ztop(key: string, count: number): Promise<{ member: string; score: number }[]>;
  /** A member's place counting from the highest score (0 is first), or null if absent. */
  zplace(key: string, member: string): Promise<number | null>;
  zcount(key: string): Promise<number>;
  /** Members whose score is at most `max`, lowest first. */
  zupTo(key: string, max: number, limit: number): Promise<string[]>;
  /** Add one to a counter that resets `ttlSec` seconds after it was first set. */
  hit(key: string, ttlSec: number): Promise<number>;
}

/** Stores photos and gives back a URL anyone can load. */
export interface PhotoStore {
  put(id: string, jpeg: Uint8Array): Promise<string>;
  remove(url: string): Promise<void>;
}

export class SetupError extends Error {}

const onVercel = () => !!process.env.VERCEL;

export function getKv(): Kv {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashKv(new Redis({ url, token }));
  if (onVercel()) throw new SetupError('No Redis database is connected to this project.');
  return memoryKv();
}

export function getPhotos(): PhotoStore {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return blobPhotos;
  if (onVercel()) throw new SetupError('No Blob store is connected to this project.');
  return memoryPhotos;
}

function upstashKv(r: Redis): Kv {
  return {
    get: (key) => r.get(key),
    mget: async <T>(keys: string[]) => (keys.length ? r.mget<(T | null)[]>(...keys) : []),
    set: async (key, value) => { await r.set(key, value); },
    del: async (...keys) => { if (keys.length) await r.del(...keys); },
    zadd: async (key, score, member) => { await r.zadd(key, { score, member }); },
    zrem: async (key, ...members) => { if (members.length) await r.zrem(key, ...members); },
    ztop: async (key, count) => {
      const flat = await r.zrange<(string | number)[]>(key, 0, count - 1, { rev: true, withScores: true });
      const out: { member: string; score: number }[] = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ member: String(flat[i]), score: Number(flat[i + 1]) });
      return out;
    },
    zplace: (key, member) => r.zrevrank(key, member),
    zcount: (key) => r.zcard(key),
    zupTo: async (key, max, limit) =>
      (await r.zrange<(string | number)[]>(key, 0, max, { byScore: true, offset: 0, count: limit })).map(String),
    hit: async (key, ttlSec) => {
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, ttlSec);
      return n;
    },
  };
}

// ---- in memory, for local development ----
// Kept on globalThis so the data survives Vite reloading these modules after an edit.

interface Mem { kv: Map<string, unknown>; z: Map<string, Map<string, number>>; photos: Map<string, Uint8Array> }
const g = globalThis as unknown as { __wlMem?: Mem };
const mem: Mem = (g.__wlMem ??= { kv: new Map(), z: new Map(), photos: new Map() });
const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));
const zset = (key: string) => {
  let s = mem.z.get(key);
  if (!s) mem.z.set(key, (s = new Map()));
  return s;
};
const ranked = (key: string) => [...zset(key)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));

function memoryKv(): Kv {
  return {
    get: async <T>(key: string) => clone((mem.kv.get(key) as T) ?? null),
    mget: async <T>(keys: string[]) => keys.map((k) => clone((mem.kv.get(k) as T) ?? null)),
    set: async (key, value) => { mem.kv.set(key, clone(value)); },
    del: async (...keys) => { for (const k of keys) { mem.kv.delete(k); mem.z.delete(k); } },
    zadd: async (key, score, member) => { zset(key).set(member, score); },
    zrem: async (key, ...members) => { for (const m of members) zset(key).delete(m); },
    ztop: async (key, count) => ranked(key).slice(0, count).map(([member, score]) => ({ member, score })),
    zplace: async (key, member) => {
      const i = ranked(key).findIndex(([m]) => m === member);
      return i < 0 ? null : i;
    },
    zcount: async (key) => zset(key).size,
    zupTo: async (key, max, limit) =>
      [...zset(key)].filter(([, s]) => s <= max).sort((a, b) => a[1] - b[1]).slice(0, limit).map(([m]) => m),
    hit: async (key) => {
      const n = ((mem.kv.get(key) as number) ?? 0) + 1;
      mem.kv.set(key, n);
      return n;
    },
  };
}

const blobPhotos: PhotoStore = {
  async put(id, jpeg) {
    const res = await blobPut(`shots/${id}.jpg`, Buffer.from(jpeg), {
      access: 'public', contentType: 'image/jpeg', addRandomSuffix: true,
    });
    return res.url;
  },
  async remove(url) { await blobDel(url); },
};

const memoryPhotos: PhotoStore = {
  async put(id, jpeg) {
    mem.photos.set(id, jpeg);
    return `/api/photo?id=${id}`;
  },
  async remove(url) {
    const id = new URL(url, 'http://local').searchParams.get('id');
    if (id) mem.photos.delete(id);
  },
};

/** A photo kept in memory during local development (served by the dev server). */
export const memoryPhoto = (id: string) => mem.photos.get(id) ?? null;
