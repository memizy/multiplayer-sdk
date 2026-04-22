/**
 * `sdk.player` — player-role gameplay surface.
 *
 * The player plugin:
 *  - Submits intents via `sendAction()`; the host plugin remains the
 *    authority on what those intents mean.
 *  - Mirrors the host's authoritative state through `state` / the
 *    `onStateChange` callback. Full-state broadcasts replace the local
 *    copy, JSON patches are applied via mutative's `apply()`.
 *
 * All state bookkeeping (applying patches, deep-cloning) happens in
 * this manager so the plugin code can treat `sdk.player.state` as an
 * always-current read-only view.
 */

import { apply } from 'mutative';

import type {
  GameEvent,
  HostApi,
  JsonPatches,
  PlayerAction,
  PluginRole,
} from '../rpc/types';
import { SdkRoleError } from '../errors';

export type StateChangeHandler<State> = (
  state: State | undefined,
  meta: { reason: 'state' | 'patches' | 'initial' },
) => void;

export type GameEventHandler = (event: GameEvent) => void;

export class PlayerManager<State = unknown> {
  private readonly host: HostApi;
  private readonly role: PluginRole;
  private currentState: State | undefined;

  private stateHandler: StateChangeHandler<State> | null = null;
  private eventHandler: GameEventHandler | null = null;
  private gameEndHandler:
    | ((result: import('../rpc/types').SessionResult) => void)
    | null = null;

  constructor(host: HostApi, role: PluginRole, initialState?: State) {
    this.host = host;
    this.role = role;
    this.currentState = initialState;
  }

  // ── Outbound: player -> host ─────────────────────────────────────────

  /** Submit a player intent to the host plugin. */
  async sendAction<D = unknown>(
    type: string,
    data?: D,
  ): Promise<void> {
    this.assertPlayer('sendAction');
    const action: PlayerAction<D> = { type, data };
    await this.host.gameSendAction(action as PlayerAction);
  }

  // ── State accessors ──────────────────────────────────────────────────

  /** The most recently received authoritative state (or `undefined`). */
  get state(): State | undefined {
    return this.currentState === undefined
      ? undefined
      : (cloneForRead(this.currentState) as State);
  }

  /**
   * Register a handler invoked whenever the authoritative state
   * changes (full state OR patches). Only one handler is retained;
   * calling again replaces the previous subscription.
   */
  onStateChange(handler: StateChangeHandler<State>): this {
    this.assertPlayer('onStateChange');
    this.stateHandler = handler;
    return this;
  }

  /** Register a handler for transient events dispatched by the host. */
  onEvent(handler: GameEventHandler): this {
    this.assertPlayer('onEvent');
    this.eventHandler = handler;
    return this;
  }

  /** Register a handler invoked when the host ends the session. */
  onGameEnd(
    handler: (result: import('../rpc/types').SessionResult) => void,
  ): this {
    this.assertPlayer('onGameEnd');
    this.gameEndHandler = handler;
    return this;
  }

  // ── Internal inbound handlers (called by the SDK core) ───────────────

  /** @internal */
  _applyFullState(nextState: State): void {
    this.currentState = nextState;
    this.stateHandler?.(this.state, { reason: 'state' });
  }

  /** @internal */
  _applyPatches(patches: JsonPatches): void {
    if (this.currentState === undefined) {
      // Patches without a prior full state are undefined behaviour;
      // the safest recovery is to drop them.
      return;
    }
    this.currentState = apply(this.currentState as object, patches as never) as State;
    this.stateHandler?.(this.state, { reason: 'patches' });
  }

  /** @internal */
  _emitEvent(event: GameEvent): void {
    this.eventHandler?.(event);
  }

  /** @internal */
  _emitGameEnd(result: import('../rpc/types').SessionResult): void {
    this.gameEndHandler?.(result);
  }

  /** @internal — fires the initial callback once a handler is attached. */
  _replaceState(next: State | undefined): void {
    this.currentState = next;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private assertPlayer(method: string): void {
    if (this.role !== 'player') {
      throw new SdkRoleError(
        `sdk.player.${method}() is only available to the "player" role (current: "${this.role}")`,
      );
    }
  }
}

function cloneForRead<S>(value: S): S {
  const g = globalThis as unknown as {
    structuredClone?: (v: unknown) => unknown;
  };
  if (typeof g.structuredClone === 'function') {
    return g.structuredClone(value) as S;
  }
  return JSON.parse(JSON.stringify(value)) as S;
}
