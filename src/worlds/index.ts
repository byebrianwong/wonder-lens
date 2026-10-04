import type { WorldDef } from '../game/types';
import { GhibliWorld } from './ghibli/GhibliWorld';
import { AndersonWorld } from './anderson/AndersonWorld';
import { AmelieWorld } from './amelie/AmelieWorld';
import { DreamWorld } from './dream/DreamWorld';

export const WORLDS: WorldDef[] = [GhibliWorld, DreamWorld, AndersonWorld, AmelieWorld];
