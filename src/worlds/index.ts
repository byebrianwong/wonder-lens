import type { Requester, WorldDef } from '../game/types';
import { AndersonWorld } from './anderson/AndersonWorld';
import { AmelieWorld } from './amelie/AmelieWorld';
import { DreamWorld } from './dream/DreamWorld';

/**
 * Who asks for photos before each ride (WorldDef.requester). They live here, not in each world's file,
 * so the worlds can be rebuilt without touching them.
 */
const REQUESTERS: Record<string, Requester> = {
  // Granny, the Kusakabes' neighbour in My Neighbor Totoro
  dream: { name: 'Granny', greeting: "Off on the Catbus tonight? Bring me back a few pictures, dear. I'll pin them up by the stove." },
  // M. Gustave H., concierge of the Grand Budapest
  anderson: { name: 'M. Gustave', greeting: 'A camera! How marvellous. Kindly obtain the following, and do keep the lens spotless.' },
  // Raymond Dufayel, the glass man, who repaints the same Renoir every year
  amelie: { name: 'Raymond Dufayel', greeting: "Twenty years I've painted the same picture. Bring me something new to look at." },
};

export const WORLDS: WorldDef[] = [DreamWorld, AndersonWorld, AmelieWorld].map((w) => ({ requester: REQUESTERS[w.id], ...w }));
