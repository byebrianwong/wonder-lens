import type { PhotoResult } from './Photo';
import type { Subject } from './Subject';
import type { BookProgress } from './PhotoBook';
import type { Requester } from './types';
import { requestsHtml, type RequestStatus } from './Screens';
import { boardHtml, MAX_SHARE, savedHtml, saveFormHtml, wireShots } from './Board';
import { rememberName, savedName, submitRun } from './Leaderboard';

const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, 4 - n)) + '</span>';

export interface AlbumSummary {
  photos: PhotoResult[];
  bestBySubject: Map<string, PhotoResult>;
  totalScore: number;
  found: number;
  /** the best photo of each film still matched this ride, by still id; each still's bonus counts once */
  stills: Map<string, PhotoResult>;
  rank: string;
  rankBlurb: string;
}

export function summarize(photos: PhotoResult[], subjects: Subject[]): AlbumSummary {
  const best = new Map<string, PhotoResult>();
  for (const p of photos) {
    for (const s of p.shots) {
      const cur = best.get(s.subject.id);
      if (!cur || s.score > (cur.shots.find((x) => x.subject.id === s.subject.id)?.score ?? 0)) best.set(s.subject.id, p);
    }
  }
  // like Pokemon Snap: your album score is the best shot of each subject, plus a little for volume
  let total = 0;
  for (const [id, p] of best) total += p.shots.find((x) => x.subject.id === id)?.score ?? 0;
  const stills = new Map<string, PhotoResult>();
  for (const p of photos) for (const h of p.stills ?? []) if (!stills.has(h.id)) { stills.set(h.id, p); total += h.bonus; }
  const found = best.size;
  // secret subjects count towards the rank only as a bonus: a ride that misses them can still be a Legend
  const regular = subjects.filter((s) => !s.secret).length;
  const ratio = regular ? Math.min(1, found / regular) : 0;
  const rank = ratio >= 0.9 && total > 14000 ? 'Legend' : ratio >= 0.7 ? 'Wanderer' : ratio >= 0.45 ? 'Explorer' : ratio > 0.2 ? 'Visitor' : 'Passenger';
  const blurb = {
    Legend: 'You saw everything and framed it beautifully. The spirits know your name.',
    Wanderer: 'A wonderful album. A few characters are still hiding out there.',
    Explorer: 'A good eye. Try calling out or throwing things to make the world react.',
    Visitor: 'You caught a few glimpses. Ride again and look everywhere, including behind you.',
    Passenger: 'Sometimes it is enough to just watch the world go by.',
  }[rank]!;
  return { photos, bestBySubject: best, totalScore: total, found, stills, rank, rankBlurb: blurb };
}

/** What the album shows beyond the ride itself: the photo book and the photo requests. */
export interface AlbumExtras {
  /** subjects this ride added to the photo book ('new') or improved ('best'), keyed 's:<id>' ('f:<id>' for stills) */
  fresh?: Map<string, 'new' | 'best'>;
  /** secret subjects already in the photo book before this ride: the field guide may name them */
  knownSecrets?: Set<string>;
  /** the photo book after this ride */
  book?: BookProgress;
  onBook?: () => void;
  requester?: Requester;
  requests?: RequestStatus[];
  /** the world's id: shows the form that saves the ride to the leaderboard */
  worldId?: string;
}

/** Full-screen end-of-ride album. */
export class Album {
  root: HTMLElement;
  constructor(parent: HTMLElement, summary: AlbumSummary, subjects: Subject[], worldTitle: string, accent: string,
    onAgain: () => void, onMenu: () => void, relax: boolean, extras: AlbumExtras = {}) {
    this.root = document.createElement('div');
    this.root.className = 'album';
    this.root.style.setProperty('--accent', accent);
    const total = summary.totalScore.toLocaleString();
    const guide = subjects.map((s) => {
      const p = summary.bestBySubject.get(s.id);
      const shot = p?.shots.find((x) => x.subject.id === s.id);
      // an unknown secret stays a secret: no hint
      if (!p && s.secret && !extras.knownSecrets?.has(s.id)) {
        return `<div class="guide-item secret"><div class="guide-thumb"><span>?</span></div>
          <div class="guide-text"><div class="guide-name">???</div><div class="guide-from">A secret</div></div></div>`;
      }
      const fresh = extras.fresh?.get('s:' + s.id);
      return `<div class="guide-item ${p ? 'found' : ''}">
        <div class="guide-thumb">${p ? `<img src="${p.dataUrl}">` : '<span>?</span>'}</div>
        ${fresh ? `<span class="ribbon ${fresh}">${fresh === 'new' ? 'New' : 'New best'}</span>` : ''}
        <div class="guide-text"><div class="guide-name">${p ? s.name : '???'}</div>
        <div class="guide-from">${p ? s.from : 'Not yet photographed'}</div>
        ${shot ? `<div class="guide-score">${shot.score.toLocaleString()} pts${shot.pose !== 'idle' ? ' · ' + shot.poseLabel : ''}</div>` : `<div class="guide-hint">${s.hint || ''}</div>`}</div>
      </div>`;
    }).join('');
    const regular = subjects.filter((s) => !s.secret);
    const regularFound = regular.filter((s) => summary.bestBySubject.has(s.id)).length;
    const secretsFound = summary.found - regularFound;
    const book = extras.book;
    const freshCount = extras.fresh?.size ?? 0;
    const requests = extras.requests?.length
      ? `<section class="album-requests">${requestsHtml(extras.requester, extras.requests)}</section>` : '';
    const sorted = summary.photos.slice().sort((a, b) => b.total - a.total);
    const hero = sorted[0];
    const heroHtml = hero ? `<section class="hero-shot"><h2>Shot of the ride</h2><figure class="album-photo hero" data-id="${hero.id}"><img src="${hero.dataUrl}"><figcaption><b>${hero.primary ? hero.primary.subject.name : 'Scenery'}</b><span>${stars(hero.stars)}</span><em>${hero.total.toLocaleString()} pts${hero.bonuses.length ? ' · ' + hero.bonuses.join(' · ') : ''}</em></figcaption></figure></section>` : '';
    const photos = sorted.map((p) => `
      <figure class="album-photo" data-id="${p.id}">
        <img src="${p.dataUrl}">
        <figcaption><b>${p.primary ? p.primary.subject.name : 'Scenery'}</b><span>${stars(p.stars)}</span><em>${p.total.toLocaleString()} pts</em></figcaption>
      </figure>`).join('');
    this.root.innerHTML = `
      <div class="album-inner">
        <header class="album-head">
          <div class="album-kicker">${relax ? 'Ride complete' : 'Album review'} · ${worldTitle}</div>
          <h1>${relax ? 'Thank you for riding' : summary.rank}</h1>
          <p>${summary.rankBlurb}</p>
          <div class="album-stats">
            <div><b>${total}</b><span>album score</span></div>
            <div><b>${regularFound}<i>/${regular.length}</i></b><span>subjects found${secretsFound ? ` +${secretsFound} secret` : ''}</span></div>
            <div><b>${summary.photos.length}</b><span>photos taken</span></div>
            ${book ? `<div><b>${book.found}<i>/${book.total}</i></b><span>photo book${freshCount ? ` · ${freshCount} new` : ''}</span></div>` : ''}
          </div>
          <div class="album-actions">
            <button class="btn primary" data-act="again">Ride again</button>
            ${extras.onBook ? '<button class="btn" data-act="book">Open the photo book</button>' : ''}
            <button class="btn" data-act="menu">Choose a world</button>
          </div>
        </header>
        ${extras.worldId && !relax && summary.totalScore > 0 ? '<section class="lb-save"></section>' : ''}
        ${heroHtml}
        ${requests}
        <section><h2>Field guide</h2><div class="guide">${guide}</div></section>
        <section><h2>Your photos</h2><div class="album-grid">${photos || '<p class="empty">No photos this time. Next ride, try the shutter.</p>'}</div></section>
      </div>
      <div class="lightbox"><img><div class="lightbox-bar"><a class="btn" download="ride-photo.jpg">Save photo</a><button class="btn" data-act="close">Close</button></div></div>`;
    parent.appendChild(this.root);
    requestAnimationFrame(() => this.root.classList.add('show'));
    this.root.querySelector('[data-act=again]')!.addEventListener('click', onAgain);
    this.root.querySelector('[data-act=menu]')!.addEventListener('click', onMenu);
    this.root.querySelector('[data-act=book]')?.addEventListener('click', () => extras.onBook?.());
    const lb = this.root.querySelector('.lightbox') as HTMLElement;
    const lbImg = lb.querySelector('img') as HTMLImageElement;
    const lbLink = lb.querySelector('a') as HTMLAnchorElement;
    this.root.querySelectorAll('.album-photo').forEach((f) => f.addEventListener('click', () => {
      const id = Number((f as HTMLElement).dataset.id);
      const p = summary.photos.find((x) => x.id === id);
      if (!p) return;
      lbImg.src = p.dataUrl; lbLink.href = p.dataUrl;
      lb.classList.add('show');
    }));
    lb.querySelector('[data-act=close]')!.addEventListener('click', () => lb.classList.remove('show'));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('show'); });
    const save = this.root.querySelector('.lb-save') as HTMLElement | null;
    if (save && extras.worldId) mountSave(save, summary, sorted, extras.worldId);
  }
  destroy() { this.root.remove(); }
}

/** The "save to the leaderboard" form: a name, up to three photos to share, then the board. */
function mountSave(section: HTMLElement, summary: AlbumSummary, sorted: PhotoResult[], worldId: string) {
  const options = sorted.slice(0, 6).map((p) => ({ id: p.id, dataUrl: p.dataUrl, label: p.primary ? p.primary.subject.name : 'Scenery' }));
  const picked = new Set(options.slice(0, 1).map((o) => o.id));
  section.innerHTML = saveFormHtml({ name: savedName(), photos: options, picked: [...picked] });
  const status = section.querySelector('.lb-status') as HTMLElement;
  section.querySelectorAll<HTMLButtonElement>('.lb-pick-item').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.id);
    if (picked.has(id)) picked.delete(id);
    else if (picked.size < MAX_SHARE) picked.add(id);
    else { status.textContent = `You can share up to ${MAX_SHARE} photos.`; return; }
    status.textContent = '';
    b.classList.toggle('on', picked.has(id));
    b.setAttribute('aria-pressed', String(picked.has(id)));
  }));
  const form = section.querySelector('form') as HTMLFormElement;
  const input = section.querySelector('.lb-name') as HTMLInputElement;
  const button = section.querySelector('.lb-save-btn') as HTMLButtonElement;
  // keys typed into the name box must not reach the game's own shortcuts (M mutes)
  input.addEventListener('keydown', (e) => e.stopPropagation());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    button.disabled = true; input.disabled = true;
    button.textContent = picked.size ? 'Checking photos…' : 'Saving…';
    status.textContent = '';
    const result = await submitRun({
      world: worldId, name, score: summary.totalScore, found: summary.found, rank: summary.rank,
      photos: sorted.filter((p) => picked.has(p.id)),
    });
    if (result.ok) {
      rememberName(name);
      section.innerHTML = `<h2>Leaderboard</h2>${savedHtml(result.place, result.board.players, result.photos)}<div class="lb-board">${boardHtml(result.board, { rows: 10 })}</div>`;
      wireShots(section);
    } else {
      button.disabled = false; input.disabled = false;
      button.textContent = 'Save score';
      status.textContent = result.message;
      if (result.error === 'name') input.focus();
    }
  });
}
