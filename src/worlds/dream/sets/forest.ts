import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildForest(ctx: SetContext): BuiltSet {
  return placeholderSet('forest', ctx, 0x2a4a3a);
}
