import type { Requester, WorldDef } from './types';
import type { BookProgress } from './PhotoBook';
import type { PhotoRequest } from './Requests';

/*
 * Markup for the full-screen menus. Each function takes plain data and returns an element.
 * The caller attaches it and wires up the buttons, so Storybook can draw these screens without a game running.
 */

export interface MenuState {
  worlds: WorldDef[];
  selected: WorldDef;
  relax: boolean;
  /** the "Lock the mouse while riding" checkbox */
  mouseLock: boolean;
  /** how full each world's photo book is, by world id; null when the world has never been built here */
  books?: Record<string, BookProgress | null>;
  /** the selected world's photo requests for the next ride */
  requests?: PhotoRequest[];
}

/** A request with whether it has been done this ride. */
export type RequestStatus = PhotoRequest & { done?: boolean };

/**
 * A world character's three photo requests: who asks, their greeting and the list, ticked when done.
 * Used on the start screen and in the album.
 */
export function requestsHtml(requester: Requester | undefined, items: RequestStatus[], note = ''): string {
  const list = items.length
    ? `<ol class="request-list">${items.map((r) => `<li class="request ${r.done ? 'done' : ''}" data-kind="${r.kind}"><span class="tick"></span><span class="request-text"><b>${r.title}</b> <span>${r.detail}</span></span></li>`).join('')}</ol>`
    : `<p class="requests-empty">${note}</p>`;
  return `<section class="requests">
      <div class="requests-who"><span class="requests-kicker">Photo requests from</span><span class="requests-name">${requester?.name ?? 'the guide'}</span></div>
      ${requester ? `<p class="requests-greeting">“${requester.greeting}”</p>` : ''}
      ${list}
    </section>`;
}

const bookLabel = (p: BookProgress | null | undefined) => {
  if (!p) return 'Photo book';
  const secrets = p.secretsFound ? ` +${p.secretsFound}` : '';
  return `Photo book <i>${p.found}/${p.total}${secrets}</i>`;
};

/** The title screen: world cards, ride mode, start button and controls. */
export function menuElement({ worlds, selected, relax, mouseLock, books, requests }: MenuState): HTMLElement {
  const notRidden = !books?.[selected.id];
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <div class="menu-bg"></div>
    <div class="menu-inner">
      <header class="menu-head">
        <div class="kicker">A photo ride through worlds worth watching</div>
        <h1>Wonder <em>Lens</em></h1>
        <p class="lede">Sit back as the world drifts past, or pick up the camera. Look anywhere, zoom in, throw something, call out, and catch the moments that make each world feel alive.</p>
      </header>
      <div class="worlds">
        ${worlds.map((w) => `
          <div class="world-slot" style="--accent:${w.accent};--accent2:${w.accent2}">
            <button class="world-card ${w.id === selected.id ? 'selected' : ''}" data-id="${w.id}">
              <div class="world-art art-${w.id}"></div>
              <div class="world-text">
                <div class="world-sub">${w.subtitle}</div>
                <div class="world-title">${w.title}</div>
                <div class="world-blurb">${w.blurb}</div>
                <div class="world-meta"><span>${w.vehicleName}</span><span>throw: ${w.itemName}</span><span>call: ${w.callName}</span></div>
              </div>
            </button>
            <button class="book-btn" data-book="${w.id}">${bookLabel(books?.[w.id])}</button>
          </div>`).join('')}
      </div>
      <div class="menu-requests" style="--accent:${selected.accent}">
        ${requestsHtml(selected.requester, requests ?? [], notRidden ? `The requests start after your first ride on ${selected.title}.` : 'Your photo book has every shot there is to ask for. Ride for the joy of it.')}
      </div>
      <div class="mode-row">
        <div class="modes">
          <button class="mode ${!relax ? 'on' : ''}" data-mode="snap"><b>Snap ride</b><span>24 shots. Score your best photo of every character.</span></button>
          <button class="mode ${relax ? 'on' : ''}" data-mode="relax"><b>Relax ride</b><span>No HUD, no limits. Just watch the world go by.</span></button>
        </div>
        <div class="start-row">
          <button class="btn lb-open">Leaderboards</button>
          <button class="btn start">Board the ${selected.vehicleName.replace(/^The /, '')}</button>
        </div>
      </div>
      <footer class="menu-foot">
        <div class="controls">
          <span><kbd>Mouse</kbd> look</span><span><kbd>Click</kbd> / <kbd>Space</kbd> photo</span><span><kbd>Wheel</kbd> / <kbd>Z</kbd> zoom</span>
          <span><kbd>E</kbd> throw</span><span><kbd>Q</kbd> call</span><span><kbd>Shift</kbd> faster</span><span><kbd>Ctrl</kbd> slower</span><span><kbd>H</kbd> hide HUD</span><span><kbd>Esc</kbd> menu</span>
        </div>
        <label class="opt"><input type="checkbox" id="mouseMode" ${mouseLock ? 'checked' : ''}> Lock the mouse while riding (recommended on desktop)</label>
        <div class="fine">Everything here is drawn and synthesised in your browser. A fan-made tribute, not affiliated with any studio.</div>
      </footer>
    </div>`;
  return menu;
}

/** The card shown while a world is being built. */
export function loadingElement(def: WorldDef, relax: boolean): HTMLElement {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.style.setProperty('--accent', def.accent);
  loading.innerHTML = `<div class="loading-box"><div class="loading-sub">${def.subtitle}</div><div class="loading-title">${def.title}</div><div class="loading-bar"><i></i></div><div class="loading-hint">${relax ? 'Relax ride. Press H any time to bring the camera back.' : 'Snap ride. Look everywhere, including behind you.'}</div></div>`;
  return loading;
}

export interface PauseState {
  title: string;
  hudHidden: boolean;
  mouseMode: 'lock' | 'drag';
  muted: boolean;
}

/** The pause menu shown over the ride. */
export function pauseElement({ title, hudHidden, mouseMode, muted }: PauseState): HTMLElement {
  const p = document.createElement('div');
  p.className = 'pause';
  p.innerHTML = `
      <div class="pause-box">
        <h2>Paused</h2>
        <p class="pause-sub">${title}</p>
        <button class="btn primary" data-act="resume">Resume ride</button>
        <button class="btn" data-act="relax">${hudHidden ? 'Show camera HUD' : 'Relax: hide HUD'}</button>
        <button class="btn" data-act="mouse">Mouse: ${mouseMode === 'lock' ? 'locked (click to look)' : 'drag to look'}</button>
        <button class="btn" data-act="mute">${muted ? 'Unmute' : 'Mute'} sound</button>
        <button class="btn" data-act="finish">Finish ride now</button>
        <button class="btn ghost" data-act="exit">Back to worlds</button>
        <div class="pause-help">
          <span><kbd>Click</kbd>/<kbd>Space</kbd> photo</span><span><kbd>E</kbd> throw</span><span><kbd>Q</kbd> call</span>
          <span><kbd>Wheel</kbd>/<kbd>Z</kbd> zoom</span><span><kbd>Shift</kbd> fast</span><span><kbd>Ctrl</kbd> slow</span><span><kbd>H</kbd> HUD</span>
        </div>
      </div>`;
  return p;
}
