import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildLaputa(ctx: SetContext): BuiltSet {
  return placeholderSet('laputa', ctx, 0x6a8a5a);
}
