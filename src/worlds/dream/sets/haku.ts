import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildHaku(ctx: SetContext): BuiltSet {
  return placeholderSet('haku', ctx, 0x1a2a4a);
}
