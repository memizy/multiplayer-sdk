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
  answers: Record<string, any>
  leaderboard: Array<any>
  [key: string]: any
}

export interface InitContext {
  pin: string
  items: OQSEItem[]
  assets: Record<string, any>
  settings?: Record<string, any>
  players?: MultiPlayer[]
  myPlayerId?: string
  myPlayerName?: string
}

export interface HostConfig<State> {
  onInit?: (context: InitContext) => void
  onPlayerJoined?: (player: MultiPlayer) => void
  onPlayerLeft?: (playerId: string) => void
  onPlayerAction?: (action: { type: string; data: any }, playerId: string) => void
  /** @internal Preserve generic State in strict TS configurations. */
  _stateType?: State
}

export interface PlayerConfig<State> {
  onInit?: (context: InitContext) => void
  onStateUpdate?: (state: State) => void
}