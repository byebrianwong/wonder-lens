import type { Meta, StoryObj } from '@storybook/html-vite';
import type { BoardData, BoardRow, SharedShot } from '../../server/types';
import { WORLDS } from '../worlds';
import { DreamWorld } from '../worlds/dream/DreamWorld';
import { guide, legendRoll } from '../stories/fixtures';
import { screen, VIEWPORTS } from '../stories/screen';
import { Album, summarize } from './Album';
import { boardHtml, panelElement, savedHtml } from './Board';

/*
 * The leaderboard: the panel opened from the menu, and the save form at the top of the album.
 * The board data is made up here, with a fixed "now", so the "3 days ago" labels never change.
 */
export default {
  title: 'UI/Leaderboard',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;

const NOW = Date.UTC(2026, 9, 12, 18, 0);
const H = 3600_000;
const roll = legendRoll();
const pic = (i: number) => roll[i].dataUrl;
const names = ['Mei', 'Satsuki Kusakabe', 'Calcifer', 'kiki_delivers', 'Jiji', 'Ponyo', 'Sophie', 'Howl', 'Sheeta', 'Pazu', 'Chihiro', 'Lin'];

function rows(count: number, youAt = -1): BoardRow[] {
  return Array.from({ length: count }, (_, i) => ({
    place: i + 1, name: names[i % names.length], score: Math.round(16800 - i * 1180 - (i % 3) * 140),
    found: Math.max(3, 8 - Math.floor(i / 2)), total: 40, rank: i < 2 ? 'Legend' : i < 5 ? 'Wanderer' : 'Explorer',
    at: NOW - (i * 19 + 3) * H, you: i === youAt, photo: i % 3 === 2 ? null : pic(i % roll.length),
  }));
}

function shots(count: number): SharedShot[] {
  return roll.slice(0, count).map((p, i) => ({
    id: String(i), url: p.dataUrl, name: names[(i * 5) % names.length], subject: p.primary!.subject.name,
    score: p.total, stars: p.stars, at: NOW - (i * 31 + 2) * H, you: i === 3,
  }));
}

const board = (o: Partial<BoardData> = {}): BoardData =>
  ({ world: 'dream', windowDays: 30, players: 12, rows: rows(10, 3), you: null, shots: shots(8), ...o });

const panel = (data: BoardData): Story => ({
  render: () => {
    const s = screen({ fullHeight: true });
    const p = s.add(panelElement({ worlds: WORLDS, selected: DreamWorld }));
    p.classList.add('show');
    p.querySelector('.lb-body')!.innerHTML = boardHtml(data, { now: NOW });
    return s.box;
  },
});

export const Panel = panel(board());
export const PanelYouBelowTheTop = panel(board({
  players: 214, rows: rows(10),
  you: { ...rows(1)[0], place: 87, name: 'Totoro Fan', score: 4210, found: 4, rank: 'Visitor', you: true, photo: null },
}));
export const PanelEmpty = panel(board({ players: 0, rows: [], shots: [] }));

/** A finished Snap ride shows the save form above the album. */
export const AlbumSaveForm: Story = {
  render: () => {
    const s = screen({ fullHeight: true });
    const a = new Album(s.box, summarize(legendRoll(), guide), guide, DreamWorld.title, DreamWorld.accent, () => {}, () => {}, false, 'dream');
    s.add(a.root);
    a.root.classList.add('show');
    return s.box;
  },
};

/** What the save form turns into once the score is saved. */
export const AlbumSaved: Story = {
  render: () => {
    const s = screen();
    const box = document.createElement('div');
    box.className = 'album show';
    box.innerHTML = `<div class="album-inner"><section class="lb-save"><h2>Leaderboard</h2>${savedHtml(4, 12, ['approved', 'pending'])}<div class="lb-board">${boardHtml(board(), { rows: 10, now: NOW })}</div></section></div>`;
    s.add(box);
    return s.box;
  },
};
