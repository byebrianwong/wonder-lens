import './style.css';
import { Renderer } from './engine/Renderer';
import { Input } from './engine/Input';
import { AudioEngine } from './engine/Audio';
import { Game } from './game/Game';
import { WORLDS } from './worlds';
import { loadingElement, menuElement } from './game/Screens';
import { bookProgress, clearBook, loadBook } from './game/PhotoBook';
import { currentRequests } from './game/Requests';
import { BookView } from './game/BookView';
import { openPanel } from './game/Board';
import type { WorldDef } from './game/types';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioEngine();
audio.setMuted(startMuted());
const savedMouse = localStorage.getItem('ride.mouse');
if (savedMouse === 'drag' || savedMouse === 'lock') input.mode = savedMouse;
if (input.isTouch) input.mode = 'drag';

/**
 * Start muted when an agent is driving the page, so test runs stay quiet on the computer.
 * The Claude app's built-in browser has "Claude/<version>" in its user agent; other automated
 * browsers set navigator.webdriver. ?sound=1 turns sound on anyway, ?sound=0 forces it off.
 */
function startMuted(): boolean {
  const sound = new URLSearchParams(location.search).get('sound');
  if (sound === '1') return false;
  if (sound === '0') return true;
  return / Claude\//.test(navigator.userAgent) || navigator.webdriver === true;
}

let game: Game | null = null;
let selected: WorldDef = WORLDS[0];
let relax = false;

async function showMenu(fadeIn = true) {
  // each world's photo book, for the counts on the cards and the selected world's requests
  const books = await Promise.all(WORLDS.map((w) => loadBook(w.id)));
  const progress = Object.fromEntries(books.map((b) => [b.world, b.catalog ? bookProgress(b) : null]));
  const selectedBook = books.find((b) => b.world === selected.id)!;
  const scroll = ui.querySelector<HTMLElement>('.menu')?.scrollTop ?? 0;
  ui.innerHTML = '';
  const menu = menuElement({ worlds: WORLDS, selected, relax, mouseLock: input.mode === 'lock', books: progress, requests: currentRequests(selectedBook) });
  ui.appendChild(menu);
  if (!fadeIn) menu.scrollTop = scroll;
  if (fadeIn) requestAnimationFrame(() => menu.classList.add('show'));
  else menu.classList.add('show');
  menu.querySelectorAll<HTMLButtonElement>('.book-btn').forEach((b) => b.addEventListener('click', async () => {
    const def = WORLDS.find((w) => w.id === b.dataset.book) ?? WORLDS[0];
    audio.start(); audio.uiClick();
    const view: BookView = new BookView(ui, { worldTitle: def.title, accent: def.accent, book: await loadBook(def.id) }, {
      // back to the menu, so the card's count and the requests follow a cleared book
      onClose: () => { view.destroy(); showMenu(false); },
      onClear: async () => { await clearBook(def.id); return loadBook(def.id); },
    });
  }));
  menu.querySelectorAll<HTMLButtonElement>('.world-card').forEach((b) => b.addEventListener('click', () => {
    selected = WORLDS.find((w) => w.id === b.dataset.id) ?? WORLDS[0];
    audio.start(); audio.uiClick();
    showMenu(false);
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
  menu.querySelector('.lb-open')!.addEventListener('click', () => {
    audio.start(); audio.uiClick();
    openPanel(ui, WORLDS, selected);
  });
  menu.querySelector('.start')!.addEventListener('click', () => {
    audio.start(); audio.uiClick();
    startRide(selected);
  });
}

function startRide(def: WorldDef) {
  ui.innerHTML = '';
  const loading = loadingElement(def, relax);
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
