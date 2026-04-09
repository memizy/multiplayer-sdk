type AnyMessage = {
  type: string
  payload?: any
  role?: 'host' | 'player'
  context?: any
}

const hostFrame = document.getElementById('host-frame') as HTMLIFrameElement
const playerFrame = document.getElementById('player-frame') as HTMLIFrameElement
const initGameButton = document.getElementById('init-game') as HTMLButtonElement
const simulateJoinButton = document.getElementById('simulate-join') as HTMLButtonElement

const getHostWindow = () => hostFrame.contentWindow
const getPlayerWindow = () => playerFrame.contentWindow

window.addEventListener('message', (event: MessageEvent<AnyMessage>) => {
  const message = event.data
  const hostWindow = getHostWindow()
  const playerWindow = getPlayerWindow()

  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    return
  }

  if (event.source === hostWindow && message.type === 'MULTI_BROADCAST') {
    playerWindow?.postMessage({ type: 'STATE_UPDATE', payload: message.payload }, '*')
    return
  }

  if (event.source === playerWindow && message.type === 'MULTI_ACTION') {
    hostWindow?.postMessage(message, '*')
  }
})

const hostInitContext = {
  pin: '123456',
  items: [
    {
      id: 'q1',
      prompt: 'What is 2 + 2?',
      options: ['3', '4', '5'],
      answerIndex: 1,
    },
  ],
  assets: {},
}

const playerInitContext = {
  pin: '123456',
  items: [],
  assets: {},
  playerName: 'Student',
  myPlayerName: 'Student',
  myPlayerId: 'player-1',
}

initGameButton.addEventListener('click', () => {
  const hostWindow = getHostWindow()
  const playerWindow = getPlayerWindow()

  hostWindow?.postMessage(
    {
      type: 'MULTI_INIT',
      role: 'host',
      context: hostInitContext,
    },
    '*',
  )

  playerWindow?.postMessage(
    {
      type: 'MULTI_INIT',
      role: 'player',
      context: playerInitContext,
    },
    '*',
  )
})

simulateJoinButton.addEventListener('click', () => {
  getHostWindow()?.postMessage(
    {
      type: 'PLAYER_JOINED',
      payload: {
        id: 'player-1',
        name: 'Student',
        score: 0,
        joinedAt: Date.now(),
      },
    },
    '*',
  )
})