/**
 * `sdk.host` — authoritative gameplay surface for the host-role plugin.
 *
 * The host plugin owns the canonical game state. It:
 *
 *  - Authors the state via `setState()` / `updateState()` (mutative).
 *  - Broadcasts the full state after `setState()` and minimal JSON
 *    patches after `updateState()`.
 *  - Can push the full state to an individual player via `sendStateTo`
 *    when a late joiner or reconnecting client appears — without
 *    disturbing the other players.
 *  - Emits transient events (sounds, toasts) via `sendEvent()` that
 *    never persist into the authoritative state.
 *  - Wraps up the session with `endGame()` so players see a final
 *    leaderboard and the host app transitions to `finished`.
 *
 * Every method here throws `SdkRoleError` when invoked from a player
 * role; the main SDK class guards instantiation but the asserts give
 * developers a clear error when they wire things up incorrectly.
 */

import { create, type Patches } from 'mutative';

import type {
  EventTarget as RpcEventTarget,
  GameEvent,
  HostApi,
  PluginRole,
  SessionResult,
} from '../rpc/types';
import { SdkRoleError } from '../errors';
import { toJsonPatches } from '../utils/patches';

export type StateRecipe<S> = (draft: S) => void;

export class HostManager<State = unknown> {
  private readonly host: HostApi;
  private readonly role: PluginRole;
  private currentState: State | undefined;

  constructor(host: HostApi, role: PluginRole) {
    this.host = host;
    this.role = role;
  }

  // ── State authoring ──────────────────────────────────────────────────

  /**
   * Replace the full game state and broadcast it to every connected
   * player as `game:state:sync`. Use this for the initial broadcast
   * and for transitions where a patch would be less efficient than
   * resending the whole snapshot.
   */
  async setState(state: State): Promise<void> {
    this.assertHost('setState');
    this.currentState = cloneForSync(state);
    await this.host.gameBroadcastState(this.currentState);
  }

  /**
   * Mutate the game state via a mutative recipe. The minimal diff is
   * sent to every player as `game:state:patch`; if the recipe produced
   * no change the RPC is skipped.
   *
   * Throws if `setState()` has never been called — the host plugin
   * MUST seed a state before it can emit patches.
   */
  async updateState(recipe: StateRecipe<State>): Promise<State> {
    this.assertHost('updateState');
    if (this.currentState === undefined) {
      throw new Error(
        'sdk.host.updateState() called before setState(). Seed the state first.',
      );
    }

    const [nextState, patches] = create(
      this.currentState as State,
      (draft) => {
        recipe(draft as State);
      },
      { enablePatches: true },
    );

    if ((patches as Patches).length === 0) return this.currentState as State;

    this.currentState = nextState as State;
    await this.host.gameBroadcastStatePatches(toJsonPatches(patches as Patches));
    return this.currentState as State;
  }

  /**
   * Send the current authoritative state to one specific player. Used
   * from `onPlayerJoin` / `onPlayerReady` handlers when a late-joiner
   * or reconnecting client appears; the remaining players are not
   * affected.
   */
  async sendStateTo(playerId: string, state?: State): Promise<void> {
    this.assertHost('sendStateTo');
    const payload = state ?? this.currentState;
    if (payload === undefined) {
      throw new Error(
        'sdk.host.sendStateTo() called before any state was seeded.',
      );
    }
    await this.host.gameSendStateTo(playerId, cloneForSync(payload));
  }

  /** Most recent authored state (never populated from the host side). */
  getState(): State | undefined {
    return this.currentState === undefined
      ? undefined
      : (cloneForSync(this.currentState) as State);
  }

  // ── Events & session end ─────────────────────────────────────────────

  /**
   * Dispatch a transient event to one or more players. The target may
   * be `'all'`, a single playerId string, or an array of playerIds.
   * Events are NOT stored on the host — missed events stay missed.
   */
  async sendEvent<D = unknown>(
    target: RpcEventTarget,
    event: GameEvent<D>,
  ): Promise<void> {
    this.assertHost('sendEvent');
    await this.host.gameSendEvent(target, event as GameEvent);
  }

  /**
   * End the session with the final scoreboard. The host app
   * transitions to the `finished` phase and every player receives
   * `onGameEnd(result)`.
   */
  async endGame(result: SessionResult): Promise<void> {
    this.assertHost('endGame');
    await this.host.gameEndSession(result);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private assertHost(method: string): void {
    if (this.role !== 'host') {
      throw new SdkRoleError(
        `sdk.host.${method}() is only available to the "host" role (current: "${this.role}")`,
      );
    }
  }
}

/**
 * State objects crossing the Penpal boundary are already serialised by
 * the structured clone algorithm, so we can get away with returning the
 * original reference. We still produce a deep copy for local storage
 * to avoid accidental mutations after `setState()` returns.
 */
function cloneForSync<S>(value: S): S {
  const g = globalThis as unknown as {
    structuredClone?: (v: unknown) => unknown;
  };
  if (typeof g.structuredClone === 'function') {
    return g.structuredClone(value) as S;
  }
  return JSON.parse(JSON.stringify(value)) as S;
}
