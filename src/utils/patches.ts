/**
 * Helpers for normalising mutative's `Patches` into the wire-format
 * declared in the RPC contract (`JsonPatches`).
 *
 * With mutative's default options (`pathAsArray: true`,
 * `arrayLengthAssignment: true`) the `path` entries are already
 * `(string | number)[]`, but we forward through an explicit mapping so:
 *
 *   - The host side does NOT need `mutative` installed to typecheck.
 *   - We drop mutative-internal metadata and keep only the three
 *     fields mandated by the contract.
 */

import type { Patches } from 'mutative';
import type { JsonPatches } from '../rpc/types';

export function toJsonPatches(patches: Patches): JsonPatches {
  return patches.map((p) => ({
    op: p.op,
    path: p.path as (string | number)[],
    ...(('value' in p ? { value: p.value } : {}) as { value?: unknown }),
  }));
}
