import Anthropic from '@anthropic-ai/sdk';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/*
 * Safety checks for what players send to the public leaderboard.
 *
 * Names go through two checks: a word filter that runs here (instant, free), then Claude.
 * Photos go through Claude only. Claude is asked whether each image is a frame from the game and
 * fit for a general audience. A photo is shown to other players only when Claude approves it.
 * If Claude is not set up (no ANTHROPIC_API_KEY) or the check fails, the photo waits for Brian
 * to approve it on /admin.html.
 */

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** Allowed characters: letters in any language, digits, spaces and . - _ ' */
const NAME_CHARS = /^[\p{L}\p{N} ._'-]+$/u;

/** Clean up a name and check it with the word filter. Returns the name, or null if it is not allowed. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 16) return null;
  if (!NAME_CHARS.test(name)) return null;
  if (matcher.hasMatch(name)) return null;
  return name;
}

export type Verdict = 'approved' | 'rejected' | 'pending';

export interface Review {
  /** false only when Claude ran and turned the name down */
  nameOk: boolean;
  nameReason: string;
  photos: { verdict: Verdict; reason: string }[];
}

const MODEL = 'claude-sonnet-5-5';

const SYSTEM = `You review player submissions for the public leaderboard of Wonder Lens, a browser game. Players ride through stylized, painterly 3D worlds (a Studio Ghibli style dream at night, a Wes Anderson style pastel film set, an Amélie style Paris) and photograph the characters they meet. A genuine photo is a frame rendered by the game: soft 3D scenery, cartoon or toy-like characters and figures, no real people, and no on-screen writing.

Anyone can see the leaderboard, including children. Decide two things.

1. The player name. Approve it unless it is offensive, sexual, hateful or harassing, mocks a real person, contains a link, handle, email or other contact detail, or spells something offensive using numbers, symbols, spacing or another language.

2. Each photo. Approve it only if it clearly looks like a frame from a stylized 3D game like this one. Reject it if it looks like a real photograph, a screenshot of something else, has readable text, writing or drawing added on top, has a QR code, or shows nudity or sexual content, gore, hate symbols, or anything else unfit for a general audience. Scenery with no characters is fine. When unsure, reject it.

Keep each reason under 15 words. Return one entry per photo, in the order given, with its index starting at 0.`;

const SCHEMA = {
  type: 'object',
  properties: {
    name_ok: { type: 'boolean' },
    name_reason: { type: 'string' },
    photos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, ok: { type: 'boolean' }, reason: { type: 'string' } },
        required: ['index', 'ok', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['name_ok', 'name_reason', 'photos'],
  additionalProperties: false,
};

interface ClaudeAnswer { name_ok: boolean; name_reason: string; photos: { index: number; ok: boolean; reason: string }[] }

/**
 * Ask Claude about a name and up to three JPEG photos. Never throws.
 * `useClaude` is false once the day's limit of checks is used up; the name then has only the word
 * filter, and the photos wait for review.
 */
export async function review(name: string, photos: Uint8Array[], useClaude = true): Promise<Review> {
  const pending = (reason: string): Review => ({
    nameOk: true, nameReason: reason, photos: photos.map(() => ({ verdict: 'pending', reason })),
  });
  if (!process.env.ANTHROPIC_API_KEY) return pending('Automatic check is not set up');
  if (!useClaude) return pending("Today's limit of automatic checks was reached");
  try {
    const client = new Anthropic({ maxRetries: 1, timeout: 25_000 });
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    photos.forEach((jpeg, i) => {
      content.push({ type: 'text', text: `Photo ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(jpeg).toString('base64') } });
    });
    content.push({ type: 'text', text: `Player name: ${JSON.stringify(name)}\nNumber of photos: ${photos.length}` });
    const res = await client.beta.messages.create({
      model: MODEL,
      // the answer is a short JSON object; this also caps what one check can cost
      max_tokens: 2000,
      // if a safety classifier declines the request, Anthropic re-runs it on a fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (res.stop_reason === 'refusal') return pending('Automatic check declined to answer');
    const text = res.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return pending('Automatic check gave no answer');
    const answer = JSON.parse(text.text) as ClaudeAnswer;
    return {
      nameOk: answer.name_ok,
      nameReason: answer.name_reason,
      photos: photos.map((_, i) => {
        const p = answer.photos.find((x) => x.index === i);
        if (!p) return { verdict: 'pending', reason: 'Automatic check skipped this photo' };
        return { verdict: p.ok ? 'approved' : 'rejected', reason: p.reason };
      }),
    };
  } catch (err) {
    console.error('[leaderboard] photo check failed', err);
    return pending('Automatic check failed');
  }
}
