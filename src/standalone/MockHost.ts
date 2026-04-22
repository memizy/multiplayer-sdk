/**
 * MockHost - an in-memory implementation of `HostApi` used for local
 * development outside a real Memizy host.
 *
 * Behaviours:
 *
 *  - `sysReady` returns a pre-seeded `InitSessionPayload`.
 *  - Settings patches / replacements are recorded locally so plugin
 *    authors can introspect them.
 *  - Room / game RPCs are broadcast to any "peer" mocks attached to
 *    the same `MockHub` (e.g. the LocalSandbox wires multiple iframes
 *    to the same hub so a host and several players can talk).
 *  - When no hub is attached every outbound RPC simply logs and resolves
 *    successfully so plugin authors can still exercise their code.
 */

import { apply } from 'mutative';

import type {
  GameEvent,
  GamePhase,
  HostApi,
  InitSessionPayload,
  JsonPatches,
  MultiPlayer,
  PlayerAction,
  PlayerJoinMeta,
  PluginApi,
  PluginIdentity,
  SessionResult,
  TeamInfo,
  SessionSettings,
} from '../rpc/types';
import type { MediaObject, OQSEItem, OQSEMeta } from '@memizy/oqse';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StandaloneMockData {
  /** The role this plugin instance should see. Defaults to `'host'`. */
  role?: 'host' | 'player';
  /** Lobby code. Defaults to a pseudo-random 6-digit string. */
  pin?: string;
  /** Starting phase. Defaults to `'host-settings'` for the host role,
   *  `'synchronizing'` for the player role. */
  phase?: GamePhase;

  items?: OQSEItem[];
  setMeta?: OQSEMeta;
  assets?: Record<string, MediaObject>;

  players?: MultiPlayer[];
  teams?: TeamInfo[];

  supportsTeams?: boolean;
  supportsLateJoin?: boolean;
  supportsReconnect?: boolean;
  capacity?: { min: number; max: number; recommended?: number };

  settings?: Record<string, unknown>;
  configuration?: SessionSettings;

  /** Only meaningful for the `player` role. */
  self?: MultiPlayer;
  /** Only meaningful for late-joining players in `playing` phase. */
  gameState?: unknown;
}

/**
 * A hub connects multiple `MockHost` instances together so a host
 * plugin iframe and a handful of player iframes can exchange state
 * during local development.
 */
export interface MockHub {
  register(participant: MockParticipant): void;
  unregister(participant: MockParticipant): void;

  broadcastState(from: string, state: unknown): void;
  broadcastStatePatches(from: string, patches: JsonPatches): void;
  sendStateTo(from: string, playerId: string, state: unknown): void;
  sendEvent(
    from: string,
    target: 'all' | string | string[],
    event: GameEvent,
  ): void;
  endGame(from: string, result: SessionResult): void;
  submitAction(playerId: string, action: PlayerAction): void;

  clientReady(playerId: string): void;
  hostReady(fromHost: string): void;
  startGame(fromHost: string): void;

  settingsReplace(settings: Record<string, unknown>): void;
  settingsApplyPatches(patches: JsonPatches): void;
  settingsSetValid(valid: boolean): void;
}

export interface MockParticipant {
  /** Identity used by the hub for targeting (playerId for players,
   *  `'__host__'` for the host instance). */
  participantId: string;
  role: 'host' | 'player';
  plugin: PluginApi;
}

// ---------------------------------------------------------------------------
// MockHost
// ---------------------------------------------------------------------------

export class MockHost implements HostApi {
  private readonly plugin: PluginApi;
  private readonly seed: StandaloneMockData;
  private readonly debug: boolean;
  private readonly hub: MockHub | null;

  private settings: Record<string, unknown>;
  private state: unknown = undefined;
  private participantId: string | null = null;

  constructor(
    plugin: PluginApi,
    seed: StandaloneMockData = {},
    debug = false,
    hub: MockHub | null = null,
  ) {
    this.plugin = plugin;
    this.seed = seed;
    this.debug = debug;
    this.hub = hub;
    this.settings = { ...(seed.settings ?? {}) };
  }

  // ── HostApi: sys ─────────────────────────────────────────────────────

  async sysReady(_identity: PluginIdentity): Promise<InitSessionPayload> {
    const role = this.seed.role ?? 'host';
    const phase: GamePhase =
      this.seed.phase ??
      (role === 'host' ? 'host-settings' : 'synchronizing');

    const basePayload = {
      sessionId: `local-${randomId(8)}`,
      pin: this.seed.pin ?? generatePin(),
      runMode:
        role === 'host'
          ? phase === 'host-settings'
            ? ('host-settings' as const)
            : ('host-game' as const)
          : ('client-game' as const),
      phase,
      items: this.seed.items ?? [],
      setMeta: this.seed.setMeta,
      assets: this.seed.assets ?? {},
      players: this.seed.players ?? [],
      teams: this.seed.teams ?? [],
      supportsTeams: this.seed.supportsTeams ?? false,
      supportsLateJoin: this.seed.supportsLateJoin ?? false,
      supportsReconnect: this.seed.supportsReconnect ?? false,
      capacity: this.seed.capacity ?? { min: 1, max: 60, recommended: 20 },
      configuration: this.seed.configuration ?? {
        locale: 'en',
        theme: 'system' as const,
      },
      settings: this.settings,
      gameState: this.seed.gameState,
    };

    if (role === 'host') {
      this.participantId = '__host__';
      this.hub?.register({
        participantId: this.participantId,
        role,
        plugin: this.plugin,
      });
      return {
        ...basePayload,
        role,
      };
    }

    const self =
      this.seed.self ??
      {
        id: `local-player-${randomId(4)}`,
        name: 'Local Player',
        joinedAt: Date.now(),
      };
    this.participantId = self.id;
    this.hub?.register({
      participantId: this.participantId,
      role,
      plugin: this.plugin,
    });

    return {
      ...basePayload,
      role,
      self,
    };
  }

  async sysRequestResize(_request: {
    height: number | 'auto';
    width?: number | 'auto' | null;
  }): Promise<void> {
    this.log('sysRequestResize', _request);
  }

  async sysReportError(error: {
    code: string;
    message: string;
    context?: Record<string, unknown> | null;
  }): Promise<void> {
    console.warn(
      `[MockHost] plugin reported error ${error.code}: ${error.message}`,
      error.context,
    );
  }

  async sysExit(): Promise<void> {
    this.log('sysExit');
    if (this.participantId) this.hub?.unregister(this.asParticipant());
  }

  // ── HostApi: settings (host only) ────────────────────────────────────

  async settingsReplace(
    settings: Record<string, unknown>,
  ): Promise<void> {
    this.settings = { ...settings };
    this.log('settingsReplace', settings);
    this.hub?.settingsReplace(this.settings);
  }

  async settingsApplyPatches(patches: JsonPatches): Promise<void> {
    this.settings = apply(this.settings as object, patches as never) as Record<
      string,
      unknown
    >;
    this.log('settingsApplyPatches', patches);
    this.hub?.settingsApplyPatches(patches);
  }

  async settingsSetValid(valid: boolean): Promise<void> {
    this.log('settingsSetValid', valid);
    this.hub?.settingsSetValid(valid);
  }

  // ── HostApi: room ────────────────────────────────────────────────────

  async roomClientReady(): Promise<void> {
    if (!this.participantId) return;
    this.log('roomClientReady', this.participantId);
    this.hub?.clientReady(this.participantId);
  }

  async roomHostReady(): Promise<void> {
    if (!this.participantId) return;
    this.log('roomHostReady');
    this.hub?.hostReady(this.participantId);
  }

  async roomStartGame(): Promise<void> {
    if (!this.participantId) return;
    this.log('roomStartGame');
    this.hub?.startGame(this.participantId);
  }

  // ── HostApi: game (host -> players) ──────────────────────────────────

  async gameBroadcastState(state: unknown): Promise<void> {
    this.state = state;
    this.log('gameBroadcastState');
    this.hub?.broadcastState(this.participantId ?? '__host__', state);
  }

  async gameBroadcastStatePatches(patches: JsonPatches): Promise<void> {
    if (this.state !== undefined) {
      try {
        this.state = apply(this.state as object, patches as never);
      } catch (err) {
        console.warn('[MockHost] failed to apply patches:', err);
      }
    }
    this.log('gameBroadcastStatePatches', patches.length);
    this.hub?.broadcastStatePatches(
      this.participantId ?? '__host__',
      patches,
    );
  }

  async gameSendStateTo(playerId: string, state: unknown): Promise<void> {
    this.log('gameSendStateTo', playerId);
    this.hub?.sendStateTo(
      this.participantId ?? '__host__',
      playerId,
      state,
    );
  }

  async gameSendEvent(
    target: 'all' | string | string[],
    event: GameEvent,
  ): Promise<void> {
    this.log('gameSendEvent', target, event.type);
    this.hub?.sendEvent(this.participantId ?? '__host__', target, event);
  }

  async gameEndSession(result: SessionResult): Promise<void> {
    this.log('gameEndSession');
    this.hub?.endGame(this.participantId ?? '__host__', result);
  }

  // ── HostApi: game (player -> host) ───────────────────────────────────

  async gameSendAction(action: PlayerAction): Promise<void> {
    if (!this.participantId) return;
    this.log('gameSendAction', action.type);
    this.hub?.submitAction(this.participantId, action);
  }

  // ── Internals ────────────────────────────────────────────────────────

  private asParticipant(): MockParticipant {
    return {
      participantId: this.participantId ?? '__host__',
      role: this.seed.role ?? 'host',
      plugin: this.plugin,
    };
  }

  private log(...args: unknown[]): void {
    if (this.debug) console.log('[MockHost]', ...args);
  }
}

// ---------------------------------------------------------------------------
// MemoryMockHub - a simple hub wiring N participants to one shared bus
// ---------------------------------------------------------------------------

/**
 * Default in-memory hub used by `LocalSandbox`. Out-of-order delivery
 * and network jitter can be simulated by wrapping `invoke` in a
 * `setTimeout`, but the default is synchronous for deterministic tests.
 */
export class MemoryMockHub implements MockHub {
  private readonly participants = new Map<string, MockParticipant>();
  private readonly joinMeta = new Map<
    string,
    { isReconnect: boolean; isLateJoin: boolean }
  >();
  private phase: GamePhase = 'host-settings';
  private currentState: unknown = undefined;

  register(participant: MockParticipant): void {
    this.participants.set(participant.participantId, participant);
    if (participant.role === 'player') {
      const host = this.getHost();
      const meta: PlayerJoinMeta = this.joinMeta.get(participant.participantId) ?? {
        isReconnect: false,
        isLateJoin: this.phase === 'playing',
      };
      this.joinMeta.set(participant.participantId, {
        isReconnect: true,
        isLateJoin: false,
      });
      host?.plugin.onPlayerJoin(
        {
          id: participant.participantId,
          name: participant.participantId,
          joinedAt: Date.now(),
        },
        meta,
      );
    }
  }

  unregister(participant: MockParticipant): void {
    this.participants.delete(participant.participantId);
    if (participant.role === 'player') {
      const host = this.getHost();
      host?.plugin.onPlayerLeave(participant.participantId);
    }
  }

  broadcastState(_from: string, state: unknown): void {
    this.currentState = state;
    for (const p of this.participants.values()) {
      if (p.role === 'player') p.plugin.onState(state);
    }
  }

  broadcastStatePatches(_from: string, patches: JsonPatches): void {
    if (this.currentState !== undefined) {
      try {
        this.currentState = apply(
          this.currentState as object,
          patches as never,
        );
      } catch {
        // Defensive: if the host and hub diverged just drop the diff.
      }
    }
    for (const p of this.participants.values()) {
      if (p.role === 'player') p.plugin.onStatePatches(patches);
    }
  }

  sendStateTo(_from: string, playerId: string, state: unknown): void {
    const target = this.participants.get(playerId);
    if (target?.role === 'player') target.plugin.onState(state);
  }

  sendEvent(
    _from: string,
    target: 'all' | string | string[],
    event: GameEvent,
  ): void {
    const match = (id: string) => {
      if (target === 'all') return true;
      if (typeof target === 'string') return target === id;
      return target.includes(id);
    };
    for (const p of this.participants.values()) {
      if (p.role === 'player' && match(p.participantId)) {
        p.plugin.onEvent(event);
      }
    }
  }

  endGame(_from: string, result: SessionResult): void {
    this.phase = 'finished';
    for (const p of this.participants.values()) {
      if (p.role === 'player') p.plugin.onGameEnd(result);
      p.plugin.onPhaseChange('finished');
    }
  }

  submitAction(playerId: string, action: PlayerAction): void {
    const host = this.getHost();
    host?.plugin.onPlayerAction(playerId, action);
  }

  clientReady(playerId: string): void {
    const host = this.getHost();
    host?.plugin.onPlayerReady(playerId);
  }

  hostReady(_fromHost: string): void {
    // No-op in the in-memory hub: the teacher shell drives the
    // `onStartGameRequested` signal through the LocalSandbox UI.
  }

  startGame(_fromHost: string): void {
    this.phase = 'playing';
    for (const p of this.participants.values()) {
      p.plugin.onPhaseChange('playing');
    }
  }

  settingsReplace(_settings: Record<string, unknown>): void {
    // Settings mutations are only observed by the host plugin; we don't
    // need to re-broadcast them.
  }
  settingsApplyPatches(_patches: JsonPatches): void {}
  settingsSetValid(_valid: boolean): void {}

  /** Direct trigger used by the sandbox UI. */
  requestStartGame(): void {
    const host = this.getHost();
    host?.plugin.onStartGameRequested();
  }

  /** Move the hub to a new phase and notify every participant. */
  advancePhase(next: GamePhase): void {
    this.phase = next;
    for (const p of this.participants.values()) {
      p.plugin.onPhaseChange(next);
    }
  }

  private getHost(): MockParticipant | undefined {
    for (const p of this.participants.values()) {
      if (p.role === 'host') return p;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function randomId(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generatePin(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}
