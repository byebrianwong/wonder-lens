import type { PhotoResult } from './Photo';
import type { Subject } from './Subject';

const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, 4 - n)) + '</span>';

export interface AlbumSummary {
  photos: PhotoResult[];
  bestBySubject: Map<string, PhotoResult>;
  totalScore: number;
  found: number;
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
  const found = best.size;
  const ratio = subjects.length ? found / subjects.length : 0;
  const rank = ratio >= 0.9 && total > 14000 ? 'Legend' : ratio >= 0.7 ? 'Wanderer' : ratio >= 0.45 ? 'Explorer' : ratio > 0.2 ? 'Visitor' : 'Passenger';
  const blurb = {
    Legend: 'You saw everything and framed it beautifully. The spirits know your name.',
    Wanderer: 'A wonderful album. A few characters are still hiding out there.',
    Explorer: 'A good eye. Try calling out or throwing things to make the world react.',
    Visitor: 'You caught a few glimpses. Ride again and look everywhere, including behind you.',
    Passenger: 'Sometimes it is enough to just watch the world go by.',
  }[rank]!;
  return { photos, bestBySubject: best, totalScore: total, found, rank, rankBlurb: blurb };
}

/** Full-screen end-of-ride album. */
export class Album {
  root: HTMLElement;
  constructor(parent: HTMLElement, summary: AlbumSummary, subjects: Subject[], worldTitle: string, accent: string,
    onAgain: () => void, onMenu: () => void, relax: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'album';
    this.root.style.setProperty('--accent', accent);
    const total = summary.totalScore.toLocaleString();
    const guide = subjects.map((s) => {
      const p = summary.bestBySubject.get(s.id);
      const shot = p?.shots.find((x) => x.subject.id === s.id);
      return `<div class="guide-item ${p ? 'found' : ''}">
        <div class="guide-thumb">${p ? `<img src="${p.dataUrl}">` : '<span>?</span>'}</div>
        <div class="guide-text"><div class="guide-name">${p ? s.name : '???'}</div>
        <div class="guide-from">${p ? s.from : 'Not yet photographed'}</div>
        ${shot ? `<div class="guide-score">${shot.score.toLocaleString()} pts${shot.pose !== 'idle' ? ' · ' + shot.poseLabel : ''}</div>` : `<div class="guide-hint">${s.hint || ''}</div>`}</div>
      </div>`;
    }).join('');
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
            <div><b>${summary.found}<i>/${subjects.length}</i></b><span>subjects found</span></div>
            <div><b>${summary.photos.length}</b><span>photos taken</span></div>
          </div>
          <div class="album-actions">
            <button class="btn primary" data-act="again">Ride again</button>
            <button class="btn" data-act="menu">Choose a world</button>
          </div>
        </header>
        ${heroHtml}
        <section><h2>Field guide</h2><div class="guide">${guide}</div></section>
        <section><h2>Your photos</h2><div class="album-grid">${photos || '<p class="empty">No photos this time. Next ride, try the shutter.</p>'}</div></section>
      </div>
      <div class="lightbox"><img><div class="lightbox-bar"><a class="btn" download="ride-photo.jpg">Save photo</a><button class="btn" data-act="close">Close</button></div></div>`;
    parent.appendChild(this.root);
    requestAnimationFrame(() => this.root.classList.add('show'));
    this.root.querySelector('[data-act=again]')!.addEventListener('click', onAgain);
    this.root.querySelector('[data-act=menu]')!.addEventListener('click', onMenu);
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
  }
  destroy() { this.root.remove(); }
}
