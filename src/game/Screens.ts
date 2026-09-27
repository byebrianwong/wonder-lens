import type { WorldDef } from './types';

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
}

/** The title screen: world cards, ride mode, start button and controls. */
export function menuElement({ worlds, selected, relax, mouseLock }: MenuState): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <div class="menu-bg"></div>
    <div class="menu-inner">
      <header class="menu-head">
        <div class="kicker">A photo ride through worlds worth watching</div>
        <h1>Window <em>Seat</em></h1>
        <p class="lede">Sit back as the world drifts past, or pick up the camera. Look anywhere, zoom in, throw something, call out, and catch the moments that make each world feel alive.</p>
      </header>
      <div class="worlds">
        ${worlds.map((w) => `
          <button class="world-card ${w.id === selected.id ? 'selected' : ''}" data-id="${w.id}" style="--accent:${w.accent};--accent2:${w.accent2}">
            <div class="world-art art-${w.id}"></div>
            <div class="world-text">
              <div class="world-sub">${w.subtitle}</div>
              <div class="world-title">${w.title}</div>
              <div class="world-blurb">${w.blurb}</div>
              <div class="world-meta"><span>${w.vehicleName}</span><span>throw: ${w.itemName}</span><span>call: ${w.callName}</span></div>
            </div>
          </button>`).join('')}
      </div>
      <div class="mode-row">
        <div class="modes">
          <button class="mode ${!relax ? 'on' : ''}" data-mode="snap"><b>Snap ride</b><span>24 shots. Score your best photo of every character.</span></button>
          <button class="mode ${relax ? 'on' : ''}" data-mode="relax"><b>Relax ride</b><span>No HUD, no limits. Just watch the world go by.</span></button>
        </div>
        <button class="btn start">Board the ${selected.vehicleName.replace(/^The /, '')}</button>
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
