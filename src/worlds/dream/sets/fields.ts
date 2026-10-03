import type { BuiltSet, SetContext } from '../common';
import { placeholderSet } from './placeholder';

/** Placeholder: replaced by the real scene. */
export function buildFields(ctx: SetContext): BuiltSet {
  return placeholderSet('fields', ctx, 0x4a6a5a);
}
