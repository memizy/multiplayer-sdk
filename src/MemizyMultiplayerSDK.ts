/**
 * MemizyMultiplayerSDK - v0.4
 *
 * The wrapper a multiplayer plugin uses to talk to the Memizy Host
 * application. The SDK runs inside the plugin iframe and:
 *
 *  - Performs the Penpal handshake with `window.parent`.
 *  - Calls `HostApi.sysReady()` to retrieve the role-specific init
 *    payload (items, assets, players, teams, current phase, ...).
 *  - Instantiates a role-aware set of namespaced managers (`sys`,
 *    `room`, `settings`, `host`/`player`, `text`) and routes inbound
 *    RPC calls to the plugin's lifecycle callbacks.
 *  - Provides a drop-in `MockHost`-backed standalone mode for local
 *    development outside a real Memizy host.
 *
 * Plugin authors construct a single instance, attach callback handlers
 * via `onInit`, `onPlayerJoin`, `onStartGame`, etc., and then call
 * `connect()`. After that resolves the namespaced managers are live:
 *
 *   const sdk = new MemizyMultiplayerSDK({ id: 'my-quiz', version: '1.0.0' });
 *   sdk.onInit((ctx) => { ... });
 *   const init = await sdk.connect();
 */

import type { Methods, Connection } from 'penpal';
import { WindowMessenger, connect } from 'penpal';

import { HostManager } from './managers/HostManager';
import { PlayerManager } from './managers/PlayerManager';
import { RoomManager } from './managers/RoomManager';
import { SettingsManager } from './managers/SettingsManager';
import { SysManager } from './managers/SysManager';
import { TextManager } from './managers/TextManager';

import { SdkDestroyedError, SdkNotReadyError } from './errors';

import type {
  ConfigUpdate,
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
  PluginRole,
  SessionAbortedReason,
  SessionResult,
} from './rpc/types';

import type { MockHost, MockHub, StandaloneMockData } from './standalone/MockHost';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface MemizyMultiplayerSDKOptions {
  /** Unique plugin id (usually the manifest `id`). */
  id: string;
  /** Plugin version (semver). */
  version: string;
  /**
   * Minimum multiplayer protocol version the plugin requires. Defaults
   * to `'0.4'` — the version of this SDK.
   */
  protocol?: string;
  /**
   * Origins the plugin will accept messages from. Defaults to `['*']`
   * — tighten this in production (e.g. `['https://learn.memizy.com']`).
   */
  allowedOrigins?: (string | RegExp)[];
  /** Penpal handshake timeout in milliseconds. Defaults to `10_000`. */
  handshakeTimeout?: number;
  /** Log lifecycle events to the console. */
  debug?: boolean;
}

export interface ConnectOptions {
  /**
   * Override auto-detection. `'auto'` uses iframe mode when embedded
   * and standalone mode otherwise. Tests usually pin to `'standalone'`.
   */
  mode?: 'auto' | 'iframe' | 'standalone';
  /** Seed payload used when the SDK falls back into standalone mode. */
  standalone?: StandaloneMockData;
  /**
   * Optional shared `MockHub` used to connect multiple standalone SDK
   * instances in the same browser tab (e.g. an interactive sandbox
   * wiring one host plugin to several player plugins). Only meaningful
   * in standalone mode; ignored when running in a real iframe.
   */
  mockHub?: MockHub;
}

// ---------------------------------------------------------------------------
// Lifecycle callback shapes
// ---------------------------------------------------------------------------

export type InitHandler = (
  init: InitSessionPayload,
) => void | Promise<void>;
export type PhaseChangeHandler = (phase: GamePhase) => void | Promise<void>;
export type ConfigUpdateHandler = (
  config: ConfigUpdate,
) => void | Promise<void>;
export type SessionAbortedHandler = (
  reason: SessionAbortedReason,
) => void | Promise<void>;

export type PlayerJoinHandler = (
  player: MultiPlayer,
  meta: PlayerJoinMeta,
) => void | Promise<void>;
export type PlayerLeaveHandler = (
  playerId: string,
) => void | Promise<void>;
export type PlayerRenameHandler = (
  playerId: string,
  newName: string,
) => void | Promise<void>;
export type PlayerReadyHandler = (
  playerId: string,
) => void | Promise<void>;
export type PlayerActionHandler = (
  playerId: string,
  action: PlayerAction,
) => void | Promise<void>;
export type StartGameRequestedHandler = () => void | Promise<void>;

export type GameEndHandler = (
  result: SessionResult,
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// SDK
// ---------------------------------------------------------------------------

export class MemizyMultiplayerSDK<State = unknown> {
  readonly identity: PluginIdentity;

  // Config
  private readonly allowedOrigins: (string | RegExp)[];
  private readonly handshakeTimeout: number;
  private readonly debug: boolean;

  // Connection state
  private hostProxy: HostApi | null = null;
  private connection: Connection<HostApi & Methods> | null = null;
  private initPayload: InitSessionPayload | null = null;
  private phase: GamePhase | null = null;
  private destroyed = false;
  private sessionAborted = false;
  private mode: 'iframe' | 'standalone' | null = null;
  private mockHost: MockHost | null = null;

  // Namespaced managers (created after connect).
  private _sys: SysManager | null = null;
  private _room: RoomManager | null = null;
  private _settings: SettingsManager<Record<string, unknown>> | null = null;
  private _host: HostManager<State> | null = null;
  private _player: PlayerManager<State> | null = null;
  private _text: TextManager | null = null;

  // Lifecycle handlers
  private initHandler: InitHandler | null = null;
  private phaseHandler: PhaseChangeHandler | null = null;
  private configUpdateHandler: ConfigUpdateHandler | null = null;
  private sessionAbortedHandler: SessionAbortedHandler | null = null;

  // Host handlers
  private playerJoinHandler: PlayerJoinHandler | null = null;
  private playerLeaveHandler: PlayerLeaveHandler | null = null;
  private playerRenameHandler: PlayerRenameHandler | null = null;
  private playerReadyHandler: PlayerReadyHandler | null = null;
  private playerActionHandler: PlayerActionHandler | null = null;
  private startGameRequestedHandler: StartGameRequestedHandler | null = null;
  private stateHandler: Parameters<PlayerManager<State>['onStateChange']>[0] | null = null;
  private eventHandler: ((event: GameEvent) => void) | null = null;
  private gameEndHandler: GameEndHandler | null = null;

  constructor(options: MemizyMultiplayerSDKOptions) {
    this.identity = {
      id: options.id,
      version: options.version,
      protocol: options.protocol ?? '0.4',
    };
    this.allowedOrigins = options.allowedOrigins ?? ['*'];
    this.handshakeTimeout = options.handshakeTimeout ?? 10_000;
    this.debug = options.debug ?? false;
  }

  // ── Public manager accessors ─────────────────────────────────────────

  get sys(): SysManager {
    return this.assertReady(this._sys, 'sys');
  }
  get room(): RoomManager {
    return this.assertReady(this._room, 'room');
  }
  get settings(): SettingsManager<Record<string, unknown>> {
    return this.assertReady(this._settings, 'settings');
  }
  /** Host-role gameplay surface. Throws when accessed from a player plugin. */
  get host(): HostManager<State> {
    const mgr = this.assertReady(this._host, 'host');
    return mgr;
  }
  /** Player-role gameplay surface. Throws when accessed from a host plugin. */
  get player(): PlayerManager<State> {
    const mgr = this.assertReady(this._player, 'player');
    return mgr;
  }
  get text(): TextManager {
    return this.assertReady(this._text, 'text');
  }

  /** The initial `HostApi.sysReady()` payload (`null` until connected). */
  get session(): InitSessionPayload | null {
    return this.initPayload;
  }

  /** Current lifecycle phase (`null` until connected). */
  get currentPhase(): GamePhase | null {
    return this.phase;
  }

  /** `true` when running without a real Memizy host frame. */
  get isStandalone(): boolean {
    return this.mode === 'standalone';
  }

  /** `true` after `connect()` resolved. */
  get isConnected(): boolean {
    return this.initPayload !== null;
  }

  // ── Lifecycle handler registration ───────────────────────────────────

  /** Called once, right after `connect()` receives the init payload. */
  onInit(handler: InitHandler): this {
    this.initHandler = handler;
    return this;
  }

  /** Called whenever the host advances to a new lifecycle phase. */
  onPhaseChange(handler: PhaseChangeHandler): this {
    this.phaseHandler = handler;
    return this;
  }

  /** Host-pushed theme/locale changes. */
  onConfigUpdate(handler: ConfigUpdateHandler): this {
    this.configUpdateHandler = handler;
    return this;
  }

  /** Host terminated the session externally. */
  onSessionAborted(handler: SessionAbortedHandler): this {
    this.sessionAbortedHandler = handler;
    return this;
  }

  // Host-role callbacks

  /** A player joined the lobby (or re-joined after dropout). */
  onPlayerJoin(handler: PlayerJoinHandler): this {
    this.playerJoinHandler = handler;
    return this;
  }
  /** A player left the lobby. */
  onPlayerLeave(handler: PlayerLeaveHandler): this {
    this.playerLeaveHandler = handler;
    return this;
  }
  /**
   * Fires when a player changes their name while in the lobby or game.
   * Note: `sdk.room.getPlayers()` is automatically updated before this fires.
   */
  public onPlayerRename(handler: PlayerRenameHandler): this {
    this.playerRenameHandler = handler;
    return this;
  }
  /** A player plugin signalled `roomClientReady()`. */
  onPlayerReady(handler: PlayerReadyHandler): this {
    this.playerReadyHandler = handler;
    return this;
  }
  /** A player plugin dispatched a `gameSendAction`. */
  onPlayerAction(handler: PlayerActionHandler): this {
    this.playerActionHandler = handler;
    return this;
  }
  /** The teacher pressed "Start game" in the host-settings UI. */
  onStartGameRequested(handler: StartGameRequestedHandler): this {
    this.startGameRequestedHandler = handler;
    return this;
  }

  // Convenience wrappers around the player-side manager callbacks.

  /** (Player role) Listen for authoritative state updates. */
  onState(
    handler: Parameters<PlayerManager<State>['onStateChange']>[0],
  ): this {
    this.stateHandler = handler;
    this._player?.onStateChange(handler);
    return this;
  }
  /** (Player role) Listen for transient events. */
  onEvent(handler: (event: GameEvent) => void): this {
    this.eventHandler = handler;
    this._player?.onEvent(handler);
    return this;
  }
  /** (Player role) Listen for the host-initiated game end. */
  onGameEnd(handler: GameEndHandler): this {
    this.gameEndHandler = handler;
    this._player?.onGameEnd(handler);
    return this;
  }

  // ── Connection ───────────────────────────────────────────────────────

  /**
   * Establish the connection to the host and fetch the initial session.
   * In iframe mode this performs the Penpal handshake with
   * `window.parent`; in standalone mode a mock host backed by
   * in-memory data is substituted.
   */
  async connect(options: ConnectOptions = {}): Promise<InitSessionPayload> {
    if (this.destroyed) {
      throw new SdkDestroyedError(
        'Cannot connect() after the SDK has been destroyed',
      );
    }
    if (this.initPayload) return this.initPayload;

    const mode = this.resolveMode(options.mode ?? 'auto');
    this.mode = mode;

    if (mode === 'iframe') {
      this.hostProxy = await this.connectViaPenpal();
    } else {
      this.hostProxy = await this.bootstrapStandalone(
        options.standalone,
        options.mockHub ?? null,
      );
    }

    const payload = await this.hostProxy.sysReady(this.identity);
    this.bootstrapManagers(payload);
    this.initPayload = payload;
    this.phase = payload.phase;

    this.log(
      `connected (${mode}) - role="${payload.role}" phase="${payload.phase}" players=${payload.players.length}`,
    );

    // Flush the init callback AFTER managers are ready so plugin code
    // can reach `sdk.room`, `sdk.settings`, etc. from the first tick.
    try {
      await this.initHandler?.(payload);
    } catch (err) {
      console.error('[memizy-multiplayer-sdk] onInit handler threw:', err);
    }

    return payload;
  }

  /**
   * Tear down the connection, clear every manager and mark the SDK as
   * destroyed. Safe to call multiple times.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    try {
      this.connection?.destroy();
    } catch {
      // Penpal may have already closed.
    }
    this.connection = null;
    this.hostProxy = null;
    this.initPayload = null;
    this.phase = null;
    this.mockHost = null;

    this._sys = null;
    this._room = null;
    this._settings = null;
    this._host = null;
    this._player = null;
    this._text = null;
  }

  // ── Internal: Penpal handshake ───────────────────────────────────────

  private resolveMode(
    requested: 'auto' | 'iframe' | 'standalone',
  ): 'iframe' | 'standalone' {
    if (requested !== 'auto') return requested;
    try {
      return window.self === window.top ? 'standalone' : 'iframe';
    } catch {
      // Cross-origin access to `window.top` throws -> we ARE embedded.
      return 'iframe';
    }
  }

  private async connectViaPenpal(): Promise<HostApi> {
    const messenger = new WindowMessenger({
      remoteWindow: window.parent,
      allowedOrigins: this.allowedOrigins,
    });

    const pluginMethods: PluginApi = this.buildPluginApi();

    this.connection = connect<HostApi & Methods>({
      messenger,
      methods: pluginMethods as unknown as Methods,
      timeout: this.handshakeTimeout,
      log: this.debug
        ? (...args: unknown[]) => console.log('[penpal]', ...args)
        : undefined,
    });

    return this.connection.promise;
  }

  private async bootstrapStandalone(
    seed: StandaloneMockData | undefined,
    hub: MockHub | null,
  ): Promise<HostApi> {
    const { MockHost } = await import('./standalone/MockHost');
    const mock = new MockHost(this.buildPluginApi(), seed, this.debug, hub);
    this.mockHost = mock;
    return mock;
  }

  // ── Internal: PluginApi the host calls back into ─────────────────────

  private buildPluginApi(): PluginApi {
    return {
      onConfigUpdate: async (config) => {
        this.log('onConfigUpdate', config);
        await this.safeCall(this.configUpdateHandler, config);
      },

      onSessionAborted: async (reason) => {
        this.log('onSessionAborted', reason);
        this.sessionAborted = true;
        await this.safeCall(this.sessionAbortedHandler, reason);
      },

      onPhaseChange: async (phase) => {
        this.log('onPhaseChange', phase);
        this.phase = phase;
        await this.safeCall(this.phaseHandler, phase);
      },

      // ── Host role ────────────────────────────────────────────────
      onPlayerJoin: async (player, meta) => {
        this.log('onPlayerJoin', player.id, meta);
        this._room?._applyJoin(player);
        await this.safeCall2(this.playerJoinHandler, player, meta);
      },

      onPlayerLeave: async (playerId) => {
        this.log('onPlayerLeave', playerId);
        this._room?._applyLeave(playerId);
        await this.safeCall(this.playerLeaveHandler, playerId);
      },

      onPlayerRename: async (playerId: string, newName: string) => {
        this.log('onPlayerRename', playerId, newName);
        // Automatically update the room manager's state FIRST.
        this._room?.renamePlayer(playerId, newName);
        // Then notify the plugin.
        await this.safeCall2(this.playerRenameHandler, playerId, newName);
      },

      onPlayerReady: async (playerId) => {
        this.log('onPlayerReady', playerId);
        await this.safeCall(this.playerReadyHandler, playerId);
      },

      onPlayerAction: async (playerId, action) => {
        this.log('onPlayerAction', playerId, action.type);
        await this.safeCall2(this.playerActionHandler, playerId, action);
      },

      onStartGameRequested: async () => {
        this.log('onStartGameRequested');
        await this.safeCall(this.startGameRequestedHandler, undefined);
      },

      // ── Player role ──────────────────────────────────────────────
      onState: async (state) => {
        this.log('onState');
        this._player?._applyFullState(state as State);
      },

      onStatePatches: async (patches: JsonPatches) => {
        this.log('onStatePatches', patches.length);
        this._player?._applyPatches(patches);
      },

      onEvent: async (event: GameEvent) => {
        this.log('onEvent', event.type);
        this._player?._emitEvent(event);
      },

      onGameEnd: async (result: SessionResult) => {
        this.log('onGameEnd', Object.keys(result.scores).length);
        this._player?._emitGameEnd(result);
      },
    };
  }

  // ── Internal: manager wiring ─────────────────────────────────────────

  private bootstrapManagers(payload: InitSessionPayload): void {
    const host = this.hostProxy!;
    const sessionStartedAt = Date.now();

    this._sys = new SysManager(host, sessionStartedAt);
    this._room = new RoomManager(host, {
      pin: payload.pin,
      role: payload.role,
      self: payload.role === 'player' ? payload.self : null,
      players: payload.players,
      teams: payload.teams,
      supportsTeams: payload.supportsTeams,
      supportsLateJoin: payload.supportsLateJoin,
      supportsReconnect: payload.supportsReconnect,
      capacity: payload.capacity,
    });
    this._settings = new SettingsManager(host, payload.role, payload.settings);
    this._text = new TextManager(payload.assets);

    if (payload.role === 'host') {
      this._host = new HostManager<State>(host, 'host');
      this._player = null;
    } else {
      this._player = new PlayerManager<State>(
        host,
        'player',
        payload.gameState as State | undefined,
      );
      if (this.stateHandler) this._player.onStateChange(this.stateHandler);
      if (this.eventHandler) this._player.onEvent(this.eventHandler);
      if (this.gameEndHandler) this._player.onGameEnd(this.gameEndHandler);
      this._host = null;
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private assertReady<T>(value: T | null, name: string): T {
    if (this.destroyed) {
      throw new SdkDestroyedError(
        `sdk.${name} accessed after .destroy()`,
      );
    }
    if (value === null) {
      throw new SdkNotReadyError(
        `sdk.${name} accessed before .connect() resolved`,
      );
    }
    return value;
  }

  private async safeCall<A>(
    handler: ((arg: A) => void | Promise<void>) | null,
    arg: A,
  ): Promise<void> {
    if (!handler) return;
    try {
      await handler(arg);
    } catch (err) {
      console.error('[memizy-multiplayer-sdk] handler threw:', err);
    }
  }

  private async safeCall2<A, B>(
    handler: ((a: A, b: B) => void | Promise<void>) | null,
    a: A,
    b: B,
  ): Promise<void> {
    if (!handler) return;
    try {
      await handler(a, b);
    } catch (err) {
      console.error('[memizy-multiplayer-sdk] handler threw:', err);
    }
  }

  private log(...args: unknown[]): void {
    if (this.debug) console.log('[memizy-multiplayer-sdk]', ...args);
  }

  /** @internal — for tests. */
  get _sessionAborted(): boolean {
    return this.sessionAborted;
  }

  /** @internal — for tests / standalone orchestration. */
  get _role(): PluginRole | null {
    return this.initPayload?.role ?? null;
  }

  /** @internal — for tests / sandbox harnesses to drive the mock host. */
  get _mockHost(): MockHost | null {
    return this.mockHost;
  }
}
