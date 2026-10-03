import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildMeadow(ctx: SetContext): BuiltSet {
  return placeholderSet('meadow', ctx, 0x8aa84a);
}
