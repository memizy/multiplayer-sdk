/**
 * @memizy/multiplayer-sdk — Minimal Example
 *
 * Mirrors the shape of `plugin-sdk/example/minimal.ts`: a *real* plugin
 * that boots via the SDK's built-in landing page and a single
 * `sdk.connect()` call. No custom sandbox harness, no multi-SDK
 * orchestration visible in the UI.
 *
 * The only thing unique to multiplayer is that a single participant
 * can't demonstrate a game by itself, so before the user's SDK
 * connects we spin up a couple of "shadow" SDKs (bots) pointed at the
 * same `MemoryMockHub`. The *plugin code* below is exactly what you'd
 * ship to production — drop it into a real Memizy host and it works
 * identically (the real host just makes the bots real people).
 */

import {
  MemizyMultiplayerSDK,
  MemoryMockHub,
  loadManifestFromDataIsland,
  renderLandingPageIfNeeded,
  isMCQSingle,
  isTrueFalse,
  isShortAnswer,
  type MultiPlayer,
  type OQSEItem,
  type PluginRole,
  type GamePhase,
  type InitSessionPayload,
  type PlayerAction,
  type SessionResult,
} from '@memizy/multiplayer-sdk';

import { SAMPLE_ITEMS } from './sample-set';

// ── Domain model ────────────────────────────────────────────────────────────

interface QuizState {
  currentIndex: number;
  currentItemId: string | null;
  scores: Record<string, number>;
  answered: Record<string, string>;
  phase: 'question' | 'reveal' | 'done';
}

/** Payload shape for `PlayerAction<AnswerData>` (type === 'answer'). */
interface AnswerData {
  itemId: string;
  choice: string;
}

const POINTS_PER_CORRECT = 10;
const REVEAL_MS = 1400;
const BOT_ANSWER_MIN_MS = 800;
const BOT_ANSWER_MAX_MS = 1800;

// ── Entry point ─────────────────────────────────────────────────────────────

const manifest = loadManifestFromDataIsland();

const rendered = renderLandingPageIfNeeded(manifest, {
  docsUrl: 'https://github.com/memizy/multiplayer-sdk',
  onTryHost: () => void bootstrap('host'),
  onTryPlayer: () => void bootstrap('player'),
});

if (!rendered) {
  // Inside a real Memizy iframe the host dictates the role; the
  // landing page is skipped. We default to 'host' for dev embeds.
  void bootstrap('host');
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap(role: PluginRole): Promise<void> {
  const app = mountShell(role);

  const hub = new MemoryMockHub();

  const HUMAN: MultiPlayer = { id: 'you', name: 'You', joinedAt: Date.now() };
  const BOT_ALICE: MultiPlayer = { id: 'bot-alice', name: 'Alice (bot)', joinedAt: Date.now() };
  const BOT_BOB: MultiPlayer = { id: 'bot-bob', name: 'Bob (bot)', joinedAt: Date.now() };

  const roster: MultiPlayer[] = role === 'host' ? [BOT_ALICE, BOT_BOB] : [HUMAN, BOT_ALICE];

  if (role === 'host') {
    await spawnBotPlayer(hub, BOT_ALICE, app.log);
    await spawnBotPlayer(hub, BOT_BOB, app.log);
  } else {
    await spawnBotHost(hub, [HUMAN, BOT_ALICE], app.log);
    await spawnBotPlayer(hub, BOT_ALICE, app.log);
  }

  const sdk = new MemizyMultiplayerSDK<QuizState>({
    id: manifest?.id ?? 'com.memizy.example.multiplayer-minimal',
    version: '1.0.0',
  });

  installPluginLogic(sdk, app, role, HUMAN);

  try {
    await sdk.connect({
      mode: 'standalone',
      mockHub: hub,
      standalone: {
        role,
        items: SAMPLE_ITEMS,
        players: roster,
        self: role === 'player' ? HUMAN : undefined,
        supportsLateJoin: true,
        supportsReconnect: true,
        supportsTeams: false,
        capacity: { min: 2, max: 8, recommended: 3 },
        settings: { rounds: SAMPLE_ITEMS.length },
      },
    });
    app.log('sys', `connect() resolved — role=${role}`);
  } catch (err) {
    app.log('sys', `connect() failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Plugin UI shell ─────────────────────────────────────────────────────────

type LogKind = 'sys' | 'host' | 'player' | 'bot';

interface Shell {
  root: HTMLElement;
  phasePill: HTMLSpanElement;
  indexLabel: HTMLSpanElement;
  playersLabel: HTMLSpanElement;
  body: HTMLDivElement;
  scoreboard: HTMLDivElement;
  actions: HTMLDivElement;
  logPane: HTMLDivElement;
  log: (kind: LogKind, msg: string) => void;
}

function mountShell(role: PluginRole): Shell {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app mount');

  app.innerHTML = `
    <main class="page">
      <header class="page-header">
        <div class="logo" aria-hidden="true">✨</div>
        <div>
          <h1>Multiplayer · <span>Minimal Example</span></h1>
          <p class="lead">
            Zero custom harness — one <code>new MemizyMultiplayerSDK()</code>,
            one <code>await sdk.connect()</code>. The bot peers on a shared
            <code>MemoryMockHub</code> make the game playable in a single tab.
          </p>
          <div class="badges">
            <span class="badge">v0.4.0</span>
            <span class="badge badge-blue">Standalone</span>
            <span class="badge badge-green">Role: ${role}</span>
          </div>
        </div>
      </header>

      <section class="card">
        <h2>Session</h2>

        <div class="callout" role="note">
          <div class="callout-icon" aria-hidden="true">i</div>
          <div>
            You chose <strong>${role === 'host' ? '🧪 Try as host' : '👤 Try as player'}</strong>.
            ${role === 'host'
              ? 'The game loop runs in <strong>your</strong> plugin. Two bot players auto-ready and auto-answer.'
              : 'A bot host drives the game. Answer questions below — the bot player joins you as a second contestant.'}
          </div>
        </div>

        <div class="kv"><span class="k">Phase</span><span class="v"><span class="phase-pill phase-settings" id="mini-phase">host-settings</span></span></div>
        <div class="kv"><span class="k">Question</span><span class="v" id="mini-index">—</span></div>
        <div class="kv"><span class="k">Players online</span><span class="v" id="mini-players">0</span></div>
      </section>

      <section class="card">
        <h2>${role === 'host' ? 'Host stage' : 'Your turn'}</h2>
        <div id="mini-body">
          <p>Connecting to the mock host…</p>
        </div>
        <div class="actions" id="mini-actions"></div>
      </section>

      <section class="card">
        <h2>Scoreboard</h2>
        <div class="scoreboard" id="mini-scoreboard">
          <p class="lead">Nothing to score yet.</p>
        </div>
      </section>

      <section class="card">
        <h2>Protocol log</h2>
        <div class="log-pane" id="mini-log" role="log" aria-live="polite"></div>
      </section>

      <a class="footer-link" href="./index.html">← Back to the full sandbox</a>
    </main>
  `;

  const logPane = app.querySelector<HTMLDivElement>('#mini-log')!;

  const log = (kind: LogKind, msg: string): void => {
    const ts = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML =
      `<span class="log-ts">${ts}</span>` +
      `<span class="log-tag log-tag-${kind}">${kind}</span>` +
      `<span class="log-msg"></span>`;
    line.querySelector('.log-msg')!.textContent = msg;
    logPane.appendChild(line);
    logPane.scrollTop = logPane.scrollHeight;
  };

  return {
    root: app,
    phasePill: app.querySelector<HTMLSpanElement>('#mini-phase')!,
    indexLabel: app.querySelector<HTMLSpanElement>('#mini-index')!,
    playersLabel: app.querySelector<HTMLSpanElement>('#mini-players')!,
    body: app.querySelector<HTMLDivElement>('#mini-body')!,
    scoreboard: app.querySelector<HTMLDivElement>('#mini-scoreboard')!,
    actions: app.querySelector<HTMLDivElement>('#mini-actions')!,
    logPane,
    log,
  };
}

// ── The plugin itself ───────────────────────────────────────────────────────

function installPluginLogic(
  sdk: MemizyMultiplayerSDK<QuizState>,
  shell: Shell,
  role: PluginRole,
  human: MultiPlayer,
): void {
  const items = SAMPLE_ITEMS;
  let roster: MultiPlayer[] = [];
  const playersReady = new Set<string>();

  sdk.onPhaseChange((phase: GamePhase) => {
    applyPhasePill(shell.phasePill, phase);
    shell.log(role, `onPhaseChange → ${phase}`);
  });

  sdk.onInit(async (init: InitSessionPayload) => {
    roster = [...init.players];
    renderPlayersLabel(shell, roster);
    applyPhasePill(shell.phasePill, init.phase);
    shell.log(role, `onInit — role=${init.role}, phase=${init.phase}, players=${roster.length}`);

    if (init.role === 'host') {
      renderHostSettings(sdk, shell);
      await sdk.settings.setValid(true);
    } else {
      renderPlayerLobby(shell);
      await sdk.room.clientReady();
      shell.log('player', '→ room.clientReady()');
    }
  });

  if (role === 'host') {
    sdk.onPlayerJoin((player, meta) => {
      if (!roster.find((p) => p.id === player.id)) roster.push(player);
      renderPlayersLabel(shell, roster);
      shell.log(
        'host',
        `onPlayerJoin: ${player.name}${meta.isReconnect ? ' (reconnect)' : ''}${meta.isLateJoin ? ' (late join)' : ''}`,
      );
    });

    sdk.onPlayerLeave((playerId) => {
      roster = roster.filter((p) => p.id !== playerId);
      renderPlayersLabel(shell, roster);
      shell.log('host', `onPlayerLeave: ${playerId}`);
    });

    sdk.onPlayerReady((playerId) => {
      playersReady.add(playerId);
      shell.log('host', `onPlayerReady: ${playerId} (${playersReady.size}/${roster.length})`);
      if (playersReady.size >= roster.length) {
        shell.log('host', '→ room.startGame()');
        void sdk.room.startGame();
      }
    });

    sdk.onStartGameRequested(async () => {
      shell.log('host', 'onStartGameRequested — seeding initial state');
      await sdk.host.setState(buildInitialState(roster, items));
      renderHostStage(sdk, shell, items, roster);
    });

    sdk.onPlayerAction(async (playerId: string, action: PlayerAction) => {
      if (action.type !== 'answer') return;
      const answer = (action.data ?? {}) as AnswerData;
      const item = items.find((i) => i.id === answer.itemId);
      if (!item) return;

      shell.log('host', `onPlayerAction ${playerId} → ${answer.choice}`);

      const correct = isCorrect(item, answer.choice);

      await sdk.host.updateState((draft) => {
        if (draft.answered[playerId]) return;
        draft.answered[playerId] = answer.choice;
        if (correct) {
          draft.scores[playerId] = (draft.scores[playerId] ?? 0) + POINTS_PER_CORRECT;
        }
      });

      const current = sdk.host.getState();
      if (current && Object.keys(current.answered).length >= roster.length) {
        await sdk.host.updateState((draft) => {
          draft.phase = 'reveal';
        });
        renderHostStage(sdk, shell, items, roster);
        setTimeout(() => void advance(sdk, items, roster), REVEAL_MS);
      } else {
        renderHostStage(sdk, shell, items, roster);
      }
    });
  } else {
    // Player role
    sdk.onState((state) => {
      if (!state) return;
      renderPlayerStage(sdk, shell, items, human, state);
    });

    sdk.onEvent((event) => {
      shell.log('player', `onEvent: ${event.type}`);
    });

    sdk.onGameEnd((result: SessionResult) => {
      shell.log('player', 'onGameEnd');
      renderGameOver(shell, result, human, roster);
    });
  }
}

// ── Rendering helpers ───────────────────────────────────────────────────────

function renderHostSettings(
  sdk: MemizyMultiplayerSDK<QuizState>,
  shell: Shell,
): void {
  shell.body.innerHTML = `
    <p class="lead" style="margin:0 0 12px;">
      You're the host. Two bot players are already in the lobby. Click
      <strong>Start game</strong> to run the quiz — the bots will auto-ready
      and auto-answer.
    </p>
  `;
  shell.actions.innerHTML = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = '▶ Start game';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    shell.log('host', '→ settings.setValid(true) + room.hostReady()');
    await sdk.settings.setValid(true);
    await sdk.room.hostReady();
  });
  shell.actions.appendChild(btn);
}

function renderPlayerLobby(shell: Shell): void {
  shell.body.innerHTML = `
    <p class="lead" style="margin:0;">
      Waiting for the host to start the game. The SDK already sent
      <code>room.clientReady()</code>.
    </p>
  `;
  shell.actions.innerHTML = '';
}

function renderHostStage(
  sdk: MemizyMultiplayerSDK<QuizState>,
  shell: Shell,
  items: OQSEItem[],
  roster: MultiPlayer[],
): void {
  const state = sdk.host.getState();
  if (!state) return;

  if (state.phase === 'done') {
    shell.body.innerHTML = `<p class="lead" style="margin:0;">Game finished.</p>`;
    shell.actions.innerHTML = '';
  } else {
    const item = items.find((i) => i.id === state.currentItemId);
    if (!item) return;
    shell.indexLabel.textContent = `${state.currentIndex + 1} / ${items.length}`;

    shell.body.innerHTML = `
      <div class="question">
        <div class="question-head">
          <p class="question-prompt">${escapeHtml(promptOf(item))}</p>
          <span class="phase-pill ${state.phase === 'reveal' ? 'phase-finished' : 'phase-playing'}">${state.phase}</span>
        </div>
        <div class="options">
          ${renderHostOptions(item, state)}
        </div>
      </div>
    `;
    shell.actions.innerHTML = '';

    if (state.phase === 'reveal' || Object.keys(state.answered).length >= roster.length) {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'btn btn-secondary';
      skip.textContent = '⏭ Next question';
      skip.addEventListener('click', () => void advance(sdk, items, roster));
      shell.actions.appendChild(skip);
    }

    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'btn btn-danger';
    endBtn.textContent = '⏹ End game';
    endBtn.addEventListener('click', () => void endGame(sdk, roster));
    shell.actions.appendChild(endBtn);
  }

  renderScoreboard(shell, roster, state, null);
}

function renderPlayerStage(
  sdk: MemizyMultiplayerSDK<QuizState>,
  shell: Shell,
  items: OQSEItem[],
  human: MultiPlayer,
  state: QuizState,
): void {
  const item = items.find((i) => i.id === state.currentItemId);
  shell.indexLabel.textContent = item
    ? `${state.currentIndex + 1} / ${items.length}`
    : '—';

  if (state.phase === 'done' || !item) {
    shell.body.innerHTML = `<p class="lead" style="margin:0;">Waiting for the next question…</p>`;
    shell.actions.innerHTML = '';
  } else {
    const alreadyAnswered = state.answered[human.id] !== undefined;
    const revealing = state.phase === 'reveal';

    shell.body.innerHTML = `
      <div class="question">
        <div class="question-head">
          <p class="question-prompt">${escapeHtml(promptOf(item))}</p>
          <span class="phase-pill ${revealing ? 'phase-finished' : 'phase-playing'}">${revealing ? 'reveal' : 'your turn'}</span>
        </div>
        <div class="options" id="mini-options"></div>
      </div>
    `;

    const container = shell.body.querySelector<HTMLDivElement>('#mini-options')!;
    renderPlayerOptions(container, item, state, human, alreadyAnswered || revealing, (choice) => {
      shell.log('player', `→ player.sendAction('answer', …)`);
      void sdk.player.sendAction<AnswerData>('answer', { itemId: item.id, choice });
    });

    shell.actions.innerHTML = '';
  }

  renderScoreboard(shell, null, state, human);
}

function renderGameOver(
  shell: Shell,
  result: SessionResult,
  human: MultiPlayer,
  roster: MultiPlayer[],
): void {
  applyPhasePill(shell.phasePill, 'finished' as GamePhase);

  const entries = Object.entries(result.scores)
    .map(([id, score]) => ({
      id,
      name: roster.find((p) => p.id === id)?.name ?? id,
      score,
    }))
    .sort((a, b) => b.score - a.score);

  const rows = entries
    .map((row, idx) => {
      const me = row.id === human.id;
      return `
        <div class="score-row ${me ? 'me' : ''}">
          <div>
            <div class="score-name">${idx === 0 ? '🏆 ' : ''}${escapeHtml(row.name)}${me ? ' (you)' : ''}</div>
            <div class="score-sub">rank #${idx + 1}</div>
          </div>
          <div class="score-value">${row.score}</div>
        </div>
      `;
    })
    .join('');

  shell.body.innerHTML = `
    <h3 style="margin:0 0 14px;font-size:18px;">Game over</h3>
    <div class="scoreboard">${rows}</div>
  `;
  shell.actions.innerHTML = '';
  shell.scoreboard.innerHTML = rows || '<p class="lead">No scores recorded.</p>';
}

function renderScoreboard(
  shell: Shell,
  roster: MultiPlayer[] | null,
  state: QuizState,
  me: MultiPlayer | null,
): void {
  const entries = roster
    ? roster.map((p) => ({ id: p.id, name: p.name, score: state.scores[p.id] ?? 0 }))
    : Object.entries(state.scores).map(([id, score]) => ({ id, name: id, score }));

  if (entries.length === 0) {
    shell.scoreboard.innerHTML = `<p class="lead">Nothing to score yet.</p>`;
    return;
  }

  shell.scoreboard.innerHTML = entries
    .sort((a, b) => b.score - a.score)
    .map((e, idx) => {
      const isMe = me?.id === e.id;
      return `
        <div class="score-row ${isMe ? 'me' : ''}">
          <div>
            <div class="score-name">${idx === 0 ? '🥇 ' : ''}${escapeHtml(e.name)}${isMe ? ' (you)' : ''}</div>
            <div class="score-sub">${state.answered[e.id] ? 'answered' : 'thinking…'}</div>
          </div>
          <div class="score-value">${e.score}</div>
        </div>
      `;
    })
    .join('');
}

function renderPlayersLabel(shell: Shell, roster: MultiPlayer[]): void {
  shell.playersLabel.textContent = `${roster.length} (${roster.map((p) => p.name).join(', ')})`;
}

function applyPhasePill(el: HTMLElement, phase: GamePhase): void {
  el.className = 'phase-pill';
  el.textContent = phase;
  switch (phase) {
    case 'host-settings':
      el.classList.add('phase-settings');
      break;
    case 'synchronizing':
      el.classList.add('phase-syncing');
      break;
    case 'playing':
      el.classList.add('phase-playing');
      break;
    default:
      el.classList.add('phase-finished');
      break;
  }
}

function renderHostOptions(item: OQSEItem, state: QuizState): string {
  const answers = Object.entries(state.answered);
  if (isMCQSingle(item)) {
    return item.options
      .map((opt, idx) => {
        const pickers = answers.filter(([, v]) => v === String(idx)).length;
        const correct = state.phase === 'reveal' && idx === item.correctIndex;
        return `
          <div class="option-btn ${correct ? 'correct' : ''}">
            <strong>${String.fromCharCode(65 + idx)}.</strong>
            ${escapeHtml(opt)}
            ${pickers > 0 ? ` <small>(${pickers})</small>` : ''}
          </div>
        `;
      })
      .join('');
  }
  if (isTrueFalse(item)) {
    return (['true', 'false'] as const)
      .map((label) => {
        const pickers = answers.filter(([, v]) => v === label).length;
        const correct = state.phase === 'reveal' && (label === 'true') === item.answer;
        return `
          <div class="option-btn ${correct ? 'correct' : ''}">
            ${label === 'true' ? 'True' : 'False'}${pickers > 0 ? ` <small>(${pickers})</small>` : ''}
          </div>`;
      })
      .join('');
  }
  return answers
    .map(([id, v]) => `<div class="option-btn"><strong>${escapeHtml(id)}:</strong> ${escapeHtml(v)}</div>`)
    .join('');
}

function renderPlayerOptions(
  container: HTMLElement,
  item: OQSEItem,
  state: QuizState,
  human: MultiPlayer,
  readOnly: boolean,
  submit: (choice: string) => void,
): void {
  const mine = state.answered[human.id];

  if (isMCQSingle(item)) {
    container.innerHTML = item.options
      .map((opt, idx) => {
        const picked = mine === String(idx);
        const cls =
          state.phase === 'reveal' && idx === item.correctIndex
            ? 'correct'
            : picked && state.phase === 'reveal'
              ? 'wrong'
              : picked
                ? 'picked'
                : '';
        return `<button type="button" class="option-btn ${cls}" data-choice="${idx}" ${readOnly ? 'disabled' : ''}>
          <strong>${String.fromCharCode(65 + idx)}.</strong> ${escapeHtml(opt)}
        </button>`;
      })
      .join('');
    container.querySelectorAll<HTMLButtonElement>('button[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => submit(btn.dataset['choice']!));
    });
    return;
  }

  if (isTrueFalse(item)) {
    container.innerHTML = (['true', 'false'] as const)
      .map((v) => {
        const picked = mine === v;
        const cls =
          state.phase === 'reveal' && (v === 'true') === item.answer
            ? 'correct'
            : picked && state.phase === 'reveal'
              ? 'wrong'
              : picked
                ? 'picked'
                : '';
        return `<button type="button" class="option-btn ${cls}" data-choice="${v}" ${readOnly ? 'disabled' : ''}>${v === 'true' ? 'True' : 'False'}</button>`;
      })
      .join('');
    container.querySelectorAll<HTMLButtonElement>('button[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => submit(btn.dataset['choice']!));
    });
    return;
  }

  if (isShortAnswer(item)) {
    container.innerHTML = `
      <input class="short-input" id="mini-short" placeholder="Type your answer…" ${readOnly ? 'disabled' : ''} />
      <button type="button" class="btn btn-primary" id="mini-submit" ${readOnly ? 'disabled' : ''}>Submit</button>
    `;
    const input = container.querySelector<HTMLInputElement>('#mini-short')!;
    container.querySelector<HTMLButtonElement>('#mini-submit')!.addEventListener('click', () => {
      if (!input.value.trim()) return;
      submit(input.value.trim());
    });
    return;
  }

  container.innerHTML = `<p class="lead">Unsupported item type: <code>${escapeHtml(item.type)}</code>.</p>`;
}

// ── Game control (host side) ────────────────────────────────────────────────

function buildInitialState(roster: MultiPlayer[], items: OQSEItem[]): QuizState {
  return {
    currentIndex: 0,
    currentItemId: items[0]?.id ?? null,
    scores: Object.fromEntries(roster.map((p) => [p.id, 0])),
    answered: {},
    phase: items.length === 0 ? 'done' : 'question',
  };
}

async function advance(
  sdk: MemizyMultiplayerSDK<QuizState>,
  items: OQSEItem[],
  roster: MultiPlayer[],
): Promise<void> {
  const state = sdk.host.getState();
  if (!state) return;
  const next = state.currentIndex + 1;
  if (next >= items.length) {
    await endGame(sdk, roster);
    return;
  }
  await sdk.host.updateState((draft) => {
    draft.currentIndex = next;
    draft.currentItemId = items[next].id;
    draft.answered = {};
    draft.phase = 'question';
  });
  renderHostStage(sdk, await nextTick(), items, roster);
}

async function endGame(
  sdk: MemizyMultiplayerSDK<QuizState>,
  roster: MultiPlayer[],
): Promise<void> {
  const state = sdk.host.getState();
  const scores: Record<string, number> = { ...(state?.scores ?? {}) };
  for (const p of roster) scores[p.id] ??= 0;
  await sdk.host.endGame({
    scores,
    summary: {
      finishedAt: new Date().toISOString(),
      reason: 'completed',
    },
  });
}

/** Helper so `renderHostStage` picks up the just-written state. */
function nextTick<T>(): Promise<T> {
  return new Promise((resolve) => queueMicrotask(() => resolve(undefined as T)));
}

// ── Shadow bots ─────────────────────────────────────────────────────────────
//
// Each bot is a separate `MemizyMultiplayerSDK` connected in standalone
// mode, but pointed at the same `MemoryMockHub` as the user's SDK.
// They run the exact plugin lifecycle — `onInit`, `onState`, etc. —
// just with a deterministic brain.

async function spawnBotPlayer(
  hub: MemoryMockHub,
  self: MultiPlayer,
  log: (k: LogKind, m: string) => void,
): Promise<void> {
  const bot = new MemizyMultiplayerSDK<QuizState>({
    id: `bot-player-${self.id}`,
    version: '1.0.0',
  });

  bot.onInit(async () => {
    log('bot', `${self.name} connected — sending room.clientReady()`);
    await bot.room.clientReady();
  });

  bot.onState((state) => {
    if (!state) return;
    if (state.phase !== 'question') return;
    if (state.answered[self.id] !== undefined) return;
    const item = SAMPLE_ITEMS.find((i) => i.id === state.currentItemId);
    if (!item) return;
    const choice = pickBotAnswer(item);
    const delay =
      BOT_ANSWER_MIN_MS +
      Math.random() * (BOT_ANSWER_MAX_MS - BOT_ANSWER_MIN_MS);
    setTimeout(() => {
      log('bot', `${self.name} → answer=${choice}`);
      void bot.player.sendAction<AnswerData>('answer', { itemId: item.id, choice });
    }, delay);
  });

  await bot.connect({
    mode: 'standalone',
    mockHub: hub,
    standalone: {
      role: 'player',
      self,
      items: SAMPLE_ITEMS,
      players: [self],
    },
  });
}

async function spawnBotHost(
  hub: MemoryMockHub,
  roster: MultiPlayer[],
  log: (k: LogKind, m: string) => void,
): Promise<void> {
  const bot = new MemizyMultiplayerSDK<QuizState>({
    id: 'bot-host',
    version: '1.0.0',
  });

  const readySet = new Set<string>();

  bot.onInit(async () => {
    log('bot', 'bot-host connected — settings.setValid(true) + room.hostReady()');
    await bot.settings.setValid(true);
    // Give player SDKs a beat to register with the hub so we don't
    // flush `onStartGameRequested` before anyone is listening.
    setTimeout(() => void bot.room.hostReady(), 250);
  });

  bot.onPlayerReady((id) => {
    readySet.add(id);
    if (readySet.size >= roster.length) {
      log('bot', `all ${roster.length} players ready — room.startGame()`);
      void bot.room.startGame();
    }
  });

  bot.onStartGameRequested(async () => {
    log('bot', 'bot-host seeding initial state');
    await bot.host.setState(buildInitialState(roster, SAMPLE_ITEMS));
  });

  bot.onPlayerAction(async (playerId, action) => {
    if (action.type !== 'answer') return;
    const data = (action.data ?? {}) as AnswerData;
    const item = SAMPLE_ITEMS.find((i) => i.id === data.itemId);
    if (!item) return;

    const correct = isCorrect(item, data.choice);

    await bot.host.updateState((draft) => {
      if (draft.answered[playerId]) return;
      draft.answered[playerId] = data.choice;
      if (correct) {
        draft.scores[playerId] = (draft.scores[playerId] ?? 0) + POINTS_PER_CORRECT;
      }
    });

    const state = bot.host.getState();
    if (!state) return;
    if (Object.keys(state.answered).length < roster.length) return;

    await bot.host.updateState((draft) => {
      draft.phase = 'reveal';
    });

    setTimeout(async () => {
      const current = bot.host.getState();
      const next = (current?.currentIndex ?? 0) + 1;
      if (next >= SAMPLE_ITEMS.length) {
        await bot.host.endGame({
          scores: { ...(current?.scores ?? {}) },
          summary: {
            finishedAt: new Date().toISOString(),
            reason: 'completed',
          },
        });
        return;
      }
      await bot.host.updateState((draft) => {
        draft.currentIndex = next;
        draft.currentItemId = SAMPLE_ITEMS[next].id;
        draft.answered = {};
        draft.phase = 'question';
      });
    }, REVEAL_MS);
  });

  await bot.connect({
    mode: 'standalone',
    mockHub: hub,
    standalone: {
      role: 'host',
      items: SAMPLE_ITEMS,
      players: roster,
    },
  });
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

function isCorrect(item: OQSEItem, choice: string): boolean {
  if (isMCQSingle(item)) return Number(choice) === item.correctIndex;
  if (isTrueFalse(item)) return (choice === 'true') === item.answer;
  if (isShortAnswer(item)) {
    const raw = item.trimWhitespace === false ? choice : choice.trim();
    return item.answers.some((ans) =>
      item.caseSensitive ? ans === raw : ans.toLowerCase() === raw.toLowerCase(),
    );
  }
  return false;
}

function pickBotAnswer(item: OQSEItem): string {
  if (isMCQSingle(item)) {
    if (Math.random() < 0.6) return String(item.correctIndex);
    const wrongs = item.options
      .map((_, idx) => idx)
      .filter((idx) => idx !== item.correctIndex);
    const pick = wrongs[Math.floor(Math.random() * wrongs.length)];
    return String(pick ?? 0);
  }
  if (isTrueFalse(item)) {
    return Math.random() < 0.6 ? String(item.answer) : String(!item.answer);
  }
  if (isShortAnswer(item)) {
    return Math.random() < 0.5 ? (item.answers[0] ?? '') : 'something-else';
  }
  return '0';
}

function promptOf(item: OQSEItem): string {
  if (isMCQSingle(item) || isTrueFalse(item) || isShortAnswer(item)) {
    return item.question;
  }
  return item.id;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
