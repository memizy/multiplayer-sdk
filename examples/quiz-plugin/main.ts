import { createMultiplayerPlugin } from '../../src/sdk'
import type { InitContext, MultiPlayer } from '../../src/types'

const app = document.getElementById('app') as HTMLDivElement
const plugin = createMultiplayerPlugin<any>()

let hostContext: InitContext | null = null
let hostPlayers: MultiPlayer[] = []

const render = (html: string) => {
  app.innerHTML = html
}

const renderHostPanel = () => {
  const players = hostPlayers
    .map((player) => `<li>${player.name} (score: ${player.score})</li>`)
    .join('')
  const settings = hostContext?.settings ?? {}
  const settingsText = Object.entries(settings)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')

  render(`
    <section class="card">
      <h1>Host View</h1>
      <p>PIN: ${hostContext?.pin ?? '-'}</p>
      <p>Settings received: ${settingsText || 'none'}</p>
      <div class="row">
        <button id="start-quiz" type="button">Start Quiz</button>
      </div>
      <h2>Players</h2>
      <ul>${players || '<li>No players yet</li>'}</ul>
    </section>
  `)

  const startButton = document.getElementById('start-quiz') as HTMLButtonElement
  startButton.addEventListener('click', () => {
    if (!hostContext?.items?.length) {
      window.alert('No quiz items in context.')
      return
    }

    plugin.host.broadcastState({
      phase: 'question',
      currentItem: hostContext.items[0],
    })
  })
}

const renderPlayerWaiting = () => {
  render(`
    <section class="card">
      <h1>Player View</h1>
      <p>Waiting for host...</p>
    </section>
  `)
}

plugin.defineHost({
  onInit(context) {
    hostContext = context
    hostPlayers = []
    renderHostPanel()
  },

  onPlayerJoined(player) {
    hostPlayers.push(player)
    renderHostPanel()
  },

  onPlayerAction(action, playerId) {
    if (action.type !== 'answer') {
      return
    }

    window.alert(`Host received answer from ${playerId ?? 'unknown player'}.`)

    plugin.host.broadcastState({
      phase: 'reveal',
      result: {
        playerId,
        answer: action.data,
      },
    })
  },
})

plugin.definePlayer({
  onInit() {
    renderPlayerWaiting()
  },

  onStateUpdate(state) {
    if (state.phase === 'question') {
      const prompt = state.currentItem?.prompt ?? 'Question'
      const options: string[] = state.currentItem?.options ?? ['Option A', 'Option B']

      render(`
        <section class="card">
          <h1>Player View</h1>
          <p>${prompt}</p>
          <div class="row">
            ${options
              .map(
                (option, index) =>
                  `<button class="answer-btn" data-index="${index + 1}" type="button">${option}</button>`,
              )
              .join('')}
          </div>
        </section>
      `)

      document.querySelectorAll<HTMLButtonElement>('.answer-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const optionIndex = Number(button.dataset.index ?? '1')
          plugin.player.sendAction('answer', { optionIndex })
        })
      })

      return
    }

    if (state.phase === 'reveal') {
      render(`
        <section class="card">
          <h1>Player View</h1>
          <p>Reveal phase.</p>
          <pre>${JSON.stringify(state.result, null, 2)}</pre>
        </section>
      `)
    }
  },
})

plugin.start()