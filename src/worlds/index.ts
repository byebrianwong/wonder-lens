import type { WorldDef } from '../game/types';
import { GhibliWorld } from './ghibli/GhibliWorld';
import { AndersonWorld } from './anderson/AndersonWorld';
import { AmelieWorld } from './amelie/AmelieWorld';

export const WORLDS: WorldDef[] = [GhibliWorld, AndersonWorld, AmelieWorld];
