/**
 * RPC contract between the Memizy Host application (Vue) and a Memizy
 * Multiplayer Plugin running inside an iframe.
 *
 * The protocol is split into three logical domains that map 1:1 to the
 * namespaced method prefixes on the interfaces below:
 *
 *   - `sys*`      System lifecycle (handshake, resize, error reporting).
 *   - `settings*` Host-only settings authoring during the
 *                 `host-settings` phase.
 *   - `room*`     Lobby / roster / synchronization signals.
 *   - `game*`     Authoritative game-state broadcasts, per-player state
 *                 patches, transient events and player-intent actions.
 *
 * All domain data (items, meta, assets) originates from the OQSE
 * ecosystem (`@memizy/oqse`) and MUST be validated by the Host
 * application before being persisted. Plugins are assumed to treat
 * content as immutable — the SDK intentionally omits any upload /
 * mutation primitives here.
 *
 * Two flat RPC interfaces are defined:
 *   - `HostApi`   : methods the Host exposes to the Plugin  (Plugin -> Host)
 *   - `PluginApi` : methods the Plugin exposes to the Host  (Host   -> Plugin)
 */

import type {
  MediaObject,
  OQSEItem,
  OQSEMeta,
} from '@memizy/oqse';

// ---------------------------------------------------------------------------
// Plugin identity & session configuration
// ---------------------------------------------------------------------------

export interface PluginIdentity {
  id: string;
  version: string;
  /**
   * Minimum multiplayer protocol version this plugin was built against
   * (semver-major.minor, e.g. `'0.4'`). The host MAY refuse to load a
   * plugin whose contract is incompatible.
   */
  protocol?: string;
}

/** Host-provided UX configuration, mirrors the single-player SDK. */
export interface SessionSettings {
  locale: string;
  theme: 'light' | 'dark' | 'system';
}

export type ConfigUpdate = Partial<Pick<SessionSettings, 'theme' | 'locale'>>;

/** Why a session was terminated from the outside. */
export type SessionAbortedReason =
  | 'user_exit'
  | 'timeout'
  | 'host_error'
  | 'kicked'
  | 'room_closed';

// ---------------------------------------------------------------------------
// Players & teams
// ---------------------------------------------------------------------------

/** Runtime player record shared between host and clients. */
export interface MultiPlayer {
  /** Stable, host-assigned identifier. */
  id: string;
  name: string;
  /** Join timestamp (ms since epoch). */
  joinedAt: number;
  /**
   * Optional team membership. Populated only when the plugin manifest
   * declares `appSpecific.memizy.multiplayer.supportsTeams: true`.
   */
  teamId?: string;
  /**
   * Opaque per-player data bag the host app may attach (e.g. avatar
   * URL). Plugins MUST treat unknown fields as transparent.
   */
  meta?: Record<string, unknown>;
}

export interface TeamInfo {
  id: string;
  name: string;
  /** Optional hex color the plugin may use for theming. */
  color?: string;
}

// ---------------------------------------------------------------------------
// Runtime roles, phases, and run-modes
// ---------------------------------------------------------------------------

/** Logical role the plugin instance should fulfil. */
export type PluginRole = 'host' | 'player';

/**
 * Authoritative lifecycle phase. The host drives transitions; the plugin
 * observes them through `PluginApi.onPhaseChange`. Phases form a one-way
 * state machine:
 *
 *   `host-settings` -> `synchronizing` -> `playing` -> `finished`
 *
 * Plugins that support live reconnect MAY observe `synchronizing` or
 * `playing` on their very first init (late joiners).
 */
export type GamePhase =
  | 'host-settings'
  | 'synchronizing'
  | 'playing'
  | 'finished';

/**
 * Fine-grained runtime mode that mirrors the Host application's split
 * lobby intent. Kept separate from `GamePhase` so the plugin can branch
 * its UI without knowing the phase transitions.
 */
export type RunMode = 'host-settings' | 'host-game' | 'client-game';

// ---------------------------------------------------------------------------
// Init payload (returned by HostApi.sysReady)
// ---------------------------------------------------------------------------

/** Base payload common to all roles. */
export interface InitSessionPayloadBase {
  /** Globally-unique session identifier assigned by the Host app. */
  sessionId: string;
  /** Short lobby code (usually 4-6 digits). */
  pin: string;
  /** Role the plugin instance MUST adopt. */
  role: PluginRole;
  /** Fine-grained run mode (see `RunMode`). */
  runMode: RunMode;
  /** Current lifecycle phase at the moment the plugin connected. */
  phase: GamePhase;

  /** Study-set items the plugin can render (immutable). */
  items: OQSEItem[];
  /** Study-set metadata (immutable). */
  setMeta?: OQSEMeta;
  /** Resolved asset dictionary used by rich-text tokens (immutable). */
  assets: Record<string, MediaObject>;

  /** Current lobby roster (including self for players). */
  players: MultiPlayer[];
  /** Team roster; empty when `supportsTeams` is false. */
  teams: TeamInfo[];

  /** Whether the plugin manifest declared `supportsTeams`. */
  supportsTeams: boolean;
  /** Whether the plugin manifest declared `supportsLateJoin`. */
  supportsLateJoin: boolean;
  /** Whether the plugin manifest declared `supportsReconnect`. */
  supportsReconnect: boolean;
  /** Target player capacity hints from the manifest. */
  capacity: { min: number; max: number; recommended?: number };

  /** UX configuration (theme, locale). */
  configuration: SessionSettings;

  /**
   * Current plugin-defined settings object as authored during
   * `host-settings`. For players this is a *read-only* snapshot the
   * teacher confirmed at game start.
   */
  settings: Record<string, unknown>;

  /**
   * Optional pre-existing game state. Present when a plugin is late-
   * joining a `playing` session (only populated for the `player` role).
   */
  gameState?: unknown;
}

export interface HostInitSessionPayload extends InitSessionPayloadBase {
  role: 'host';
}

export interface PlayerInitSessionPayload extends InitSessionPayloadBase {
  role: 'player';
  /** Full profile of the player this plugin instance represents. */
  self: MultiPlayer;
}

export type InitSessionPayload =
  | HostInitSessionPayload
  | PlayerInitSessionPayload;

// ---------------------------------------------------------------------------
// Argument shapes for Plugin -> Host calls
// ---------------------------------------------------------------------------

export interface ResizeRequest {
  height: number | 'auto';
  width?: number | 'auto' | null;
}

export interface PluginErrorReport {
  code: string;
  message: string;
  /** Optional plugin-internal context. MUST NOT contain secrets. */
  context?: Record<string, unknown> | null;
}

/**
 * Payload describing a player-driven intent. The plugin's Host-role
 * code is the authority that validates and applies it.
 */
export interface PlayerAction<Data = unknown> {
  /** Plugin-defined action kind (e.g. `'answer'`, `'buzz'`). */
  type: string;
  /** Arbitrary JSON-safe action data. */
  data?: Data;
}

/**
 * Transient "fire and forget" message dispatched by the host plugin
 * to one or more players. Never persisted into the game state.
 */
export interface GameEvent<Data = unknown> {
  type: string;
  data?: Data;
}

export type EventTarget = 'all' | string | string[];

/** Result emitted when the host plugin terminates a session. */
export interface SessionResult {
  /** Per-player scoreboard keyed by playerId. */
  scores: Record<string, number>;
  /** Optional free-form plugin payload (e.g. per-team breakdown). */
  summary?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// JSON patches (produced by mutative, enablePatches: true)
// ---------------------------------------------------------------------------

/**
 * Single JSON-patch operation, structurally compatible with mutative's
 * default (`pathAsArray: true`) output. Declared inline so the host-side
 * does NOT need `mutative` as a dependency to typecheck the RPC.
 */
export interface JsonPatch {
  op: 'add' | 'remove' | 'replace';
  path: (string | number)[];
  value?: unknown;
}

export type JsonPatches = JsonPatch[];

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

export type OQSETextToken =
  | { type: 'text'; value: string }
  | { type: 'blank'; key: string }
  | { type: 'asset'; key: string; media?: MediaObject };

// ---------------------------------------------------------------------------
// HostApi — methods the HOST exposes to the PLUGIN
// (Plugin calls these through the Penpal `RemoteProxy<HostApi>`.)
// ---------------------------------------------------------------------------

export interface HostApi {
  // ── System ───────────────────────────────────────────────────────────
  /** Plugin requests the initial session data. Called once after handshake. */
  sysReady(identity: PluginIdentity): Promise<InitSessionPayload>;
  /** Ask the host app to resize the plugin iframe. */
  sysRequestResize(request: ResizeRequest): Promise<void>;
  /** Report a non-fatal error for host-side telemetry. */
  sysReportError(error: PluginErrorReport): Promise<void>;
  /** Voluntarily close this plugin instance (e.g. user pressed "Leave"). */
  sysExit(): Promise<void>;

  // ── Settings (host role, `host-settings` phase only) ────────────────
  /** Publish the authoritative settings snapshot to the host app. */
  settingsReplace(settings: Record<string, unknown>): Promise<void>;
  /** Apply a JSON patch set on top of the committed settings. */
  settingsApplyPatches(patches: JsonPatches): Promise<void>;
  /**
   * Toggle the host app's "Start game" button. When `valid=false` the
   * host app MUST refuse to advance to `synchronizing`.
   */
  settingsSetValid(valid: boolean): Promise<void>;

  // ── Room / synchronization ──────────────────────────────────────────
  /**
   * Player role: signal that the plugin UI is fully rendered and
   * prepared to accept gameplay. The host app forwards this as
   * `sys:client_ready` to the host plugin.
   */
  roomClientReady(): Promise<void>;
  /**
   * Host role: signal that the host plugin finished processing
   * initial data and is ready to receive the Start command.
   */
  roomHostReady(): Promise<void>;
  /**
   * Host role: authoritatively announce that all players are ready
   * (or the grace timeout expired). Triggers the `playing` phase.
   */
  roomStartGame(): Promise<void>;

  // ── Game (host role, broadcasts to players) ─────────────────────────
  /** Authoritatively set the full game state and broadcast it. */
  gameBroadcastState(state: unknown): Promise<void>;
  /** Apply mutative-generated patches on top of the current state. */
  gameBroadcastStatePatches(patches: JsonPatches): Promise<void>;
  /** Send the current full state to a specific player (reconnect / late-join). */
  gameSendStateTo(playerId: string, state: unknown): Promise<void>;
  /** Dispatch a transient event (never persisted) to one or more players. */
  gameSendEvent(target: EventTarget, event: GameEvent): Promise<void>;
  /** Close the game: broadcasts the final result and moves to `finished`. */
  gameEndSession(result: SessionResult): Promise<void>;

  // ── Game (player role, player -> host) ──────────────────────────────
  /** Submit a player intent to the host plugin. */
  gameSendAction(action: PlayerAction): Promise<void>;
}

// ---------------------------------------------------------------------------
// PluginApi — methods the PLUGIN exposes to the HOST
// (Host calls these through its `RemoteProxy<PluginApi>`.)
// ---------------------------------------------------------------------------

export interface PluginApi {
  // ── Common ──────────────────────────────────────────────────────────
  /** Host notifies the plugin that theme/locale changed mid-session. */
  onConfigUpdate(config: ConfigUpdate): Promise<void>;
  /** Host notifies the plugin that the session was externally terminated. */
  onSessionAborted(reason: SessionAbortedReason): Promise<void>;
  /** Host announces a new lifecycle phase. */
  onPhaseChange(phase: GamePhase): Promise<void>;

  // ── Host role ──────────────────────────────────────────────────────
  /** Host app received a `room:join` message. */
  onPlayerJoin(player: MultiPlayer, meta: PlayerJoinMeta): Promise<void>;
  /** Host app received a `room:leave` message. */
  onPlayerLeave(playerId: string): Promise<void>;
  /** A player plugin called `roomClientReady()` — forwarded to the host. */
  onPlayerReady(playerId: string): Promise<void>;
  /** A player plugin dispatched an action. */
  onPlayerAction(playerId: string, action: PlayerAction): Promise<void>;
  /**
   * The teacher pressed "Start game" in the host app shell. The host
   * plugin SHOULD now move to the synchronization flow.
   */
  onStartGameRequested(): Promise<void>;

  // ── Player role ────────────────────────────────────────────────────
  /** Full authoritative state broadcast from the host plugin. */
  onState(state: unknown): Promise<void>;
  /** Patch set on top of the most recent state. */
  onStatePatches(patches: JsonPatches): Promise<void>;
  /** Transient event dispatched by the host plugin. */
  onEvent(event: GameEvent): Promise<void>;
  /**
   * The host plugin ended the session. Players SHOULD switch to their
   * results / leaderboard UI.
   */
  onGameEnd(result: SessionResult): Promise<void>;
}

/** Metadata carried alongside every `onPlayerJoin`. */
export interface PlayerJoinMeta {
  /** `true` when this player was known before and dropped out. */
  isReconnect: boolean;
  /** `true` when this player joined while the game was already running. */
  isLateJoin: boolean;
}
