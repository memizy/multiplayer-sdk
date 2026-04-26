/**
 * `sdk.room` — lobby roster, teams and synchronization primitives.
 *
 * Both the host and player roles share this manager, but only a subset
 * of methods is meaningful for each role. Methods that don't belong to
 * the current role are rejected with an explicit `SdkRoleError` so
 * misuse is caught early during development instead of silently
 * misbehaving on the wire.
 */

import type {
  HostApi,
  MultiPlayer,
  PluginRole,
  TeamInfo,
} from '../rpc/types';
import { SdkRoleError } from '../errors';

interface RoomSnapshot {
  pin: string;
  role: PluginRole;
  self: MultiPlayer | null;
  players: MultiPlayer[];
  teams: TeamInfo[];
  supportsTeams: boolean;
  supportsLateJoin: boolean;
  supportsReconnect: boolean;
  capacity: { min: number; max: number; recommended?: number };
}

export class RoomManager {
  private readonly host: HostApi;
  private snapshot: RoomSnapshot;

  constructor(host: HostApi, initial: RoomSnapshot) {
    this.host = host;
    this.snapshot = cloneSnapshot(initial);
  }

  // ── Snapshot accessors ───────────────────────────────────────────────

  /** Short lobby code assigned by the host app. */
  get pin(): string {
    return this.snapshot.pin;
  }

  /** Role this plugin instance was assigned. */
  get role(): PluginRole {
    return this.snapshot.role;
  }

  /** The player profile for this plugin instance (players only). */
  get self(): MultiPlayer | null {
    return this.snapshot.self ? { ...this.snapshot.self } : null;
  }

  /** A shallow copy of the lobby roster. */
  getPlayers(): MultiPlayer[] {
    return this.snapshot.players.map((p) => ({ ...p }));
  }

  /** Lookup a player by id. */
  getPlayer(playerId: string): MultiPlayer | undefined {
    const p = this.snapshot.players.find((x) => x.id === playerId);
    return p ? { ...p } : undefined;
  }

  /** Teams defined by the host app (empty when `supportsTeams=false`). */
  getTeams(): TeamInfo[] {
    return this.snapshot.teams.map((t) => ({ ...t }));
  }

  /** Players filtered by a given team id. */
  getPlayersInTeam(teamId: string): MultiPlayer[] {
    return this.snapshot.players
      .filter((p) => p.teamId === teamId)
      .map((p) => ({ ...p }));
  }

  /** Whether the plugin manifest declared `supportsTeams`. */
  get supportsTeams(): boolean {
    return this.snapshot.supportsTeams;
  }

  /** Whether the plugin manifest declared `supportsLateJoin`. */
  get supportsLateJoin(): boolean {
    return this.snapshot.supportsLateJoin;
  }

  /** Whether the plugin manifest declared `supportsReconnect`. */
  get supportsReconnect(): boolean {
    return this.snapshot.supportsReconnect;
  }

  /** Manifest-declared capacity hints. */
  get capacity(): RoomSnapshot['capacity'] {
    return { ...this.snapshot.capacity };
  }

  // ── Synchronization signals ──────────────────────────────────────────

  /**
   * Player role only: signal that the UI has fully rendered and the
   * plugin is ready to receive gameplay state. The host app forwards
   * this to the host plugin's `onPlayerReady()` callback.
   */
  async clientReady(): Promise<void> {
    this.assertRole('player', 'clientReady');
    await this.host.roomClientReady();
  }

  /**
   * Host role only: signal that the host plugin finished processing
   * its initial payload and is ready to receive the Start command.
   */
  async hostReady(): Promise<void> {
    this.assertRole('host', 'hostReady');
    await this.host.roomHostReady();
  }

  /**
   * Host role only: authoritatively promote the session to `playing`.
   * Typically called once every player's `onPlayerReady` has fired,
   * or when a grace timeout expires.
   */
  async startGame(): Promise<void> {
    this.assertRole('host', 'startGame');
    await this.host.roomStartGame();
  }

  // ── Internal mutators (called by the SDK core) ───────────────────────

  /** @internal */
  _applyJoin(player: MultiPlayer): void {
    const existing = this.snapshot.players.findIndex((p) => p.id === player.id);
    if (existing === -1) this.snapshot.players.push({ ...player });
    else this.snapshot.players[existing] = { ...player };
  }

  /** @internal */
  _applyLeave(playerId: string): void {
    this.snapshot.players = this.snapshot.players.filter(
      (p) => p.id !== playerId,
    );
  }

  /**
   * Updates a player's name in the local roster.
   * @internal
   */
  public renamePlayer(playerId: string, newName: string): void {
    const player = this.snapshot.players.find((p) => p.id === playerId);
    if (player) {
      player.name = newName;
    }
    if (this.snapshot.self?.id === playerId) {
      this.snapshot.self.name = newName;
    }
  }

  /** @internal */
  _replaceRoster(players: MultiPlayer[]): void {
    this.snapshot.players = players.map((p) => ({ ...p }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private assertRole(required: PluginRole, method: string): void {
    if (this.snapshot.role !== required) {
      throw new SdkRoleError(
        `sdk.room.${method}() is only available to the "${required}" role (current: "${this.snapshot.role}")`,
      );
    }
  }
}

function cloneSnapshot(value: RoomSnapshot): RoomSnapshot {
  return {
    pin: value.pin,
    role: value.role,
    self: value.self ? { ...value.self } : null,
    players: value.players.map((p) => ({ ...p })),
    teams: value.teams.map((t) => ({ ...t })),
    supportsTeams: value.supportsTeams,
    supportsLateJoin: value.supportsLateJoin,
    supportsReconnect: value.supportsReconnect,
    capacity: { ...value.capacity },
  };
}
