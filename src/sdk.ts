import type { HostConfig, MultiPlayer, PlayerConfig } from './types'

type Role = 'host' | 'player' | null

interface MessageEnvelope {
  type: string
  payload?: any
  role?: Role
  context?: any
}

export function createMultiplayerPlugin<State>() {
  let role: Role = null
  let hostConfig: HostConfig<State> = {}
  let playerConfig: PlayerConfig<State> = {}
  let isStarted = false

  const postToParent = (type: string, payload?: any) => {
    window.parent.postMessage({ type, payload }, '*')
  }

  const defineHost = (config: HostConfig<State>) => {
    hostConfig = config
  }

  const definePlayer = (config: PlayerConfig<State>) => {
    playerConfig = config
  }

  const host = {
    broadcastState(state: State) {
      postToParent('MULTI_BROADCAST', state)
    },

    endSession(scores: Record<string, MultiPlayer>) {
      postToParent('SESSION_COMPLETED', scores)
    },
  }

  const player = {
    sendAction(type: string, data: any) {
      postToParent('MULTI_ACTION', { type, data })
    },
  }

  const onMessage = (event: MessageEvent<MessageEnvelope>) => {
    const message = event.data

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return
    }

    if (message.type === 'MULTI_INIT') {
      role = message.role ?? null
      const context = message.context ?? message.payload

      if (role === 'host') {
        hostConfig.onInit?.(context)
      }

      if (role === 'player') {
        playerConfig.onInit?.(context)
      }

      return
    }

    if (role === 'host') {
      if (message.type === 'PLAYER_JOINED') {
        hostConfig.onPlayerJoined?.(message.payload as MultiPlayer)
        return
      }

      if (message.type === 'PLAYER_LEFT') {
        hostConfig.onPlayerLeft?.(message.payload?.playerId ?? message.payload)
        return
      }

      if (message.type === 'MULTI_ACTION') {
        const action = message.payload?.action ?? message.payload
        const playerId = message.payload?.playerId
        hostConfig.onPlayerAction?.(action, playerId)
      }

      return
    }

    if (role === 'player' && message.type === 'STATE_UPDATE') {
      const state = message.payload?.state ?? message.payload
      playerConfig.onStateUpdate?.(state as State)
    }
  }

  const start = () => {
    if (isStarted) {
      return
    }

    isStarted = true
    window.addEventListener('message', onMessage)
  }

  return {
    defineHost,
    definePlayer,
    host,
    player,
    start,
  }
}