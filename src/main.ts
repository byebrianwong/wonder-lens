import './style.css';
import { Renderer } from './engine/Renderer';
import { Input } from './engine/Input';
import { AudioEngine } from './engine/Audio';
import { Game } from './game/Game';
import { WORLDS } from './worlds';
import type { WorldDef } from './game/types';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioEngine();
const savedMouse = localStorage.getItem('ride.mouse');
if (savedMouse === 'drag' || savedMouse === 'lock') input.mode = savedMouse;
if (input.isTouch) input.mode = 'drag';

let game: Game | null = null;
let selected: WorldDef = WORLDS[0];
let relax = false;

function showMenu() {
  ui.innerHTML = '';
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
        ${WORLDS.map((w) => `
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
        <label class="opt"><input type="checkbox" id="mouseMode" ${input.mode === 'lock' ? 'checked' : ''}> Lock the mouse while riding (recommended on desktop)</label>
        <div class="fine">Everything here is drawn and synthesised in your browser. A fan-made tribute, not affiliated with any studio.</div>
      </footer>
    </div>`;
  ui.appendChild(menu);
  requestAnimationFrame(() => menu.classList.add('show'));
  menu.querySelectorAll<HTMLButtonElement>('.world-card').forEach((b) => b.addEventListener('click', () => {
    selected = WORLDS.find((w) => w.id === b.dataset.id) ?? WORLDS[0];
    audio.start(); audio.uiClick();
    showMenu();
  }));
  menu.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) => b.addEventListener('click', () => {
    relax = b.dataset.mode === 'relax';
    audio.start(); audio.uiClick();
    menu.querySelectorAll('.mode').forEach((m) => m.classList.toggle('on', m === b));
  }));
  (menu.querySelector('#mouseMode') as HTMLInputElement).addEventListener('change', (e) => {
    input.mode = (e.target as HTMLInputElement).checked ? 'lock' : 'drag';
    localStorage.setItem('ride.mouse', input.mode);
  });
  menu.querySelector('.start')!.addEventListener('click', () => {
    audio.start(); audio.uiClick();
    startRide(selected);
  });
}

function startRide(def: WorldDef) {
  ui.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.style.setProperty('--accent', def.accent);
  loading.innerHTML = `<div class="loading-box"><div class="loading-sub">${def.subtitle}</div><div class="loading-title">${def.title}</div><div class="loading-bar"><i></i></div><div class="loading-hint">${relax ? 'Relax ride. Press H any time to bring the camera back.' : 'Snap ride. Look everywhere, including behind you.'}</div></div>`;
  ui.appendChild(loading);
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    const lowDetail = navigator.hardwareConcurrency ? navigator.hardwareConcurrency <= 4 : false;
    game = new Game({
      renderer, input, audio, def, relax, lowDetail, ui,
      onExit: () => { game = null; showMenu(); },
      onAgain: () => { game?.destroy(); game = null; startRide(def); },
    });
    await game.start();
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 900);
  }));
}

showMenu();
// keyboard shortcut for muting anywhere
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') audio.setMuted(!audio.muted); });
