import type { InitContext, MultiPlayer } from './types'

type SandboxMount = HTMLElement | string

export interface LocalSandboxOptions {
  mount: SandboxMount
  pluginUrl: string
  hostContext?: Partial<InitContext>
  playerContext?: Partial<InitContext>
  title?: string
  hostLabel?: string
  playerLabel?: string
  autoInit?: boolean
}

export interface LocalSandboxController {
  init: () => void
  destroy: () => void
  simulatePlayerJoin: (player?: Partial<MultiPlayer>) => void
  simulatePlayerLeave: (playerId?: string) => void
  sendHostInit: (context?: Partial<InitContext>) => void
  sendPlayerInit: (context?: Partial<InitContext>) => void
}

const SANDBOX_STYLE_ID = 'memizy-local-sandbox-styles'

function injectSandboxStyles() {
  if (document.getElementById(SANDBOX_STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = SANDBOX_STYLE_ID
  style.textContent = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap");

:root {
  --color-primary-blue: #1E88E5;
  --color-primary-blue-dark: #1565C0;
  --color-accent-orange: #FF6F00;
  --color-accent-orange-light: #FF8F00;
  --color-off-white: #F8F9FA;
  --color-text-dark: #212529;
  --color-text-gray: #6C757D;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --shadow-soft: 0 4px 24px rgba(0, 0, 0, 0.08);
  --shadow-soft-hover: 0 8px 32px rgba(0, 0, 0, 0.12);
}

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text-dark);
  background: #fff;
}

button:hover {
  cursor: pointer;
}

.memizy-sandbox-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, var(--color-off-white) 100%);
}

.memizy-sandbox-shell {
  width: min(1440px, calc(100% - 24px));
  margin: 0 auto;
  padding: 16px 0 24px;
}

.memizy-sandbox-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-radius: 20px;
  background: #fff;
  box-shadow: var(--shadow-soft);
  border: 1px solid rgba(33, 37, 41, 0.08);
}

.memizy-sandbox-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.memizy-sandbox-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-primary-blue-dark);
}

.memizy-sandbox-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 900;
  color: var(--color-text-dark);
}

.memizy-sandbox-subtitle {
  margin: 0;
  font-size: 0.92rem;
  color: var(--color-text-gray);
}

.memizy-sandbox-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.memizy-sandbox-button {
  min-height: 44px;
  padding: 10px 16px;
  border: 0;
  border-radius: 14px;
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 800;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
  box-shadow: var(--shadow-soft);
}

.memizy-sandbox-button:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-soft-hover);
}

.memizy-sandbox-button-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--color-accent-orange) 0%, var(--color-accent-orange-light) 100%);
}

.memizy-sandbox-button-secondary {
  color: var(--color-primary-blue-dark);
  background: #fff;
  border: 1px solid rgba(30, 136, 229, 0.18);
}

.memizy-sandbox-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.memizy-sandbox-pane {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 128px);
  border-radius: 20px;
  overflow: hidden;
  background: #fff;
  box-shadow: var(--shadow-soft);
  border: 1px solid rgba(33, 37, 41, 0.08);
}

.memizy-sandbox-pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(33, 37, 41, 0.08);
  background: linear-gradient(135deg, rgba(30, 136, 229, 0.06), rgba(255, 111, 0, 0.06));
}

.memizy-sandbox-pane-label {
  font-size: 0.95rem;
  font-weight: 900;
  color: var(--color-text-dark);
}

.memizy-sandbox-pane-meta {
  font-size: 0.85rem;
  color: var(--color-text-gray);
}

.memizy-sandbox-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  flex: 1;
  background: #fff;
}

.memizy-sandbox-empty {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--color-text-gray);
}

@media (max-width: 960px) {
  .memizy-sandbox-grid {
    grid-template-columns: 1fr;
  }

  .memizy-sandbox-pane {
    min-height: 520px;
  }
}
  `

  document.head.appendChild(style)
}

function resolveMount(mount: SandboxMount): HTMLElement | null {
  if (typeof mount !== 'string') {
    return mount
  }

  return document.querySelector<HTMLElement>(mount)
}

function createPlayerFromContext(context: Partial<MultiPlayer> & { id?: string }): MultiPlayer {
  return {
    id: context.id ?? `player-${Math.random().toString(16).slice(2, 8)}`,
    name: context.name ?? 'Player 1',
    score: context.score ?? 0,
    joinedAt: context.joinedAt ?? Date.now(),
  }
}

function normalizeHostContext(context?: Partial<InitContext>): InitContext {
  return {
    pin: context?.pin ?? '123456',
    items: context?.items ?? [],
    assets: context?.assets ?? {},
    settings: context?.settings ?? {},
    players: context?.players ?? [],
    myPlayerId: context?.myPlayerId,
    myPlayerName: context?.myPlayerName,
  }
}

function normalizePlayerContext(context?: Partial<InitContext>): InitContext {
  return {
    pin: context?.pin ?? '123456',
    items: context?.items ?? [],
    assets: context?.assets ?? {},
    settings: context?.settings ?? {},
    players: context?.players ?? [],
    myPlayerId: context?.myPlayerId ?? 'player-1',
    myPlayerName: context?.myPlayerName ?? 'Player 1',
  }
}

export function createLocalSandbox(options: LocalSandboxOptions): LocalSandboxController {
  const mount = resolveMount(options.mount)
  if (!mount) {
    throw new Error('Local sandbox mount element was not found.')
  }

  injectSandboxStyles()

  const root = document.createElement('div')
  root.className = 'memizy-sandbox-root'
  root.innerHTML = `
    <div class="memizy-sandbox-shell">
      <div class="memizy-sandbox-toolbar">
        <div class="memizy-sandbox-brand">
          <p class="memizy-sandbox-kicker">Memizy local mode</p>
          <h1 class="memizy-sandbox-title">${options.title ?? 'Multiplayer Sandbox'}</h1>
          <p class="memizy-sandbox-subtitle">Host and player iframes connected through the SDK bridge.</p>
        </div>
        <div class="memizy-sandbox-actions">
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-primary" data-action="init">Initialize session</button>
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary" data-action="join">Add player</button>
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary" data-action="leave">Remove player</button>
        </div>
      </div>

      <div class="memizy-sandbox-grid">
        <section class="memizy-sandbox-pane">
          <div class="memizy-sandbox-pane-header">
            <div>
              <div class="memizy-sandbox-pane-label">${options.hostLabel ?? 'Host'}</div>
              <div class="memizy-sandbox-pane-meta">Receives player events and broadcasts state.</div>
            </div>
          </div>
          <iframe class="memizy-sandbox-frame" data-sandbox-host-frame title="${options.hostLabel ?? 'Host'}" src="${options.pluginUrl}"></iframe>
        </section>

        <section class="memizy-sandbox-pane">
          <div class="memizy-sandbox-pane-header">
            <div>
              <div class="memizy-sandbox-pane-label">${options.playerLabel ?? 'Player'}</div>
              <div class="memizy-sandbox-pane-meta">Sends actions and reacts to state updates.</div>
            </div>
          </div>
          <iframe class="memizy-sandbox-frame" data-sandbox-player-frame title="${options.playerLabel ?? 'Player'}" src="${options.pluginUrl}"></iframe>
        </section>
      </div>
    </div>
  `
  mount.replaceChildren(root)

  const hostFrame = root.querySelector<HTMLIFrameElement>('[data-sandbox-host-frame]')
  const playerFrame = root.querySelector<HTMLIFrameElement>('[data-sandbox-player-frame]')
  const initButton = root.querySelector<HTMLButtonElement>('[data-action="init"]')
  const joinButton = root.querySelector<HTMLButtonElement>('[data-action="join"]')
  const leaveButton = root.querySelector<HTMLButtonElement>('[data-action="leave"]')

  if (!hostFrame || !playerFrame || !initButton || !joinButton || !leaveButton) {
    throw new Error('Failed to construct local sandbox UI.')
  }

  let hostContext = normalizeHostContext(options.hostContext)
  let playerContext = normalizePlayerContext(options.playerContext)
  const players: MultiPlayer[] = hostContext.players?.length ? [...hostContext.players] : []
  let playerCounter = players.length
  let hostLoaded = false
  let playerLoaded = false
  let hostReady = false
  let playerReady = false
  let initialized = false
  let hostFallbackTimer: number | null = null
  let playerFallbackTimer: number | null = null

  const sendToFrame = (frame: HTMLIFrameElement, message: Record<string, unknown>) => {
    frame.contentWindow?.postMessage(message, '*')
  }

  const clearFallbackTimer = (timerId: number | null) => {
    if (timerId !== null) {
      window.clearTimeout(timerId)
    }
  }

  const sendInitToFrame = (
    frame: HTMLIFrameElement,
    role: 'host' | 'player',
    context: InitContext,
  ) => {
    sendToFrame(frame, {
      type: 'INIT_SESSION',
      role,
      context,
    })

    sendToFrame(frame, {
      type: 'MULTI_INIT',
      role,
      context,
      payload: context,
    })
  }

  const broadcastStateToPlayer = (state: unknown) => {
    sendToFrame(playerFrame, {
      type: 'STATE_UPDATE',
      payload: { state },
    })
  }

  const sendHostInit = (context?: Partial<InitContext>) => {
    hostContext = normalizeHostContext({ ...hostContext, ...context, players })
    sendInitToFrame(hostFrame, 'host', hostContext)
  }

  const sendPlayerInit = (context?: Partial<InitContext>) => {
    playerContext = normalizePlayerContext({ ...playerContext, ...context, players })
    sendInitToFrame(playerFrame, 'player', playerContext)
  }

  const init = () => {
    initialized = true
    sendHostInit()
    sendPlayerInit()
  }

  const simulatePlayerJoin = (player?: Partial<MultiPlayer>) => {
    const joinedPlayer = createPlayerFromContext({
      ...player,
      id: player?.id ?? `player-${playerCounter + 1}`,
      name: player?.name ?? `Player ${playerCounter + 1}`,
    })

    playerCounter += 1
    players.push(joinedPlayer)
    hostContext = normalizeHostContext({ ...hostContext, players })
    playerContext = normalizePlayerContext({ ...playerContext, players })

    sendToFrame(hostFrame, {
      type: 'PLAYER_JOINED',
      payload: joinedPlayer,
    })

    if (initialized) {
      sendHostInit()
      sendPlayerInit()
    }
  }

  const simulatePlayerLeave = (playerId?: string) => {
    if (!playerId) {
      const removed = players.pop()
      if (!removed) {
        return
      }
      playerId = removed.id
    } else {
      const index = players.findIndex((player) => player.id === playerId)
      if (index >= 0) {
        players.splice(index, 1)
      }
    }

    hostContext = normalizeHostContext({ ...hostContext, players })
    playerContext = normalizePlayerContext({ ...playerContext, players })

    sendToFrame(hostFrame, {
      type: 'PLAYER_LEFT',
      payload: { playerId },
    })

    if (initialized) {
      sendHostInit()
      sendPlayerInit()
    }
  }

  const onMessage = (event: MessageEvent) => {
    const hostWindow = hostFrame.contentWindow
    const playerWindow = playerFrame.contentWindow
    const message = event.data as { type?: string; payload?: unknown }

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return
    }

    if (event.source === hostWindow && message.type === 'MULTI_BROADCAST') {
      broadcastStateToPlayer(message.payload)
      return
    }

    if (event.source === hostWindow && message.type === 'PLUGIN_READY') {
      hostReady = true
      clearFallbackTimer(hostFallbackTimer)
      hostFallbackTimer = null
      if (initialized || options.autoInit !== false) {
        sendHostInit()
      }
      return
    }

    if (event.source === playerWindow && message.type === 'PLUGIN_READY') {
      playerReady = true
      clearFallbackTimer(playerFallbackTimer)
      playerFallbackTimer = null
      if (initialized || options.autoInit !== false) {
        sendPlayerInit()
      }
      return
    }

    if (event.source === playerWindow && message.type === 'MULTI_ACTION') {
      sendToFrame(hostFrame, {
        type: 'MULTI_ACTION',
        payload: message.payload,
      })
    }
  }

  const destroy = () => {
    window.removeEventListener('message', onMessage)
    clearFallbackTimer(hostFallbackTimer)
    clearFallbackTimer(playerFallbackTimer)
    root.remove()
  }

  hostFrame.addEventListener('load', () => {
    hostLoaded = true
    if (initialized) {
      sendHostInit()
      return
    }

    if (options.autoInit !== false) {
      clearFallbackTimer(hostFallbackTimer)
      hostFallbackTimer = window.setTimeout(() => {
        if (!hostReady) {
          sendHostInit()
        }
      }, 300)
    }
  })

  playerFrame.addEventListener('load', () => {
    playerLoaded = true
    if (initialized) {
      sendPlayerInit()
      return
    }

    if (options.autoInit !== false) {
      clearFallbackTimer(playerFallbackTimer)
      playerFallbackTimer = window.setTimeout(() => {
        if (!playerReady) {
          sendPlayerInit()
        }
      }, 300)
    }
  })

  initButton.addEventListener('click', init)
  joinButton.addEventListener('click', () => simulatePlayerJoin())
  leaveButton.addEventListener('click', () => simulatePlayerLeave())
  window.addEventListener('message', onMessage)

  if (options.autoInit !== false) {
    const maybeInit = () => {
      if (hostLoaded && playerLoaded && hostReady && playerReady && !initialized) {
        init()
      }
    }

    hostFrame.addEventListener('load', maybeInit)
    playerFrame.addEventListener('load', maybeInit)
  }

  return {
    init,
    destroy,
    simulatePlayerJoin,
    simulatePlayerLeave,
    sendHostInit,
    sendPlayerInit,
  }
}
