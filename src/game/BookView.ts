import { bookProgress, loadImage, storageStatus, type PhotoBookData } from './PhotoBook';

/*
 * The photo book screen: a world's best photo of every subject and film still, blank cards for the ones
 * still missing, and the photo requests done. It only draws what it is given; PhotoBook.ts does the storage.
 */

const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, 4 - n)) + '</span>';
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export interface BookViewData {
  worldTitle: string;
  accent: string;
  book: PhotoBookData;
  /** entries the ride just added ('new') or improved ('best'), keyed 's:<subject id>' or 'f:<still id>' */
  fresh?: Map<string, 'new' | 'best'>;
  /** images by key, used before loadImage (Storybook passes them all here) */
  images?: Record<string, string>;
  /** override the saving check, for stories */
  saving?: boolean;
}

export interface BookViewActions {
  onClose: () => void;
  /** clear the book; resolves with the emptied book, which the view then shows */
  onClear: () => Promise<PhotoBookData>;
}

/** Full-screen photo book, opened from the world menu or from the end-of-ride album. */
export class BookView {
  root: HTMLElement;
  private d: BookViewData;
  private a: BookViewActions;

  constructor(parent: HTMLElement, d: BookViewData, a: BookViewActions) {
    this.d = d;
    this.a = a;
    this.root = document.createElement('div');
    this.root.className = 'book';
    this.root.style.setProperty('--accent', d.accent);
    this.render();
    parent.appendChild(this.root);
    requestAnimationFrame(() => this.root.classList.add('show'));
  }

  private render() {
    const { book, fresh } = this.d;
    const cat = book.catalog;
    const p = bookProgress(book);
    const ribbon = (key: string) => {
      const f = fresh?.get(key);
      return f ? `<span class="ribbon ${f}">${f === 'new' ? 'New' : 'New best'}</span>` : '';
    };
    const subjects = (cat?.subjects ?? []).map((s) => {
      const e = book.entries[s.id];
      if (!e && s.secret) {
        return `<figure class="book-card secret"><div class="book-photo blank"><span>???</span></div>
          <figcaption><b>???</b><em>A secret</em><p class="hint">Something on the ride brings it out. Photograph it once to fill this page.</p></figcaption></figure>`;
      }
      if (!e) {
        return `<figure class="book-card missing"><div class="book-photo blank"><span>?</span></div>
          <figcaption><b>${s.name}</b><em>${s.from}</em><p class="hint">${s.hint}</p></figcaption></figure>`;
      }
      const seen = s.poses.filter((q) => q.id in e.poses).length;
      const poses = s.poses.length ? `<div class="book-poses"><span class="count">${seen} of ${s.poses.length} ${s.poses.length === 1 ? 'pose' : 'poses'}</span>${s.poses.map((q) => `<span class="${q.id in e.poses ? 'on' : ''}">${q.label}</span>`).join('')}</div>` : '';
      return `<figure class="book-card found ${s.secret ? 'was-secret' : ''}" data-key="${e.image}">
        <div class="book-photo"><img alt=""></div>${ribbon('s:' + s.id)}
        <figcaption><b>${s.name}</b><span class="book-stars">${stars(e.stars)}</span>
        <em>${e.score.toLocaleString()} pts${e.pose !== 'idle' && e.poseLabel ? ' · ' + e.poseLabel : ''}</em>${poses}<small>${s.secret ? 'Secret · ' : ''}${day(e.date)}</small></figcaption></figure>`;
    }).join('');
    const stillCards = (cat?.stills ?? []).map((f) => {
      const e = book.stills[f.id];
      if (!e) return `<figure class="book-card missing still"><div class="book-photo blank"><span>✦</span></div>
        <figcaption><b>${f.name}</b><em>${f.from}</em><p class="hint">${f.hint}</p></figcaption></figure>`;
      return `<figure class="book-card found still" data-key="${e.image}"><div class="book-photo"><img alt=""></div>${ribbon('f:' + f.id)}
        <figcaption><b>${f.name}</b><span class="book-stars">${stars(4)}</span><em>${e.score.toLocaleString()} pts · ${f.from}</em><small>${day(e.date)}</small></figcaption></figure>`;
    }).join('');
    const reqs = book.requests.slice().reverse();
    const requests = reqs.length ? `<section><h2>Requests done <i>${reqs.length}</i></h2><ul class="book-requests">${reqs.slice(0, 24).map((r) => `<li><span class="done-mark">✓</span>${r.text}<small>${day(r.date)}</small></li>`).join('')}</ul></section>` : '';
    const saving = this.d.saving ?? (storageStatus.index && storageStatus.images);
    const extras = [
      p.secretsTotal ? `plus ${p.secretsFound} of ${p.secretsTotal} secrets` : '',
      p.stillsTotal ? `${p.stillsFound} of ${p.stillsTotal} film stills` : '',
    ].filter(Boolean).join(' · ');
    const empty = !Object.keys(book.entries).length && !Object.keys(book.stills).length && !book.requests.length;
    this.root.innerHTML = `
      <div class="book-inner">
        <header class="book-head">
          <div class="album-kicker">Photo book · ${this.d.worldTitle}</div>
          ${cat ? `<h1>${p.found} <i>of ${p.total}</i></h1><p class="book-sub">${extras || 'subjects photographed'}</p>
          <div class="book-bar"><i style="width:${p.total ? (p.found / p.total * 100).toFixed(1) : 0}%"></i></div>`
          : '<h1>An empty book</h1><p class="book-sub">Ride this world once and its pages will fill in.</p>'}
          ${saving ? '' : '<p class="book-note">This browser is not saving the photo book, so it only lasts until the page closes.</p>'}
          <div class="album-actions">
            <button class="btn primary" data-act="close">Close the book</button>
            ${empty ? '' : '<button class="btn ghost" data-act="clear">Clear the book</button>'}
          </div>
          <div class="book-confirm" hidden>
            <p>Clear every photo, pose and request in this book? This cannot be undone.</p>
            <div class="album-actions"><button class="btn danger" data-act="yes">Clear the book</button><button class="btn" data-act="no">Keep it</button></div>
          </div>
        </header>
        ${cat ? `<section><h2>Characters and places</h2><div class="book-grid">${subjects}</div></section>` : ''}
        ${stillCards ? `<section><h2>Film stills</h2><div class="book-grid">${stillCards}</div></section>` : ''}
        ${requests}
      </div>
      <div class="lightbox"><img alt=""><div class="lightbox-bar"><a class="btn" download="photo-book.jpg">Save photo</a><button class="btn" data-act="lb-close">Close</button></div></div>`;
    this.wire();
  }

  private wire() {
    const q = (sel: string) => this.root.querySelector(sel) as HTMLElement | null;
    q('[data-act=close]')!.addEventListener('click', () => this.a.onClose());
    const confirm = q('.book-confirm')!;
    q('[data-act=clear]')?.addEventListener('click', () => { confirm.hidden = false; });
    q('[data-act=no]')!.addEventListener('click', () => { confirm.hidden = true; });
    q('[data-act=yes]')!.addEventListener('click', async () => {
      this.d = { ...this.d, book: await this.a.onClear(), fresh: undefined };
      this.render();
    });
    const lb = q('.lightbox')!;
    const lbImg = lb.querySelector('img') as HTMLImageElement;
    const lbLink = lb.querySelector('a') as HTMLAnchorElement;
    lb.querySelector('[data-act=lb-close]')!.addEventListener('click', () => lb.classList.remove('show'));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('show'); });
    this.root.querySelectorAll<HTMLElement>('.book-card.found').forEach((card) => {
      const img = card.querySelector('img') as HTMLImageElement;
      const key = card.dataset.key!;
      const show = (src: string | null) => {
        if (src) img.src = src;
        else card.classList.add('no-image');
      };
      const given = this.d.images?.[key];
      if (given) show(given); else loadImage(key).then(show);
      card.addEventListener('click', () => {
        if (!img.src) return;
        lbImg.src = img.src; lbLink.href = img.src;
        lb.classList.add('show');
      });
    });
  }

  destroy() { this.root.remove(); }
}
