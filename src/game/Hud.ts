import type { PhotoResult } from './Photo';
import type { Subject } from './Subject';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, 4 - n)) + '</span>';

/** All in-ride overlay UI. Pure DOM; the game pushes state into it. */
export class Hud {
  root: HTMLElement;
  private filmEl: HTMLElement;
  private captionEl: HTMLElement;
  private titleEl: HTMLElement;
  private subjectTag: HTMLElement;
  private cards: HTMLElement;
  private toasts: HTMLElement;
  private zoomFill: HTMLElement;
  private progressFill: HTMLElement;
  private hintEl: HTMLElement;
  private throwCd: HTMLElement;
  private callCd: HTMLElement;
  private reticle: HTMLElement;
  private centerMsg: HTMLElement;
  private lockHint: HTMLElement;
  private lockHintShown = false;
  private captionTimer = 0;
  private hintTimer = 14;
  minimal = false;
  /** Keep toasts, photo cards and centre messages on screen instead of timing them out. Storybook sets this so snapshots are stable. */
  persist = false;
  private lastTag = '';

  onShoot: (() => void) | null = null;
  onThrow: (() => void) | null = null;
  onCall: (() => void) | null = null;
  onZoom: ((delta: number) => void) | null = null;
  constructor(parent: HTMLElement, worldTitle: string, itemName: string, callName: string, accent: string, touch = false) {
    this.root = el('div', 'hud', parent);
    this.root.style.setProperty('--accent', accent);
    this.reticle = el('div', 'reticle', this.root, `
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="dot"></div>`);
    this.subjectTag = el('div', 'subject-tag', this.root);
    const top = el('div', 'hud-top', this.root);
    const left = el('div', 'hud-top-left', top);
    this.titleEl = el('div', 'world-title', left, worldTitle);
    this.captionEl = el('div', 'caption', left);
    this.filmEl = el('div', 'film', top);
    this.toasts = el('div', 'toasts', this.root);
    this.centerMsg = el('div', 'center-msg', this.root);
    this.lockHint = el('div', 'lock-hint', this.root, 'Click to take the controls');
    const zoom = el('div', 'zoom', this.root, '<div class="zoom-label">ZOOM</div><div class="zoom-track"><div class="zoom-fill"></div></div>');
    this.zoomFill = zoom.querySelector('.zoom-fill') as HTMLElement;
    this.cards = el('div', 'cards', this.root);
    const bottom = el('div', 'hud-bottom', this.root);
    this.hintEl = el('div', 'hints', bottom, `
      <span><kbd>Mouse</kbd> look</span><span><kbd>Click</kbd> / <kbd>Space</kbd> photo</span>
      <span><kbd>Wheel</kbd> / <kbd>Z</kbd> zoom</span><span><kbd>E</kbd> throw ${itemName}</span><span><kbd>Q</kbd> ${callName}</span><span><kbd>Shift</kbd> faster</span><span><kbd>Esc</kbd> menu</span>`);
    const tools = el('div', 'tools', bottom);
    this.throwCd = el('div', 'tool', tools, `<div class="tool-fill"></div><span class="tool-key">E</span><span class="tool-name">${itemName}</span>`);
    this.callCd = el('div', 'tool', tools, `<div class="tool-fill"></div><span class="tool-key">Q</span><span class="tool-name">${callName}</span>`);
    const act = (b: HTMLElement, fn: () => void) => {
      b.classList.add('tappable');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    };
    act(this.throwCd, () => this.onThrow?.());
    act(this.callCd, () => this.onCall?.());
    if (touch) {
      this.root.classList.add('touch');
      const shutter = el('button', 'shutter', this.root, '<i></i>');
      act(shutter, () => this.onShoot?.());
      const zoomIn = el('button', 'zoom-btn zoom-in', this.root, '+');
      const zoomOut = el('button', 'zoom-btn zoom-out', this.root, '−');
      act(zoomIn, () => this.onZoom?.(-1));
      act(zoomOut, () => this.onZoom?.(1));
    }
    const prog = el('div', 'progress', this.root, '<div class="progress-fill"></div>');
    this.progressFill = prog.querySelector('.progress-fill') as HTMLElement;
  }

  setMinimal(m: boolean) {
    this.minimal = m;
    this.root.classList.toggle('minimal', m);
  }
  setFilm(n: number, max: number) {
    this.filmEl.innerHTML = n === Infinity ? `<span class="film-icon"></span>∞` : `<span class="film-icon"></span>${n}<span class="dim">/${max}</span>`;
    this.filmEl.classList.toggle('low', n <= 3 && n !== Infinity);
  }
  setZoom(z: number) { this.zoomFill.style.height = `${Math.round(z * 100)}%`; }
  setProgress(u: number) { this.progressFill.style.width = `${(u * 100).toFixed(2)}%`; }
  setCooldowns(throwT: number, callT: number) {
    (this.throwCd.firstElementChild as HTMLElement).style.transform = `scaleX(${1 - throwT})`;
    (this.callCd.firstElementChild as HTMLElement).style.transform = `scaleX(${1 - callT})`;
    this.throwCd.classList.toggle('ready', throwT <= 0);
    this.callCd.classList.toggle('ready', callT <= 0);
  }
  caption(text: string, seconds = 5) {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('show');
    this.captionTimer = seconds;
  }
  toast(html: string, cls = '') {
    const t = el('div', 'toast ' + cls, this.toasts, html);
    requestAnimationFrame(() => t.classList.add('show'));
    if (this.persist) return;
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 3200);
  }
  centerMessage(text: string) {
    this.centerMsg.textContent = text;
    this.centerMsg.classList.add('show');
    if (this.persist) return;
    setTimeout(() => this.centerMsg.classList.remove('show'), 1500);
  }
  /** Name shown under the reticle when a subject is near the centre. */
  tagSubject(s: Subject | null) {
    const txt = s ? `${s.name}<span class="from">${s.from}</span>` : '';
    if (txt !== this.lastTag) {
      this.lastTag = txt;
      this.subjectTag.innerHTML = txt;
      this.subjectTag.classList.toggle('show', !!s);
    }
  }
  showPhoto(r: PhotoResult) {
    const card = el('div', 'card', this.cards);
    const title = r.primary ? r.primary.subject.name : 'Scenery';
    const sub = r.primary ? r.primary.subject.from : 'A quiet moment';
    card.innerHTML = `
      <div class="card-photo"><img src="${r.dataUrl}" alt=""></div>
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-sub">${sub}</div>
        <div class="card-stars">${stars(r.stars)}</div>
        <div class="card-score">${r.total.toLocaleString()} <span>pts</span></div>
        <div class="card-bonus">${r.bonuses.map((b) => `<span>${b}</span>`).join('')}</div>
      </div>`;
    requestAnimationFrame(() => card.classList.add('show'));
    if (!this.persist) setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 600); }, 4200);
    while (this.cards.children.length > 3) this.cards.firstElementChild?.remove();
  }
  showLockHint(show: boolean) {
    if (show === this.lockHintShown) return;
    this.lockHintShown = show;
    this.lockHint.classList.toggle('show', show);
  }
  flashWarning(text: string) {
    this.filmEl.classList.add('shake');
    setTimeout(() => this.filmEl.classList.remove('shake'), 400);
    this.toast(text, 'warn');
  }
  update(dt: number) {
    if (this.captionTimer > 0) {
      this.captionTimer -= dt;
      if (this.captionTimer <= 0) this.captionEl.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.add('fade');
    }
  }
  showHints() { this.hintEl.classList.remove('fade'); this.hintTimer = 8; }
  destroy() { this.root.remove(); }
  get titleElement() { return this.titleEl; }
  get reticleElement() { return this.reticle; }
}
