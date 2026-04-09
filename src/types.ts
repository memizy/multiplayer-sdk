import type { OQSEItem } from '@memizy/oqse'

export type GamePhase =
  | 'waiting'
  | 'question'
  | 'reveal'
  | 'leaderboard'
  | 'finished'

export interface MultiPlayer {
  id: string
  name: string
  score: number
  joinedAt: number
}

export interface GameState {
  phase: GamePhase
  currentItemIndex: number
  totalItems: number
  countdown: number | null
  answers: Record<string, unknown>
  leaderboard: Array<unknown>
  [key: string]: unknown
}

export interface InitContext {
  pin: string
  items: OQSEItem[]
  assets: Record<string, unknown>
  settings?: Record<string, unknown>
  players?: MultiPlayer[]
  myPlayerId?: string
  myPlayerName?: string
}

export interface PluginReadyMessage {
  type: 'PLUGIN_READY'
  payload: {
    id: string
    version: string
  }
}

export interface InitSessionMessage {
  type: 'INIT_SESSION'
  role: 'host' | 'player'
  context: InitContext
}

export interface LegacyMultiInitMessage {
  type: 'MULTI_INIT'
  role?: 'host' | 'player'
  payload?: InitContext & { role?: 'host' | 'player' }
  context?: InitContext & { role?: 'host' | 'player' }
}

export interface StateUpdateMessage {
  type: 'STATE_UPDATE'
  payload?: {
    state?: GameState
  } | GameState
}

export interface PlayerJoinedMessage {
  type: 'PLAYER_JOINED'
  payload: MultiPlayer
}

export interface PlayerLeftMessage {
  type: 'PLAYER_LEFT'
  payload: { playerId: string } | string
}

export interface MultiActionMessage {
  type: 'MULTI_ACTION'
  payload?: {
    playerId?: string
    playerName?: string
    type: string
    data?: unknown
  } | {
    action?: { type: string; data?: unknown }
    playerId?: string
  }
}

export interface MultiBroadcastMessage {
  type: 'MULTI_BROADCAST'
  payload: GameState
}

export interface HostConfig<State> {
  onInit?: (context: InitContext) => void
  onPlayerJoined?: (player: MultiPlayer) => void
  onPlayerLeft?: (playerId: string) => void
  onPlayerAction?: (action: { type: string; data?: unknown }, playerId: string) => void
  /** @internal Preserve generic State in strict TS configurations. */
  _stateType?: State
}

export interface PlayerConfig<State> {
  onInit?: (context: InitContext) => void
  onStateUpdate?: (state: State) => void
}