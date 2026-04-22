/**
 * `sdk.settings` — host-only authoring surface exposed during the
 * `host-settings` lifecycle phase.
 *
 * The manager keeps a local mutative snapshot of the settings object
 * and forwards changes to the host application as:
 *
 *  - Full replacements via `set()` — used when the plugin wants the
 *    host to discard whatever it has and adopt a fresh configuration.
 *  - JSON patches via `update(recipe)` — the preferred incremental
 *    path: mutative generates the minimal diff, which is forwarded
 *    over Penpal for validation and persistence by the host.
 *
 * Plugins MUST NOT import / invoke this manager from the `player` role.
 * Every mutating method asserts the current role and will throw
 * `SdkRoleError` when called inappropriately.
 */

import { create, type Patches } from 'mutative';

import type {
  HostApi,
  PluginRole,
} from '../rpc/types';
import { SdkRoleError } from '../errors';
import { toJsonPatches } from '../utils/patches';

export type SettingsRecipe<T extends Record<string, unknown>> = (
  draft: T,
) => void;

export class SettingsManager<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly host: HostApi;
  private readonly role: PluginRole;
  private snapshot: T;
  private _valid: boolean = true;

  constructor(host: HostApi, role: PluginRole, initial: T) {
    this.host = host;
    this.role = role;
    this.snapshot = { ...initial };
  }

  /** A structurally-cloned snapshot of the current settings object. */
  get(): T {
    return structuredCloneCompat(this.snapshot);
  }

  /**
   * Replace the entire settings object on the host. Use when a small
   * patch cannot express the transition cleanly (e.g. loading a preset).
   */
  async set(next: T): Promise<T> {
    this.assertHost('set');
    this.snapshot = structuredCloneCompat(next);
    await this.host.settingsReplace(this.snapshot);
    return this.get();
  }

  /**
   * Apply a mutative recipe locally, emit the minimal JSON patch set
   * to the host, and return the resulting settings object.
   *
   * When the recipe produces no net change the RPC is skipped and the
   * previous snapshot is returned verbatim.
   */
  async update(recipe: SettingsRecipe<T>): Promise<T> {
    this.assertHost('update');
    const [nextSettings, patches] = create(
      this.snapshot,
      (draft) => {
        recipe(draft as T);
      },
      { enablePatches: true },
    );

    if ((patches as Patches).length === 0) return this.get();

    this.snapshot = nextSettings as T;
    await this.host.settingsApplyPatches(toJsonPatches(patches as Patches));
    return this.get();
  }

  /**
   * Toggle whether the current settings are valid. The host app is
   * expected to gate the "Start game" button on this signal.
   */
  async setValid(valid: boolean): Promise<void> {
    this.assertHost('setValid');
    if (this._valid === valid) return;
    this._valid = valid;
    await this.host.settingsSetValid(valid);
  }

  /** Whether the plugin currently reports settings as valid. */
  get valid(): boolean {
    return this._valid;
  }

  // ── Internal mutators ────────────────────────────────────────────────

  /** @internal — used by the SDK core when the host hot-swaps settings. */
  _replaceLocal(next: T): void {
    this.snapshot = structuredCloneCompat(next);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private assertHost(method: string): void {
    if (this.role !== 'host') {
      throw new SdkRoleError(
        `sdk.settings.${method}() is only available to the "host" role (current: "${this.role}")`,
      );
    }
  }
}

/**
 * `structuredClone` is available in every modern browser but falls back
 * to a JSON round-trip for ultra-old runtimes so tests can still pass
 * under jsdom without polyfills.
 */
function structuredCloneCompat<T>(value: T): T {
  const g = globalThis as unknown as {
    structuredClone?: (v: unknown) => unknown;
  };
  if (typeof g.structuredClone === 'function') {
    return g.structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
