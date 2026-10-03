import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildGarden(ctx: SetContext): BuiltSet {
  return placeholderSet('garden', ctx, 0x3a6a3a);
}
