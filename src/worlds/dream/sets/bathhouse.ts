import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildBathhouse(ctx: SetContext): BuiltSet {
  return placeholderSet('bathhouse', ctx, 0x8a2a1e);
}
