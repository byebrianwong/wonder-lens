/* The shapes the leaderboard API sends and receives. The game imports these types too. */

export type Verdict = 'approved' | 'rejected' | 'pending';

/** One line of a leaderboard. */
export interface BoardRow {
  /** 1 is first */
  place: number;
  name: string;
  score: number;
  found: number;
  /** how many subjects the world has */
  total: number;
  /** the album rank, e.g. "Wanderer" */
  rank: string;
  /** when the run was played, in ms since 1970 */
  at: number;
  /** this row belongs to the player who asked */
  you: boolean;
  /** an approved photo from that run, if any */
  photo: string | null;
}

/** A photo players chose to share, after it passed the safety check. */
export interface SharedShot {
  id: string;
  url: string;
  name: string;
  subject: string;
  score: number;
  stars: number;
  at: number;
  you: boolean;
}

export interface BoardData {
  world: string;
  windowDays: number;
  /** how many players are on this board */
  players: number;
  /** the top of the board */
  rows: BoardRow[];
  /** the asking player's own row, also when it is below the top */
  you: BoardRow | null;
  /** the best shared photos of the window, best first */
  shots: SharedShot[];
}

export interface SubmitPhoto {
  /** base64 JPEG, without the data: prefix */
  jpeg: string;
  subject: string;
  score: number;
  stars: number;
}

export interface SubmitBody {
  world: string;
  player: string;
  name: string;
  score: number;
  found: number;
  rank: string;
  photos: SubmitPhoto[];
}

export type SubmitResult =
  | { ok: true; place: number; photos: Verdict[]; board: BoardData }
  | { ok: false; error: 'name' | 'rate' | 'invalid' | 'offline'; message: string };
