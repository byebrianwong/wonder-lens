import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildHome(ctx: SetContext): BuiltSet {
  return placeholderSet('home', ctx, 0x6a9a4a);
}
