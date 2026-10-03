import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildSky(ctx: SetContext): BuiltSet {
  return placeholderSet('sky', ctx, 0xf0e0e0);
}
