import { prepareRichTextForDisplay, tokenizeOqseTags } from '@memizy/oqse'
import type {
  HostConfig,
  InitContext,
  InitSessionMessage,
  MultiPlayer,
  MultiActionMessage,
  MultiBroadcastMessage,
  MultiReadyMessage,
  PlayerConfig,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  PrepareGameMessage,
  PluginReadyMessage,
  StartGameMessage,
  StateUpdateMessage,
} from './types'

type Role = 'host' | 'player' | null

const SDK_VERSION = '0.3.0'

interface MessageEnvelope {
  type: string
  payload?: unknown
  role?: Role
  context?: unknown
}

export function createMultiplayerPlugin<State>() {
  let role: Role = null
  let hostConfig: HostConfig<State> = {}
  let playerConfig: PlayerConfig<State> = {}
  let isStarted = false
  let readySent = false
  let sessionAssets: Record<string, any> = {}

  const cloneForPostMessage = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  const postToParent = (message: PluginReadyMessage | InitSessionMessage | MultiBroadcastMessage | MultiActionMessage | PlayerJoinedMessage | PlayerLeftMessage | StateUpdateMessage | MultiReadyMessage | Record<string, unknown>) => {
    window.parent.postMessage(cloneForPostMessage(message), '*')
  }

  const postReady = () => {
    if (readySent) {
      return
    }

    readySent = true
    postToParent({
      type: 'PLUGIN_READY',
      payload: {
        id: window.location.origin + window.location.pathname,
        version: SDK_VERSION,
      },
    })
  }

  const postReadyToStart = () => {
    postToParent({ type: 'MULTI_READY' } as MultiReadyMessage)
  }

  const defineHost = (config: HostConfig<State>) => {
    hostConfig = config
  }

  const definePlayer = (config: PlayerConfig<State>) => {
    playerConfig = config
  }

  const host = {
    broadcastState(state: State) {
      postToParent({ type: 'MULTI_BROADCAST', payload: state } as MultiBroadcastMessage)
    },

    endSession(scores: Record<string, MultiPlayer>) {
      postToParent({ type: 'SESSION_COMPLETED', payload: scores } as Record<string, unknown>)
    },
  }

  const player = {
    sendAction(type: string, data: unknown) {
      postToParent({ type: 'MULTI_ACTION', payload: { type, data } })
    },
  }

  const extractContext = (message: MessageEnvelope): InitContext | null => {
    const maybeContext = (message.context ?? message.payload) as Partial<InitContext> & { role?: Role; playerId?: string; playerName?: string } | undefined
    if (!maybeContext) {
      return null
    }

    return {
      pin: maybeContext.pin ?? '',
      items: maybeContext.items ?? [],
      assets: maybeContext.assets ?? {},
      settings: maybeContext.settings ?? {},
      players: maybeContext.players ?? [],
      myPlayerId: maybeContext.myPlayerId ?? maybeContext.playerId,
      myPlayerName: maybeContext.myPlayerName ?? maybeContext.playerName,
    }
  }

  const extractRole = (message: MessageEnvelope): Role => {
    const context = message.context as { role?: Role } | undefined
    const payload = message.payload as { role?: Role } | undefined
    return message.role ?? context?.role ?? payload?.role ?? null
  }

  const onMessage = (event: MessageEvent<MessageEnvelope>) => {
    const message = event.data

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return
    }

    if (message.type === 'INIT_SESSION' || message.type === 'MULTI_INIT') {
      role = extractRole(message)
      const context = extractContext(message)
      sessionAssets = (context?.assets as Record<string, any>) ?? {}

      if (role === 'host') {
        hostConfig.onInit?.(context ?? {
          pin: '',
          items: [],
          assets: {},
          settings: {},
          players: [],
        })
      }

      if (role === 'player') {
        playerConfig.onInit?.(context ?? {
          pin: '',
          items: [],
          assets: {},
          settings: {},
          players: [],
        })
      }

      return
    }

    if (message.type === 'PREPARE_GAME') {
      const payload = message.payload as PrepareGameMessage['payload']
      if (role === 'host') hostConfig.onPrepareGame?.(payload.players)
      if (role === 'player') playerConfig.onPrepareGame?.(payload.players)
      return
    }

    if (message.type === 'START_GAME') {
      const startMessage = message as StartGameMessage
      if (startMessage.type === 'START_GAME' && role === 'host') hostConfig.onStartGame?.()
      if (startMessage.type === 'START_GAME' && role === 'player') playerConfig.onStartGame?.()
      return
    }

    if (role === 'host') {
      if (message.type === 'PLAYER_JOINED') {
        hostConfig.onPlayerJoined?.(message.payload as MultiPlayer)
        return
      }

      if (message.type === 'PLAYER_LEFT') {
        const payload = message.payload as PlayerLeftMessage['payload']
        hostConfig.onPlayerLeft?.(typeof payload === 'string' ? payload : payload.playerId)
        return
      }

      if (message.type === 'MULTI_ACTION') {
        const payload = message.payload as MultiActionMessage['payload']
        const action = payload && typeof payload === 'object' && 'action' in payload
          ? (payload as { action?: { type: string; data?: unknown } }).action
          : payload
        const playerId = payload && typeof payload === 'object' && payload !== null ? payload.playerId : undefined
        hostConfig.onPlayerAction?.(
          (action && typeof action === 'object' && 'type' in action ? action : { type: 'unknown', data: undefined }) as { type: string; data?: unknown },
          playerId ?? '',
        )
      }

      return
    }

    if (role === 'player' && message.type === 'STATE_UPDATE') {
      const payload = message.payload as StateUpdateMessage['payload']
      const state = payload && typeof payload === 'object' && 'state' in payload ? payload.state : payload
      playerConfig.onStateUpdate?.(state as State)
    }
  }

  const start = () => {
    if (isStarted) {
      return
    }

    isStarted = true
    window.addEventListener('message', onMessage)
    postReady()
  }

  return {
    defineHost,
    definePlayer,
    host,
    player,
    postReadyToStart,
    postReady,
    parseTextTokens: (rawText: string) => {
      return tokenizeOqseTags(rawText)
    },
    renderHtml: (
      rawText: string,
      options?: {
        markdownParser?: (text: string) => string | Promise<string>
        sanitizer?: (html: string) => string
      },
    ) => {
      const mdParser = (text: string) => {
        const parsed = options?.markdownParser ? options.markdownParser(text) : text
        return typeof parsed === 'string' ? parsed : text
      }
      const htmlSanitizer = options?.sanitizer ? options.sanitizer : (html: string) => html

      return prepareRichTextForDisplay(rawText, undefined, {
        markdownParser: mdParser,
        htmlSanitizer,
        assetReplacer: (key) => {
          const media = sessionAssets[key] as any
          if (!media) return ''
          const url = media.value
          if (media.type === 'image') return `<img src="${url}" alt="${media.altText || ''}" class="oqse-asset-img" />`
          if (media.type === 'audio') return `<audio src="${url}" controls class="oqse-asset-audio"></audio>`
          if (media.type === 'video') return `<video src="${url}" controls class="oqse-asset-video"></video>`
          return ''
        },
        blankReplacer: (key) => `<input type="text" data-blank="${key}" class="oqse-blank" />`,
      })
    },
    start,
  }
}
