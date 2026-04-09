import type { OQSEItem } from '@memizy/oqse'
import type { InitContext, MultiPlayer } from './types'

type SandboxMount = HTMLElement | string

export interface LocalSandboxOptions {
  mount: SandboxMount
  pluginUrl: string
  defaultSetUrl?: string
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
const DEFAULT_SET_URL = 'https://cdn.jsdelivr.net/gh/memizy/set-ceska-historie-zabavne@main/data.oqse.json'

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

.memizy-sandbox-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.memizy-sandbox-modal-overlay[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}

.memizy-sandbox-modal {
  background: #fff;
  border-radius: 20px;
  width: min(800px, calc(100% - 32px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  transform: translateY(16px) scale(0.98);
  transition: transform 0.2s ease;
  display: flex;
  flex-direction: column;
}

.memizy-sandbox-modal-overlay[data-open="true"] .memizy-sandbox-modal {
  transform: translateY(0) scale(1);
}

.memizy-sandbox-modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(33, 37, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.memizy-sandbox-modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-text-dark);
}

.memizy-sandbox-modal-close {
  background: transparent;
  border: 0;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--color-text-gray);
  cursor: pointer;
  padding: 4px;
}

.memizy-sandbox-modal-body {
  padding: 20px;
}

.memizy-sandbox-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.memizy-sandbox-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.memizy-sandbox-panel {
  background: #fff;
  border-radius: 20px;
  box-shadow: var(--shadow-soft);
  border: 1px solid rgba(33, 37, 41, 0.08);
  padding: 18px;
}

.memizy-sandbox-panel-header {
  margin: 0 0 10px;
  font-size: 0.96rem;
  font-weight: 900;
  color: var(--color-text-dark);
}

.memizy-sandbox-field {
  width: 100%;
  min-height: 86px;
  resize: vertical;
  border: 1px solid rgba(33, 37, 41, 0.14);
  border-radius: 14px;
  padding: 12px 14px;
  font-family: var(--font-sans);
  font-size: 0.92rem;
  color: var(--color-text-dark);
  background: #fff;
}

.memizy-sandbox-field:focus {
  outline: 2px solid rgba(30, 136, 229, 0.25);
  border-color: var(--color-primary-blue);
}

.memizy-sandbox-field-tall {
  min-height: 126px;
}

.memizy-sandbox-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.memizy-sandbox-button-compact {
  min-height: 40px;
  padding: 9px 14px;
  font-size: 0.9rem;
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

  .memizy-sandbox-controls {
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

function extractItemsFromSet(data: unknown): OQSEItem[] {
  if (Array.isArray(data)) {
    return data as OQSEItem[]
  }

  if (!data || typeof data !== 'object') {
    return []
  }

  const maybeData = data as {
    items?: OQSEItem[]
    data?: { items?: OQSEItem[] }
    set?: { items?: OQSEItem[] }
  }

  if (Array.isArray(maybeData.items)) {
    return maybeData.items
  }

  if (Array.isArray(maybeData.data?.items)) {
    return maybeData.data.items
  }

  if (Array.isArray(maybeData.set?.items)) {
    return maybeData.set.items
  }

  return []
}

async function loadItemsFromSource(source: string): Promise<OQSEItem[]> {
  const trimmed = source.trim()
  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return extractItemsFromSet(JSON.parse(trimmed))
  }

  const response = await fetch(trimmed)
  if (!response.ok) {
    throw new Error(`Failed to load set: ${response.status} ${response.statusText}`)
  }

  return extractItemsFromSet(await response.json())
}

function buildAiInstructionsPrompt(topic: string, notes: string) {
  return [
    'Create an OQSE study set in JSON.',
    `Topic: ${topic || 'Fill in a topic'}`,
    notes ? `Instructions: ${notes}` : 'Instructions: Create clear, balanced, classroom-safe questions.',
    '',
    'Use this structure:',
    '{',
    '  "items": [',
    '    {',
    '      "type": "mcq-single",',
    '      "question": "...",',
    '      "options": ["...", "..."],',
    '      "correctIndex": 0',
    '    }',
    '  ]',
    '}',
    '',
    'Guidelines:',
    '- Use concise questions and clear answers.',
    '- Prefer 4 options for MCQ unless the topic suggests otherwise.',
    '- Keep language natural and educational.',
    '- Return valid JSON only.',
  ].join('\n')
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
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-primary memizy-sandbox-button-compact" data-action="init">Initialize session</button>
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary memizy-sandbox-button-compact" data-action="join">Add player</button>
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary memizy-sandbox-button-compact" data-action="leave">Remove player</button>
          <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary memizy-sandbox-button-compact" data-action="open-modal">Settings & AI</button>
        </div>
      </div>

      <div class="memizy-sandbox-modal-overlay" data-sandbox-modal>
        <div class="memizy-sandbox-modal">
          <div class="memizy-sandbox-modal-header">
            <h2 class="memizy-sandbox-modal-title">Settings & AI Generator</h2>
            <button type="button" class="memizy-sandbox-modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="memizy-sandbox-modal-body">
            <div class="memizy-sandbox-controls" style="margin-top: 0;">
              <section class="memizy-sandbox-panel">
                <p class="memizy-sandbox-panel-header">Set source</p>
                <textarea class="memizy-sandbox-field" data-set-source spellcheck="false"></textarea>
                <div class="memizy-sandbox-panel-actions">
                  <button type="button" class="memizy-sandbox-button memizy-sandbox-button-primary memizy-sandbox-button-compact" data-action="load-set">Load set</button>
                  <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary memizy-sandbox-button-compact" data-action="default-set">Use default set</button>
                </div>
              </section>

              <section class="memizy-sandbox-panel">
                <p class="memizy-sandbox-panel-header">AI instructions</p>
                <input class="memizy-sandbox-field" data-ai-topic type="text" placeholder="Topic, e.g. Czech history" style="margin-bottom: 10px;" />
                <textarea class="memizy-sandbox-field memizy-sandbox-field-tall" data-ai-notes spellcheck="false" placeholder="Extra instructions for the AI" style="margin-bottom: 10px;"></textarea>
                <textarea class="memizy-sandbox-field memizy-sandbox-field-tall" data-ai-output spellcheck="false" readonly placeholder="AI prompt will appear here"></textarea>
                <div class="memizy-sandbox-panel-actions">
                  <button type="button" class="memizy-sandbox-button memizy-sandbox-button-primary memizy-sandbox-button-compact" data-action="build-ai">AI instructions</button>
                  <button type="button" class="memizy-sandbox-button memizy-sandbox-button-secondary memizy-sandbox-button-compact" data-action="copy-ai">Copy prompt</button>
                </div>
              </section>
            </div>
          </div>
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
  const openModalButton = root.querySelector<HTMLButtonElement>('[data-action="open-modal"]')
  const closeModalButton = root.querySelector<HTMLButtonElement>('[data-action="close-modal"]')
  const modalOverlay = root.querySelector<HTMLDivElement>('[data-sandbox-modal]')
  const loadSetButton = root.querySelector<HTMLButtonElement>('[data-action="load-set"]')
  const defaultSetButton = root.querySelector<HTMLButtonElement>('[data-action="default-set"]')
  const buildAiButton = root.querySelector<HTMLButtonElement>('[data-action="build-ai"]')
  const copyAiButton = root.querySelector<HTMLButtonElement>('[data-action="copy-ai"]')
  const setSourceField = root.querySelector<HTMLTextAreaElement>('[data-set-source]')
  const aiTopicField = root.querySelector<HTMLInputElement>('[data-ai-topic]')
  const aiNotesField = root.querySelector<HTMLTextAreaElement>('[data-ai-notes]')
  const aiOutputField = root.querySelector<HTMLTextAreaElement>('[data-ai-output]')

  if (!hostFrame || !playerFrame || !initButton || !joinButton || !leaveButton || !openModalButton || !closeModalButton || !modalOverlay || !loadSetButton || !defaultSetButton || !buildAiButton || !copyAiButton || !setSourceField || !aiTopicField || !aiNotesField || !aiOutputField) {
    throw new Error('Failed to construct local sandbox UI.')
  }

  const defaultSetUrl = options.defaultSetUrl ?? DEFAULT_SET_URL
  setSourceField.value = defaultSetUrl

  let hostContext = normalizeHostContext(options.hostContext)
  let playerContext = normalizePlayerContext(options.playerContext)
  const players: MultiPlayer[] = hostContext.players?.length ? [...hostContext.players] : []
  let playerCounter = players.length
  let hostLoaded = false
  let playerLoaded = false
  let hostReady = false
  let playerReady = false
  let initialized = false
  let setReady = false
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

  const maybeStartAutomatically = () => {
    if (options.autoInit === false || initialized || !setReady || !hostLoaded || !playerLoaded || !hostReady || !playerReady) {
      return
    }

    init()
  }

  const setItemsForSandbox = (items: OQSEItem[]) => {
    hostContext = normalizeHostContext({ ...hostContext, items, players })
    playerContext = normalizePlayerContext({ ...playerContext, items, players })
    setReady = true

    if (initialized) {
      sendHostInit()
      sendPlayerInit()
      return
    }

    maybeStartAutomatically()
  }

  const applySetSource = async (source: string) => {
    const items = await loadItemsFromSource(source)
    setItemsForSandbox(items)
  }

  const refreshAiPrompt = () => {
    aiOutputField.value = buildAiInstructionsPrompt(aiTopicField.value.trim(), aiNotesField.value.trim())
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

  const loadSetAndRefresh = async (source: string) => {
    try {
      await applySetSource(source)
    } catch (error) {
      console.error('[memizy-sandbox] failed to load set', error)
      aiOutputField.value = `Failed to load set from source:\n${String(error)}`
    }
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
      maybeStartAutomatically()
      return
    }

    if (event.source === playerWindow && message.type === 'PLUGIN_READY') {
      playerReady = true
      clearFallbackTimer(playerFallbackTimer)
      playerFallbackTimer = null
      maybeStartAutomatically()
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
        if (!hostReady && setReady) {
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
        if (!playerReady && setReady) {
          sendPlayerInit()
        }
      }, 300)
    }
  })

  initButton.addEventListener('click', init)
  joinButton.addEventListener('click', () => simulatePlayerJoin())
  leaveButton.addEventListener('click', () => simulatePlayerLeave())
  
  openModalButton.addEventListener('click', () => {
    modalOverlay.setAttribute('data-open', 'true')
  })
  
  closeModalButton.addEventListener('click', () => {
    modalOverlay.removeAttribute('data-open')
  })
  
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.removeAttribute('data-open')
    }
  })

  loadSetButton.addEventListener('click', () => {
    void loadSetAndRefresh(setSourceField.value)
  })
  defaultSetButton.addEventListener('click', () => {
    setSourceField.value = defaultSetUrl
    void loadSetAndRefresh(defaultSetUrl)
  })
  buildAiButton.addEventListener('click', refreshAiPrompt)
  copyAiButton.addEventListener('click', async () => {
    if (!aiOutputField.value.trim()) {
      refreshAiPrompt()
    }

    await navigator.clipboard.writeText(aiOutputField.value)
  })
  window.addEventListener('message', onMessage)

  if (options.autoInit !== false) {
    hostFrame.addEventListener('load', maybeStartAutomatically)
    playerFrame.addEventListener('load', maybeStartAutomatically)
  }

  void loadSetAndRefresh(defaultSetUrl)

  return {
    init,
    destroy,
    simulatePlayerJoin,
    simulatePlayerLeave,
    sendHostInit,
    sendPlayerInit,
  }
}
