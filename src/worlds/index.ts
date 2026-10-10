import type { WorldDef } from '../game/types';
import { AndersonWorld } from './anderson/AndersonWorld';
import { AmelieWorld } from './amelie/AmelieWorld';
import { DreamWorld } from './dream/DreamWorld';

export const WORLDS: WorldDef[] = [DreamWorld, AndersonWorld, AmelieWorld];
