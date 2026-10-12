import type { BoardData, BoardRow, SharedShot, Verdict } from '../../server/types';
import type { WorldDef } from './types';
import { fetchBoard } from './Leaderboard';

/*
 * The leaderboard screens: the board itself (scores and shared photos), the panel that opens it
 * from the menu, and the "save your score" form on the album. The markup functions take plain
 * data, so Storybook can draw them without a server.
 */

/** Names and subjects come from players, so everything they typed is escaped before it goes into HTML. */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, 4 - n)) + '</span>';

export function ago(at: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - at) / 60000));
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function rowHtml(r: BoardRow, now: number): string {
  return `<li class="lb-row ${r.you ? 'you' : ''}">
    <span class="lb-place">${r.place}</span>
    <span class="lb-thumb">${r.photo ? `<img src="${esc(r.photo)}" alt="" loading="lazy">` : ''}</span>
    <span class="lb-who"><b>${esc(r.name)}</b>${r.you ? '<i>you</i>' : ''}<small>${esc(r.rank)} · ${r.found}/${r.total} found · ${ago(r.at, now)}</small></span>
    <span class="lb-score">${r.score.toLocaleString()}</span>
  </li>`;
}

function shotHtml(s: SharedShot, now: number): string {
  return `<figure class="lb-shot ${s.you ? 'you' : ''}" data-url="${esc(s.url)}">
    <img src="${esc(s.url)}" alt="${esc(s.subject)}, photographed by ${esc(s.name)}" loading="lazy">
    <figcaption><b>${esc(s.subject)}</b><span>${stars(s.stars)}</span><em>${esc(s.name)} · ${s.score.toLocaleString()} pts · ${ago(s.at, now)}</em></figcaption>
  </figure>`;
}

/** The scores list and the shared photos for one world. */
export function boardHtml(data: BoardData, o: { rows?: number; now?: number } = {}): string {
  const now = o.now ?? Date.now();
  const rows = data.rows.slice(0, o.rows ?? data.rows.length);
  const youShown = rows.some((r) => r.you);
  const list = rows.map((r) => rowHtml(r, now)).join('')
    + (data.you && !youShown ? `<li class="lb-gap">…</li>${rowHtml(data.you, now)}` : '');
  return `
    <div class="lb-scores">
      <h3>Top scores <span>last ${data.windowDays} days · ${data.players.toLocaleString()} ${data.players === 1 ? 'player' : 'players'}</span></h3>
      ${list ? `<ol class="lb-list">${list}</ol>` : '<p class="lb-empty">No scores yet. Finish a Snap ride and be the first.</p>'}
    </div>
    <div class="lb-gallery">
      <h3>Best shared shots</h3>
      ${data.shots.length ? `<div class="lb-shots">${data.shots.map((s) => shotHtml(s, now)).join('')}</div>`
        : '<p class="lb-empty">No shared photos yet. Share your best ones when you save a score.</p>'}
    </div>`;
}

/** Open a shared photo full size when it is clicked. */
function wireShots(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.lb-shot').forEach((f) => f.addEventListener('click', () => {
    const lb = document.createElement('div');
    lb.className = 'lightbox show';
    lb.innerHTML = `<img src="${esc(f.dataset.url ?? '')}" alt=""><div class="lightbox-bar"><button class="btn" data-act="close">Close</button></div>`;
    lb.addEventListener('click', (e) => { if (e.target === lb || (e.target as HTMLElement).dataset.act === 'close') lb.remove(); });
    root.appendChild(lb);
  }));
}

// ---------- the panel opened from the menu ----------

export interface PanelState { worlds: WorldDef[]; selected: WorldDef }

/** The leaderboard panel's frame, with a tab per world. The board goes in `.lb-body`. */
export function panelElement({ worlds, selected }: PanelState): HTMLElement {
  const p = document.createElement('div');
  p.className = 'lb-panel';
  p.style.setProperty('--accent', selected.accent);
  p.innerHTML = `
    <div class="lb-box" role="dialog" aria-label="Leaderboards">
      <header class="lb-head">
        <h2>Leaderboards</h2>
        <button class="btn ghost lb-close" data-act="close" aria-label="Close">Close</button>
      </header>
      <div class="lb-tabs">${worlds.map((w) => `<button class="lb-tab ${w.id === selected.id ? 'on' : ''}" data-id="${w.id}" style="--accent:${w.accent}">${w.title}</button>`).join('')}</div>
      <div class="lb-body"><p class="lb-empty">Loading…</p></div>
    </div>`;
  return p;
}

/** Show the leaderboard panel over the menu, loading each world's board from the server. */
export function openPanel(parent: HTMLElement, worlds: WorldDef[], selected: WorldDef) {
  const p = panelElement({ worlds, selected });
  parent.appendChild(p);
  requestAnimationFrame(() => p.classList.add('show'));
  const body = p.querySelector('.lb-body') as HTMLElement;
  let showing = '';
  const load = async (w: WorldDef) => {
    showing = w.id;
    p.style.setProperty('--accent', w.accent);
    p.querySelectorAll<HTMLElement>('.lb-tab').forEach((t) => t.classList.toggle('on', t.dataset.id === w.id));
    body.innerHTML = '<p class="lb-empty">Loading…</p>';
    try {
      const data = await fetchBoard(w.id);
      if (showing !== w.id) return;
      body.innerHTML = boardHtml(data);
      wireShots(body);
    } catch {
      if (showing === w.id) body.innerHTML = '<p class="lb-empty">The leaderboard could not be reached. Try again in a moment.</p>';
    }
  };
  p.querySelectorAll<HTMLElement>('.lb-tab').forEach((t) => t.addEventListener('click', () => {
    const w = worlds.find((x) => x.id === t.dataset.id);
    if (w) load(w);
  }));
  const close = () => { p.remove(); window.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  p.addEventListener('click', (e) => { if (e.target === p) close(); });
  p.querySelector('[data-act=close]')!.addEventListener('click', close);
  load(selected);
}

// ---------- the save form on the album ----------

export interface SaveFormState {
  name: string;
  /** album photos to choose from, best first */
  photos: { id: number; dataUrl: string; label: string }[];
  /** ids picked to share */
  picked: number[];
}

export const MAX_SHARE = 3;

export function saveFormHtml({ name, photos, picked }: SaveFormState): string {
  return `
    <h2>Save to the leaderboard</h2>
    <p class="lb-note">Your best run from the last 30 days stays on the board. Come back on this browser and it will still be there.</p>
    <form class="lb-form">
      <input class="lb-name" name="name" maxlength="16" autocomplete="nickname" placeholder="Your name" value="${esc(name)}" aria-label="Your name" required>
      <button class="btn primary lb-save-btn" type="submit">Save score</button>
    </form>
    ${photos.length ? `
      <div class="lb-pick-head">Share up to ${MAX_SHARE} photos with other players <span>Each one is checked for safety before anyone else sees it.</span></div>
      <div class="lb-pick">${photos.map((p) => `
        <button type="button" class="lb-pick-item ${picked.includes(p.id) ? 'on' : ''}" data-id="${p.id}" aria-pressed="${picked.includes(p.id)}">
          <img src="${p.dataUrl}" alt=""><span>${esc(p.label)}</span>
        </button>`).join('')}
      </div>` : ''}
    <div class="lb-status" role="status"></div>`;
}

/** What the player sees after saving: their place and what happened to each shared photo. */
export function savedHtml(place: number, players: number, verdicts: Verdict[]): string {
  const shared = verdicts.filter((v) => v === 'approved').length;
  const waiting = verdicts.filter((v) => v === 'pending').length;
  const refused = verdicts.filter((v) => v === 'rejected').length;
  const notes = [
    shared ? `${shared} ${shared === 1 ? 'photo is' : 'photos are'} now shared.` : '',
    waiting ? `${waiting} ${waiting === 1 ? 'photo is' : 'photos are'} waiting for a quick review before others can see ${waiting === 1 ? 'it' : 'them'}.` : '',
    refused ? `${refused} ${refused === 1 ? 'photo' : 'photos'} could not be shared.` : '',
  ].filter(Boolean).join(' ');
  return `<div class="lb-saved"><b>You're #${place}</b> of ${players.toLocaleString()} ${players === 1 ? 'player' : 'players'} in the last 30 days.${notes ? ` <span>${notes}</span>` : ''}</div>`;
}

export { wireShots };
