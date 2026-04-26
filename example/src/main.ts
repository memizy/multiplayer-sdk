/**
 * Memizy Multiplayer SDK — v0.4 sandbox.
 *
 * One HTML page, one `MemoryMockHub`, many `MemizyMultiplayerSDK`
 * instances. A single host plugin plus several player plugins all
 * share the hub so every state broadcast, transient event and player
 * action actually travels between them — exactly as it would in a
 * real Memizy lobby.
 *
 * This file covers the full `v0.4` public surface:
 *
 *  - `sdk.settings.update()` — the teacher authors the quiz.
 *  - `sdk.room.startGame()` — host promotes the lobby into `playing`.
 *  - `sdk.host.setState()` / `updateState()` — authoritative state
 *    broadcast + minimal JSON patches for each answer.
 *  - `sdk.host.sendStateTo()` — reconnect / late-join catch-up.
 *  - `sdk.host.sendEvent()` — transient toasts, reveal pings.
 *  - `sdk.host.endGame()` — final scoreboard.
 *  - `sdk.player.sendAction()` — submitting an answer.
 *  - `sdk.player.onStateChange()` / `onEvent()` / `onGameEnd()`.
 *
 *  Late-join, reconnect and teams are all wired up so you can play
 *  with them directly from the toolbar at the top of the page.
 */

import {
  MemizyMultiplayerSDK,
  MemoryMockHub,
  isMCQSingle,
  isTrueFalse,
  isShortAnswer,
  type InitSessionPayload,
  type GameEvent,
  type GamePhase,
  type MultiPlayer,
  type OQSEItem,
  type SessionResult,
  type TeamInfo,
} from '@memizy/multiplayer-sdk';

import { SAMPLE_ITEMS, SAMPLE_SET_META } from './sample-set';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TEAMS: TeamInfo[] = [
  { id: 'red',  name: 'Red Rockets',  color: '#ef4444' },
  { id: 'blue', name: 'Blue Bolts',   color: '#3b82f6' },
];

const PLAYER_POOL: Array<{ id: string; name: string; emoji: string }> = [
  { id: 'alice',   name: 'Alice',   emoji: '🦊' },
  { id: 'bob',     name: 'Bob',     emoji: '🐼' },
  { id: 'charlie', name: 'Charlie', emoji: '🦉' },
  { id: 'dana',    name: 'Dana',    emoji: '🐙' },
  { id: 'eve',     name: 'Eve',     emoji: '🐝' },
  { id: 'frank',   name: 'Frank',   emoji: '🦖' },
  { id: 'gina',    name: 'Gina',    emoji: '🐨' },
  { id: 'hugo',    name: 'Hugo',    emoji: '🐸' },
];

const INITIAL_PLAYER_COUNT = 3;

const LOBBY_PIN = '428619';
const NEXT_QUESTION_DELAY_MS = 10000;

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS + GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

interface QuizSettings extends Record<string, unknown> {
  questionCount: number;       // how many items from SAMPLE_ITEMS to play
  perQuestionSeconds: number;  // visible countdown
  useTeams: boolean;
  showLeaderboard: boolean;    // players see live leaderboard
}

const DEFAULT_SETTINGS: QuizSettings = {
  questionCount: 4,
  perQuestionSeconds: 15,
  useTeams: true,
  showLeaderboard: true,
};

type QuizPhase = 'intro' | 'question' | 'reveal' | 'final';

interface QuestionView {
  index: number;
  id: string;
  kind: 'mcq-single' | 'true-false' | 'short-answer';
  prompt: string;
  options: string[];           // pre-shuffled labels rendered to players
  deadlineAt: number | null;
}

interface QuizState {
  phase: QuizPhase;
  totalQuestions: number;
  useTeams: boolean;
  teams: TeamInfo[];
  question: QuestionView | null;
  /** Per-player answer for the CURRENT question only. Cleared on advance. */
  currentAnswers: Record<
    string,
    { choiceIndex: number | null; text: string | null; correct: boolean; answeredAt: number }
  >;
  /** Reveal info populated when the host flips to `reveal`. */
  reveal: {
    correctIndex: number | null;
    correctText: string | null;
    perPlayerCorrect: Record<string, boolean>;
  } | null;
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  players: Array<{ id: string; name: string; teamId?: string; emoji?: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function $id<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tiny markdown: **bold**, *italic*, `code`. Everything else is
 * escaped. Enough for the demo without pulling in a full parser.
 */
function md(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// ═══════════════════════════════════════════════════════════════════════════
// LOG PANEL
// ═══════════════════════════════════════════════════════════════════════════

type LogKind = 'ok' | 'err' | 'inf' | 'warn' | 'sys' | 'host' | 'player';

function log(msg: string, kind: LogKind = 'inf'): void {
  const panel = $id('log-panel');
  if (!panel) return;
  const ts = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line log-${kind}`;
  line.innerHTML = `<span class="log-ts">${ts}</span><span class="log-tag log-tag-${kind}">${kindLabel(kind)}</span><span class="log-msg">${esc(msg)}</span>`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function kindLabel(kind: LogKind): string {
  switch (kind) {
    case 'ok':     return 'OK';
    case 'err':    return 'ERR';
    case 'warn':   return 'WARN';
    case 'sys':    return 'SYS';
    case 'host':   return 'HOST';
    case 'player': return 'PLR';
    default:       return 'INF';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════════════════════

function toast(msg: string, kind: 'ok' | 'err' | 'inf' = 'inf'): void {
  const root = $id('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

interface PlayerStation {
  profile: MultiPlayer & { emoji?: string };
  sdk: MemizyMultiplayerSDK<QuizState>;
  rootEl: HTMLElement;
  connected: boolean;
}

class Sandbox {
  readonly hub = new MemoryMockHub();
  host!: HostStation;
  players: PlayerStation[] = [];

  async bootstrap(): Promise<void> {
    log('Creating MemoryMockHub…', 'sys');
    this.host = new HostStation(this, this.hub);
    await this.host.start();

    for (let i = 0; i < INITIAL_PLAYER_COUNT; i += 1) {
      await this.addPlayer();
    }

    this.updateSidebar();
  }

  async addPlayer(): Promise<PlayerStation | null> {
    const idx = this.players.length;
    const seed = PLAYER_POOL[idx];
    if (!seed) {
      toast('No more players in the pool.', 'err');
      return null;
    }

    const teamId =
      this.host.settings.useTeams && TEAMS[idx % TEAMS.length]
        ? TEAMS[idx % TEAMS.length]!.id
        : undefined;

    const profile: MultiPlayer & { emoji?: string } = {
      id: seed.id,
      name: seed.name,
      joinedAt: Date.now(),
      ...(teamId ? { teamId } : {}),
      meta: { emoji: seed.emoji },
      emoji: seed.emoji,
    };

    const rootEl = this.ensurePlayerCardEl(profile);

    const station = await createPlayerStation(this, profile, rootEl);
    this.players.push(station);
    log(`Player joined: ${profile.name} (${profile.id})${teamId ? ` · team=${teamId}` : ''}`, 'sys');
    this.updateSidebar();
    return station;
  }

  async removeLastPlayer(): Promise<void> {
    const station = this.players.pop();
    if (!station) {
      toast('No players to remove.', 'inf');
      return;
    }
    await this.teardownStation(station);
    station.rootEl.remove();
    log(`Player removed: ${station.profile.name}`, 'sys');
    this.updateSidebar();
  }

  async disconnectLastPlayer(): Promise<void> {
    const station = [...this.players].reverse().find((p) => p.connected);
    if (!station) {
      toast('No connected players.', 'err');
      return;
    }
    await this.teardownStation(station, { keepCard: true });
    station.connected = false;
    station.rootEl.classList.add('disconnected');
    const body = station.rootEl.querySelector('.player-body');
    if (body) {
      body.innerHTML = `
        <div class="player-disconnected">
          <span class="big-icon">📵</span>
          <strong>${esc(station.profile.name)} disconnected</strong>
          <span class="text-muted">Click "Reconnect last" to simulate a rejoin.</span>
        </div>`;
    }
    log(`Player disconnected: ${station.profile.name}`, 'sys');
    this.updateSidebar();
  }

  async reconnectLastPlayer(): Promise<void> {
    const station = [...this.players].reverse().find((p) => !p.connected);
    if (!station) {
      toast('No disconnected players to reconnect.', 'inf');
      return;
    }
    station.rootEl.classList.remove('disconnected');
    const newStation = await createPlayerStation(this, station.profile, station.rootEl);
    const idx = this.players.indexOf(station);
    if (idx >= 0) this.players[idx] = newStation;
    log(`Player reconnected: ${station.profile.name}`, 'sys');
    this.updateSidebar();
  }

  async simulateLateJoin(): Promise<void> {
    if (this.host.currentPhase !== 'playing') {
      toast('Late join only matters while playing. Start the game first.', 'err');
      return;
    }
    const station = await this.addPlayer();
    if (station) {
      toast(`Late join: ${station.profile.name} appeared mid-game.`, 'ok');
    }
  }

  async reset(): Promise<void> {
    log('Resetting sandbox…', 'sys');
    for (const p of [...this.players]) {
      await this.teardownStation(p);
      p.rootEl.remove();
    }
    this.players = [];
    this.host.destroy();
    $id('players-stack').innerHTML = '';
    $id('log-panel').innerHTML = '';
    await this.bootstrap();
    toast('Sandbox reset.', 'ok');
  }

  private async teardownStation(
    station: PlayerStation,
    opts: { keepCard?: boolean } = {},
  ): Promise<void> {
    try {
      await station.sdk.sys.exit();
    } catch {
      // MockHost.sysExit can throw if already torn down — safe to ignore.
    }
    station.sdk.destroy();
    if (!opts.keepCard) station.rootEl.classList.add('disconnected');
  }

  private ensurePlayerCardEl(
    profile: MultiPlayer & { emoji?: string },
  ): HTMLElement {
    const stack = $id('players-stack');
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset['playerId'] = profile.id;
    card.innerHTML = `
      <div class="player-head">
        <span class="player-avatar">${esc(profile.emoji ?? '🙂')}</span>
        <div class="player-head-text">
          <div class="player-name">${esc(profile.name)}</div>
          <div class="player-sub">
            <code>${esc(profile.id)}</code>
            ${profile.teamId ? teamChip(profile.teamId) : ''}
          </div>
        </div>
        <span class="phase-pill phase-sync">SYNCING</span>
      </div>
      <div class="player-body">
        <div class="player-empty">Connecting…</div>
      </div>
    `;
    stack.appendChild(card);
    return card;
  }

  updateSidebar(): void {
    $id('side-phase').textContent = phaseLabel(this.host.currentPhase);
    $id('side-pin').textContent = LOBBY_PIN;
    $id('side-players').textContent = String(this.players.filter((p) => p.connected).length);
    $id('side-teams').textContent = this.host.settings.useTeams ? 'On · 2 teams' : 'Off';

    const mainPill = $id('main-phase-pill');
    mainPill.textContent = phaseLabel(this.host.currentPhase).toUpperCase();
    mainPill.className = `phase-pill ${phaseClass(this.host.currentPhase)}`;

    const hostPill = $id('host-phase-pill');
    hostPill.textContent = phaseLabel(this.host.currentPhase).toUpperCase();
    hostPill.className = `phase-pill ${phaseClass(this.host.currentPhase)}`;
  }
}

function teamChip(teamId: string): string {
  const team = TEAMS.find((t) => t.id === teamId);
  if (!team) return '';
  return `<span class="team-chip" style="--team-color:${team.color ?? '#888'}">${esc(team.name)}</span>`;
}

function phaseLabel(phase: GamePhase | null): string {
  if (!phase) return '—';
  return phase === 'host-settings' ? 'Host-settings'
    : phase === 'synchronizing'   ? 'Synchronizing'
    : phase === 'playing'         ? 'Playing'
    :                               'Finished';
}

function phaseClass(phase: GamePhase | null): string {
  switch (phase) {
    case 'host-settings':  return 'phase-settings';
    case 'synchronizing':  return 'phase-sync';
    case 'playing':        return 'phase-play';
    case 'finished':       return 'phase-final';
    default:               return 'phase-settings';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOST STATION — teacher/projector plugin instance
// ═══════════════════════════════════════════════════════════════════════════

class HostStation {
  readonly sdk: MemizyMultiplayerSDK<QuizState>;
  readonly body: HTMLElement;
  currentPhase: GamePhase | null = null;
  settings: QuizSettings = { ...DEFAULT_SETTINGS };
  state: QuizState | null = null;
  private readyPlayers = new Set<string>();
  private autoAdvanceHandle: ReturnType<typeof setTimeout> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private sandbox: Sandbox, private hub: MemoryMockHub) {
    this.body = $id('host-body');
    this.sdk = new MemizyMultiplayerSDK<QuizState>({
      id: 'com.memizy.example.multiplayer-quiz',
      version: '1.0.0',
      debug: false,
    });
  }

  async start(): Promise<void> {
    this.wireLifecycle();
    const init = await this.sdk.connect({
      mode: 'standalone',
      mockHub: this.hub,
      standalone: {
        role: 'host',
        pin: LOBBY_PIN,
        phase: 'host-settings',
        items: SAMPLE_ITEMS,
        setMeta: SAMPLE_SET_META,
        players: [],
        teams: TEAMS,
        supportsTeams: true,
        supportsLateJoin: true,
        supportsReconnect: true,
        capacity: { min: 2, max: 20, recommended: 6 },
        settings: { ...DEFAULT_SETTINGS },
      },
    });
    this.currentPhase = init.phase;
    log(`Host connected — role=${init.role} phase=${init.phase} pin=${init.pin}`, 'host');
    this.renderSettings();
  }

  destroy(): void {
    this.clearTimers();
    this.sdk.destroy();
    this.body.innerHTML = '';
  }

  // ── Lifecycle wiring ─────────────────────────────────────────────────

  private wireLifecycle(): void {
    this.sdk.onInit((init) => this.onInit(init));
    this.sdk.onPhaseChange((phase) => this.onPhase(phase));

    this.sdk.onPlayerJoin((player, meta) => {
      log(
        `onPlayerJoin: ${player.name} (lateJoin=${meta.isLateJoin} reconnect=${meta.isReconnect})`,
        'host',
      );
      if (this.state) {
        void this.sdk.host.updateState((draft) => {
          if (!draft.players.some((p) => p.id === player.id)) {
            draft.players.push({
              id: player.id,
              name: player.name,
              teamId: player.teamId,
              emoji: (player.meta?.['emoji'] as string | undefined) ?? '🙂',
            });
          }
          if (!(player.id in draft.scores))     draft.scores[player.id] = 0;
        });
        if (this.currentPhase === 'playing') {
          void this.sdk.host.sendStateTo(player.id);
          void this.sdk.host.sendEvent(player.id, {
            type: meta.isLateJoin ? 'late_join_welcome' : 'reconnect_welcome',
            data: { name: player.name },
          });
        }
      }
      this.renderHost();
      this.sandbox.updateSidebar();
    });

    this.sdk.onPlayerLeave((playerId) => {
      log(`onPlayerLeave: ${playerId}`, 'host');
      this.readyPlayers.delete(playerId);
      this.renderHost();
      this.sandbox.updateSidebar();
    });

    this.sdk.onPlayerReady((playerId) => {
      this.readyPlayers.add(playerId);
      log(`onPlayerReady: ${playerId}  (${this.readyPlayers.size}/${this.connectedCount()})`, 'host');
      this.renderHost();
      if (this.currentPhase === 'playing' && this.state) {
        void this.sdk.host.sendStateTo(playerId);
      }
    });

    this.sdk.onPlayerAction((playerId, action) => {
      log(`onPlayerAction: ${playerId} -> ${action.type}`, 'host');
      if (action.type === 'answer') {
        this.handleAnswer(playerId, action.data as AnswerPayload);
      }
    });

    this.sdk.onStartGameRequested(() => {
      log('onStartGameRequested (from standalone sandbox)', 'host');
    });
  }

  private async onInit(init: InitSessionPayload): Promise<void> {
    this.currentPhase = init.phase;
    this.settings = { ...DEFAULT_SETTINGS, ...(init.settings as Partial<QuizSettings>) };
    this.renderSettings();
  }

  private async onPhase(phase: GamePhase): Promise<void> {
    this.currentPhase = phase;
    log(`Host phase -> ${phase}`, 'host');
    this.sandbox.updateSidebar();

    if (phase === 'synchronizing') {
      this.renderSynchronizing();
    } else if (phase === 'playing') {
      await this.seedInitialState();
      this.renderHost();
      // Small pause so players can see the intro.
      this.scheduleAdvance(1500, () => this.startFirstQuestion());
    } else if (phase === 'finished') {
      this.renderFinal();
    }
  }

  // ── Settings phase ──────────────────────────────────────────────────

  private renderSettings(): void {
    const s = this.settings;
    this.body.innerHTML = `
      <div class="host-settings">
        <div class="settings-hero">
          <div class="hero-badge">🎮 Lobby</div>
          <div class="hero-pin">
            <div class="hero-pin-label">Lobby PIN</div>
            <div class="hero-pin-value">${esc(LOBBY_PIN)}</div>
          </div>
          <p class="hero-copy text-muted">
            Configure the quiz below. Settings mutations are broadcast to the
            host app through <code>sdk.settings.update()</code>. Click
            <strong>Start game</strong> to move the lobby to
            <code>synchronizing</code>.
          </p>
        </div>

        <div class="settings-grid">
          <label class="setting-row">
            <span class="setting-label">Question count</span>
            <span class="setting-control">
              <input type="range" id="qcount-input" min="2" max="${SAMPLE_ITEMS.length}" value="${s.questionCount}" />
              <output id="qcount-out">${s.questionCount}</output>
            </span>
          </label>
          <label class="setting-row">
            <span class="setting-label">Per-question timer</span>
            <span class="setting-control">
              <input type="range" id="timer-input" min="5" max="30" step="5" value="${s.perQuestionSeconds}" />
              <output id="timer-out">${s.perQuestionSeconds}s</output>
            </span>
          </label>
          <label class="setting-row">
            <span class="setting-label">Teams</span>
            <span class="setting-control">
              <input type="checkbox" id="teams-input" ${s.useTeams ? 'checked' : ''} />
              <span>Split players into Red / Blue</span>
            </span>
          </label>
          <label class="setting-row">
            <span class="setting-label">Live leaderboard on clients</span>
            <span class="setting-control">
              <input type="checkbox" id="leaderboard-input" ${s.showLeaderboard ? 'checked' : ''} />
              <span>Players see positions during the game</span>
            </span>
          </label>
        </div>

        <div class="roster-preview">
          <div class="roster-preview-label">Connected players (${this.connectedCount()})</div>
          <div class="roster-preview-list" id="host-roster"></div>
        </div>

        <div class="settings-actions">
          <button type="button" class="btn btn-primary btn-lg" id="btn-start">Start game →</button>
        </div>
      </div>`;

    const qcount = $id<HTMLInputElement>('qcount-input');
    qcount.addEventListener('input', () => {
      $id('qcount-out').textContent = qcount.value;
      void this.sdk.settings.update((draft) => {
        (draft as QuizSettings).questionCount = Number(qcount.value);
      });
      this.settings.questionCount = Number(qcount.value);
    });

    const timer = $id<HTMLInputElement>('timer-input');
    timer.addEventListener('input', () => {
      $id('timer-out').textContent = `${timer.value}s`;
      void this.sdk.settings.update((draft) => {
        (draft as QuizSettings).perQuestionSeconds = Number(timer.value);
      });
      this.settings.perQuestionSeconds = Number(timer.value);
    });

    $id<HTMLInputElement>('teams-input').addEventListener('change', (e) => {
      const next = (e.target as HTMLInputElement).checked;
      void this.sdk.settings.update((draft) => {
        (draft as QuizSettings).useTeams = next;
      });
      this.settings.useTeams = next;
      toast(
        next
          ? 'Teams ON — next new player will auto-join the smallest team.'
          : 'Teams OFF.',
        'inf',
      );
      this.sandbox.updateSidebar();
      this.renderRosterPreview();
    });

    $id<HTMLInputElement>('leaderboard-input').addEventListener('change', (e) => {
      const next = (e.target as HTMLInputElement).checked;
      void this.sdk.settings.update((draft) => {
        (draft as QuizSettings).showLeaderboard = next;
      });
      this.settings.showLeaderboard = next;
    });

    $id('btn-start').addEventListener('click', () => void this.startGame());
    this.renderRosterPreview();
  }

  private renderRosterPreview(): void {
    const el = $id('host-roster');
    if (!el) return;
    const players = this.sandbox.players.filter((p) => p.connected);
    if (players.length === 0) {
      el.innerHTML = `<span class="text-muted">No players yet — add some from the toolbar.</span>`;
      return;
    }
    el.innerHTML = players
      .map(
        (p) => `
      <span class="roster-chip">
        <span class="avatar">${esc(p.profile.emoji ?? '🙂')}</span>
        <span class="roster-name">${esc(p.profile.name)}</span>
        ${p.profile.teamId ? teamChip(p.profile.teamId) : ''}
      </span>`,
      )
      .join('');
  }

  // ── Synchronizing + playing ─────────────────────────────────────────

  private async startGame(): Promise<void> {
    if (this.connectedCount() < 1) {
      toast('Add at least one player first.', 'err');
      return;
    }
    log('Teacher pressed Start — roomHostReady() + advance to synchronizing', 'host');
    await this.sdk.settings.set(this.settings);
    await this.sdk.room.hostReady();
    this.hub.advancePhase('synchronizing');

    // Give each connected player ~1.5s to "load" before auto-advancing.
    this.scheduleAdvance(1500 + this.connectedCount() * 400, () => {
      log(
        `${this.readyPlayers.size}/${this.connectedCount()} players ready — calling room.startGame()`,
        'host',
      );
      void this.sdk.room.startGame();
    });
  }

  private renderSynchronizing(): void {
    this.body.innerHTML = `
      <div class="host-sync">
        <div class="sync-spinner" aria-hidden="true"></div>
        <div class="sync-title">Synchronizing players…</div>
        <div class="sync-sub">
          Waiting for every client to finish loading. The host will auto-start
          once everyone is ready (or after a short grace timeout).
        </div>
        <div class="sync-roster" id="sync-roster"></div>
      </div>`;
    this.renderSyncRoster();
  }

  private renderSyncRoster(): void {
    const el = $id('sync-roster');
    if (!el) return;
    const players = this.sandbox.players.filter((p) => p.connected);
    el.innerHTML = players
      .map((p) => {
        const ready = this.readyPlayers.has(p.profile.id);
        return `
          <div class="sync-row ${ready ? 'ready' : ''}">
            <span class="avatar">${esc(p.profile.emoji ?? '🙂')}</span>
            <span class="roster-name">${esc(p.profile.name)}</span>
            <span class="sync-status">${ready ? '✅ ready' : '⏳ loading…'}</span>
          </div>`;
      })
      .join('');
  }

  private async seedInitialState(): Promise<void> {
    const s = this.settings;
    const connected = this.sandbox.players.filter((p) => p.connected);
    const scores: Record<string, number> = {};
    for (const p of connected) scores[p.profile.id] = 0;

    const teamScores: Record<string, number> = {};
    if (s.useTeams) for (const t of TEAMS) teamScores[t.id] = 0;

    const seed: QuizState = {
      phase: 'intro',
      totalQuestions: s.questionCount,
      useTeams: s.useTeams,
      teams: s.useTeams ? TEAMS : [],
      question: null,
      currentAnswers: {},
      reveal: null,
      scores,
      teamScores,
      players: connected.map((p) => ({
        id: p.profile.id,
        name: p.profile.name,
        teamId: p.profile.teamId,
        emoji: p.profile.emoji,
      })),
    };

    this.state = seed;
    await this.sdk.host.setState(seed);
    await this.sdk.host.sendEvent('all', { type: 'game_start', data: {} });
  }

  private async startFirstQuestion(): Promise<void> {
    await this.showQuestion(0);
  }

  private async showQuestion(index: number): Promise<void> {
    if (!this.state) return;
    if (index >= this.state.totalQuestions) {
      await this.endGame();
      return;
    }
    const item = SAMPLE_ITEMS[index];
    if (!item) {
      await this.endGame();
      return;
    }

    const view = buildQuestionView(index, item, this.settings.perQuestionSeconds);
    await this.sdk.host.updateState((draft) => {
      draft.phase = 'question';
      draft.question = view;
      draft.currentAnswers = {};
      draft.reveal = null;
    });
    this.state = this.sdk.host.getState() ?? null;
    await this.sdk.host.sendEvent('all', {
      type: 'question',
      data: { index, total: this.state!.totalQuestions },
    });
    this.renderHost();
    this.startCountdown();

    this.scheduleAdvance(this.settings.perQuestionSeconds * 1000, () => {
      void this.revealQuestion('timeout');
    });
  }

  private async handleAnswer(playerId: string, payload: AnswerPayload): Promise<void> {
    if (!this.state || this.state.phase !== 'question' || !this.state.question) return;
    if (this.state.currentAnswers[playerId]) return; // already answered

    const correct = isCorrect(this.state.question, payload);
    await this.sdk.host.updateState((draft) => {
      draft.currentAnswers[playerId] = {
        choiceIndex: payload.choiceIndex ?? null,
        text: payload.text ?? null,
        correct,
        answeredAt: Date.now(),
      };
    });
    const latest = this.sdk.host.getState();
    if (!latest) return;
    this.state = latest;

    // When everyone has answered we can reveal early.
    const connectedIds = this.sandbox.players.filter((p) => p.connected).map((p) => p.profile.id);
    const answeredCount = Object.keys(latest.currentAnswers).length;
    if (answeredCount >= connectedIds.length) {
      this.clearAutoAdvance();
      this.scheduleAdvance(400, () => void this.revealQuestion('everyone_answered'));
    }
    this.renderHost();
  }

  private async revealQuestion(reason: 'timeout' | 'everyone_answered'): Promise<void> {
    if (!this.state || !this.state.question) return;
    this.clearAutoAdvance();
    this.stopCountdown();

    const q = this.state.question;
    const reveal = computeReveal(q);
    const correctByPlayer: Record<string, boolean> = {};

    await this.sdk.host.updateState((draft) => {
      draft.phase = 'reveal';
      draft.reveal = {
        correctIndex: reveal.correctIndex,
        correctText: reveal.correctText,
        perPlayerCorrect: {},
      };
      for (const [pid, ans] of Object.entries(draft.currentAnswers)) {
        draft.reveal.perPlayerCorrect[pid] = ans.correct;
        correctByPlayer[pid] = ans.correct;
        if (ans.correct) {
          draft.scores[pid] = (draft.scores[pid] ?? 0) + 100;
          const player = draft.players.find((p) => p.id === pid);
          if (player?.teamId && draft.useTeams) {
            draft.teamScores[player.teamId] =
              (draft.teamScores[player.teamId] ?? 0) + 100;
          }
        }
      }
    });
    this.state = this.sdk.host.getState() ?? null;

    await this.sdk.host.sendEvent('all', {
      type: 'reveal',
      data: { reason, correctByPlayer, correctText: reveal.correctText },
    });
    log(`Reveal (${reason}) — ${Object.values(correctByPlayer).filter(Boolean).length} correct`, 'host');
    this.renderHost();

    this.startRevealCountdown(NEXT_QUESTION_DELAY_MS);
    this.scheduleAdvance(NEXT_QUESTION_DELAY_MS, () => {
      const latest = this.sdk.host.getState();
      if (!latest) return;
      void this.showQuestion((latest.question?.index ?? -1) + 1);
    });
  }

  private async endGame(): Promise<void> {
    if (!this.state) return;
    this.clearAutoAdvance();
    this.stopCountdown();
    const result: SessionResult = {
      scores: { ...this.state.scores },
      summary: this.state.useTeams ? { teamScores: { ...this.state.teamScores } } : undefined,
    };
    await this.sdk.host.updateState((draft) => {
      draft.phase = 'final';
      draft.question = null;
      draft.reveal = null;
    });
    this.state = this.sdk.host.getState() ?? null;
    await this.sdk.host.endGame(result);
    this.hub.advancePhase('finished');
    this.renderFinal();
  }

  // ── Rendering ────────────────────────────────────────────────────────

  private renderHost(): void {
    if (!this.state) return;
    const phase = this.state.phase;
    if (phase === 'intro') this.renderIntro();
    else if (phase === 'question') this.renderQuestion();
    else if (phase === 'reveal')  this.renderReveal();
    else if (phase === 'final')   this.renderFinal();
  }

  private renderIntro(): void {
    if (!this.state) return;
    this.body.innerHTML = `
      <div class="host-intro">
        <div class="intro-title">Get ready!</div>
        <div class="intro-sub">${this.state.totalQuestions} question${this.state.totalQuestions !== 1 ? 's' : ''} coming up.</div>
        ${this.renderScoreboardHtml()}
      </div>`;
  }

  private renderQuestion(): void {
    if (!this.state || !this.state.question) return;
    const q = this.state.question;
    const answered = Object.keys(this.state.currentAnswers).length;
    const connected = this.connectedCount();

    this.body.innerHTML = `
      <div class="host-question">
        <div class="q-head">
          <div class="q-progress">Question ${q.index + 1} / ${this.state.totalQuestions}</div>
          <div class="q-countdown" id="q-countdown">${this.settings.perQuestionSeconds}s</div>
        </div>
        <div class="q-prompt">${md(q.prompt)}</div>
        ${renderOptionsHtml(q)}
        <div class="q-foot">
          <div class="q-answers-count">
            <span class="dot"></span>
            ${answered}/${connected} answered
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-force-reveal">Force reveal</button>
        </div>
        ${this.renderScoreboardHtml()}
      </div>`;

    $id('btn-force-reveal').addEventListener('click', () => {
      void this.revealQuestion('everyone_answered');
    });
  }

  private renderReveal(): void {
    if (!this.state || !this.state.question || !this.state.reveal) return;
    const q = this.state.question;
    const reveal = this.state.reveal;

    const optionsHtml = q.options.length
      ? q.options
          .map((label, idx) => {
            const correct = reveal.correctIndex === idx;
            return `
              <div class="q-option ${correct ? 'correct' : 'dimmed'}">
                <span class="q-option-letter">${letterFor(idx)}</span>
                <span class="q-option-text">${md(label)}</span>
                ${correct ? '<span class="q-option-badge">✓</span>' : ''}
              </div>`;
          })
          .join('')
      : `<div class="q-option correct">
           <span class="q-option-text">Correct answer: <strong>${esc(reveal.correctText ?? '')}</strong></span>
         </div>`;

    this.body.innerHTML = `
      <div class="host-reveal">
        <div class="q-head">
          <div class="q-progress">Question ${q.index + 1} / ${this.state.totalQuestions}</div>
          <span class="phase-pill phase-play">REVEAL</span>
        </div>
        <div class="q-prompt">${md(q.prompt)}</div>
        <div class="q-options">${optionsHtml}</div>
        <div class="reveal-summary">
          ${Object.entries(reveal.perPlayerCorrect)
            .map(([pid, ok]) => {
              const p = this.state!.players.find((pp) => pp.id === pid);
              return `
                <div class="reveal-player ${ok ? 'ok' : 'err'}">
                  <span class="avatar">${esc(p?.emoji ?? '🙂')}</span>
                  <span>${esc(p?.name ?? pid)}</span>
                  <span class="result">${ok ? '+100' : '—'}</span>
                </div>`;
            })
            .join('')}
        </div>
        <div class="q-foot">
          <div class="q-answers-count">
            <span class="dot"></span>
            Next question in <span id="next-q-countdown">${Math.ceil(NEXT_QUESTION_DELAY_MS / 1000)}s</span>
          </div>
        </div>
        ${this.renderScoreboardHtml()}
      </div>`;
  }

  private renderFinal(): void {
    if (!this.state) return;
    const ranking = Object.entries(this.state.scores)
      .map(([pid, score]) => {
        const p = this.state!.players.find((pp) => pp.id === pid);
        return { id: pid, name: p?.name ?? pid, emoji: p?.emoji ?? '🙂', teamId: p?.teamId, score };
      })
      .sort((a, b) => b.score - a.score);

    const teamHtml = this.state.useTeams
      ? `
        <div class="final-teams">
          <div class="final-teams-title">Team scores</div>
          <div class="final-teams-grid">
            ${TEAMS.map(
              (t) => `
              <div class="final-team" style="--team-color:${t.color ?? '#888'}">
                <div class="final-team-name">${esc(t.name)}</div>
                <div class="final-team-score">${this.state!.teamScores[t.id] ?? 0}</div>
              </div>`,
            ).join('')}
          </div>
        </div>`
      : '';

    this.body.innerHTML = `
      <div class="host-final">
        <div class="final-title">🏆 Final scores</div>
        ${teamHtml}
        <div class="leaderboard final">
          ${ranking
            .map(
              (row, idx) => `
            <div class="lb-row ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}">
              <span class="lb-pos">${idx + 1}</span>
              <span class="avatar">${esc(row.emoji)}</span>
              <span class="lb-name">${esc(row.name)}</span>
              ${row.teamId ? teamChip(row.teamId) : ''}
              <span class="lb-score">${row.score}</span>
            </div>`,
            )
            .join('')}
        </div>
        <div class="final-actions">
          <button type="button" class="btn btn-primary" id="btn-play-again">Play again</button>
        </div>
      </div>`;

    $id('btn-play-again').addEventListener('click', () => {
      void this.sandbox.reset();
    });
  }

  private renderScoreboardHtml(): string {
    if (!this.state) return '';
    const entries = Object.entries(this.state.scores)
      .map(([pid, score]) => {
        const p = this.state!.players.find((pp) => pp.id === pid);
        return { id: pid, name: p?.name ?? pid, emoji: p?.emoji ?? '🙂', teamId: p?.teamId, score };
      })
      .sort((a, b) => b.score - a.score);

    return `
      <div class="leaderboard live">
        <div class="leaderboard-title">Live leaderboard</div>
        ${entries
          .map(
            (row) => `
          <div class="lb-row">
            <span class="avatar">${esc(row.emoji)}</span>
            <span class="lb-name">${esc(row.name)}</span>
            ${row.teamId ? teamChip(row.teamId) : ''}
            <span class="lb-score">${row.score}</span>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  // ── Countdown + scheduling ──────────────────────────────────────────

  private startCountdown(): void {
    this.stopCountdown();
    const endsAt = Date.now() + this.settings.perQuestionSeconds * 1000;
    this.tickHandle = setInterval(() => {
      const el = document.getElementById('q-countdown');
      if (!el) return;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      el.textContent = `${remaining}s`;
    }, 200);
  }

  private startRevealCountdown(durationMs: number): void {
    this.stopCountdown();
    const endsAt = Date.now() + durationMs;
    this.tickHandle = setInterval(() => {
      const el = document.getElementById('next-q-countdown');
      if (!el) return;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      el.textContent = `${remaining}s`;
    }, 200);
  }

  private stopCountdown(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  private scheduleAdvance(ms: number, fn: () => void): void {
    this.clearAutoAdvance();
    this.autoAdvanceHandle = setTimeout(fn, ms);
  }

  private clearAutoAdvance(): void {
    if (this.autoAdvanceHandle) clearTimeout(this.autoAdvanceHandle);
    this.autoAdvanceHandle = null;
  }

  private clearTimers(): void {
    this.clearAutoAdvance();
    this.stopCountdown();
  }

  private connectedCount(): number {
    return this.sandbox.players.filter((p) => p.connected).length;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATION — one SDK instance per player card
// ═══════════════════════════════════════════════════════════════════════════

async function createPlayerStation(
  sandbox: Sandbox,
  profile: MultiPlayer & { emoji?: string },
  rootEl: HTMLElement,
): Promise<PlayerStation> {
  const sdk = new MemizyMultiplayerSDK<QuizState>({
    id: 'com.memizy.example.multiplayer-quiz',
    version: '1.0.0',
    debug: false,
  });

  const station: PlayerStation = {
    profile,
    sdk,
    rootEl,
    connected: true,
  };

  const body = () => rootEl.querySelector('.player-body') as HTMLElement;
  const phasePill = () => rootEl.querySelector('.phase-pill') as HTMLElement;

  sdk.onInit((init) => {
    log(
      `player[${profile.id}].onInit — role=${init.role} phase=${init.phase}`,
      'player',
    );
    renderSync(body(), profile, init.phase);
    updatePhasePill(phasePill(), init.phase);
    // Auto-advance: signal clientReady after a tiny "loading" delay.
    if (init.phase !== 'host-settings') {
      setTimeout(() => {
        void sdk.room.clientReady();
        log(`player[${profile.id}] -> room.clientReady()`, 'player');
      }, 600 + Math.random() * 600);
    }
  });

  sdk.onPhaseChange((phase) => {
    updatePhasePill(phasePill(), phase);
    if (phase === 'synchronizing') {
      renderSync(body(), profile, phase);
      setTimeout(() => {
        void sdk.room.clientReady();
        log(`player[${profile.id}] -> room.clientReady()`, 'player');
      }, 400 + Math.random() * 800);
    } else if (phase === 'playing') {
      renderWaitingForState(body(), profile);
    } else if (phase === 'finished') {
      // Final UI is pushed via onGameEnd.
    }
  });

  sdk.onState((state, meta) => {
    if (!state) return;
    renderPlayerByState(body(), station, state);
    if (meta.reason !== 'initial') {
      // Optional: animate patches, omitted for brevity.
    }
  });

  sdk.onEvent((event: GameEvent) => {
    log(`player[${profile.id}].onEvent ${event.type}`, 'player');
    if (event.type === 'late_join_welcome') {
      toast(`${profile.name} joined late.`, 'inf');
    } else if (event.type === 'reconnect_welcome') {
      toast(`${profile.name} reconnected.`, 'inf');
    } else if (event.type === 'reveal') {
      const data = event.data as { correctByPlayer?: Record<string, boolean> } | undefined;
      const mine = data?.correctByPlayer?.[profile.id];
      if (mine === true) spawnConfetti();
    }
  });

  sdk.onGameEnd((result) => {
    renderPlayerFinal(body(), profile, result);
    updatePhasePill(phasePill(), 'finished');
  });

  const phase =
    sandbox.host.currentPhase === 'playing' ? 'playing' : 'synchronizing';

  await sdk.connect({
    mode: 'standalone',
    mockHub: sandbox.hub,
    standalone: {
      role: 'player',
      pin: LOBBY_PIN,
      phase,
      items: SAMPLE_ITEMS,
      setMeta: SAMPLE_SET_META,
      players: [],
      teams: TEAMS,
      supportsTeams: true,
      supportsLateJoin: true,
      supportsReconnect: true,
      capacity: { min: 2, max: 20, recommended: 6 },
      settings: sandbox.host.settings,
      self: profile,
    },
  });

  return station;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER RENDERING
// ═══════════════════════════════════════════════════════════════════════════

function updatePhasePill(el: HTMLElement, phase: GamePhase): void {
  el.textContent = phase === 'host-settings' ? 'LOBBY'
    : phase === 'synchronizing'   ? 'SYNCING'
    : phase === 'playing'         ? 'PLAYING'
    :                               'ENDED';
  el.className = `phase-pill ${phaseClass(phase)}`;
}

function renderSync(
  body: HTMLElement,
  profile: MultiPlayer & { emoji?: string },
  phase: GamePhase,
): void {
  body.innerHTML = `
    <div class="player-screen">
      <div class="big-icon">${phase === 'host-settings' ? '🛋️' : '⏳'}</div>
      <div class="player-screen-title">
        ${
          phase === 'host-settings'
            ? 'Waiting in the lobby'
            : 'Loading quiz…'
        }
      </div>
      <div class="player-screen-sub">
        ${
          phase === 'host-settings'
            ? 'The teacher is configuring the game.'
            : 'Calling <code>sdk.room.clientReady()</code> when ready.'
        }
      </div>
      ${profile.teamId ? `<div class="player-team">${teamChip(profile.teamId)}</div>` : ''}
    </div>`;
}

function renderWaitingForState(
  body: HTMLElement,
  profile: MultiPlayer & { emoji?: string },
): void {
  body.innerHTML = `
    <div class="player-screen">
      <div class="big-icon">🎬</div>
      <div class="player-screen-title">Game starting…</div>
      <div class="player-screen-sub">
        Waiting for the first authoritative state snapshot.
      </div>
      ${profile.teamId ? `<div class="player-team">${teamChip(profile.teamId)}</div>` : ''}
    </div>`;
}

function renderPlayerByState(
  body: HTMLElement,
  station: PlayerStation,
  state: QuizState,
): void {
  if (state.phase === 'intro') {
    renderWaitingForState(body, station.profile);
    return;
  }
  if (state.phase === 'final') {
    // The authoritative `onGameEnd` will overwrite this; render a
    // placeholder in case it arrives later.
    body.innerHTML = `
      <div class="player-screen">
        <div class="big-icon">🏁</div>
        <div class="player-screen-title">Finishing up…</div>
      </div>`;
    return;
  }

  const q = state.question;
  if (!q) return;

  if (state.phase === 'question') {
    renderPlayerQuestion(body, station, state, q);
  } else if (state.phase === 'reveal') {
    renderPlayerReveal(body, station, state, q);
  }
}

function renderPlayerQuestion(
  body: HTMLElement,
  station: PlayerStation,
  state: QuizState,
  q: QuestionView,
): void {
  const alreadyAnswered = state.currentAnswers[station.profile.id];
  const leaderboard = state.scores[station.profile.id] ?? 0;

  const optionsHtml = q.options.length
    ? q.options
        .map(
          (label, idx) => `
          <button type="button" class="player-option" data-idx="${idx}"
                  ${alreadyAnswered ? 'disabled' : ''}>
            <span class="q-option-letter">${letterFor(idx)}</span>
            <span class="q-option-text">${md(label)}</span>
          </button>`,
        )
        .join('')
    : `
        <div class="player-free">
          <input type="text" class="form-input" id="player-free-input-${station.profile.id}"
                 placeholder="Type your answer…" ${alreadyAnswered ? 'disabled' : ''} />
          <button type="button" class="btn btn-primary" id="player-free-submit-${station.profile.id}"
                  ${alreadyAnswered ? 'disabled' : ''}>Submit</button>
        </div>`;

  body.innerHTML = `
    <div class="player-screen question">
      <div class="player-q-head">
        <span class="player-q-pos">Q${q.index + 1}/${state.totalQuestions}</span>
        <span class="player-q-score">Score: ${leaderboard}</span>
      </div>
      <div class="player-q-prompt">${md(q.prompt)}</div>
      <div class="player-options">${optionsHtml}</div>
      ${alreadyAnswered ? '<div class="player-waiting">Waiting for other players…</div>' : ''}
    </div>`;

  if (!alreadyAnswered) {
    body.querySelectorAll<HTMLButtonElement>('.player-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset['idx']);
        void station.sdk.player.sendAction('answer', {
          questionId: q.id,
          choiceIndex: idx,
          text: null,
        } satisfies AnswerPayload);
        log(`player[${station.profile.id}] -> sendAction(answer idx=${idx})`, 'player');
      });
    });

    const input = document.getElementById(`player-free-input-${station.profile.id}`) as
      | HTMLInputElement
      | null;
    const submit = document.getElementById(`player-free-submit-${station.profile.id}`) as
      | HTMLButtonElement
      | null;
    if (input && submit) {
      const go = () => {
        if (!input.value.trim()) return;
        void station.sdk.player.sendAction('answer', {
          questionId: q.id,
          choiceIndex: null,
          text: input.value.trim(),
        } satisfies AnswerPayload);
        log(`player[${station.profile.id}] -> sendAction(answer text="${input.value.trim()}")`, 'player');
      };
      submit.addEventListener('click', go);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go();
      });
    }
  }
}

function renderPlayerReveal(
  body: HTMLElement,
  station: PlayerStation,
  state: QuizState,
  q: QuestionView,
): void {
  const reveal = state.reveal;
  const mine = state.currentAnswers[station.profile.id];
  const iWasRight = Boolean(mine?.correct);

  const optionsHtml = q.options.length
    ? q.options
        .map((label, idx) => {
          const isCorrect = reveal?.correctIndex === idx;
          const mineIdx   = mine?.choiceIndex;
          const iChose   = mineIdx === idx;
          const cls      = isCorrect ? 'correct' : iChose ? 'wrong' : 'dimmed';
          return `
            <div class="player-option ${cls}">
              <span class="q-option-letter">${letterFor(idx)}</span>
              <span class="q-option-text">${md(label)}</span>
              ${isCorrect ? '<span class="q-option-badge">✓</span>' : ''}
            </div>`;
        })
        .join('')
    : `<div class="player-option correct">
         <span class="q-option-text">
           Correct answer: <strong>${esc(reveal?.correctText ?? '')}</strong>
         </span>
       </div>`;

  body.innerHTML = `
    <div class="player-screen reveal ${iWasRight ? 'ok' : 'err'}">
      <div class="player-q-head">
        <span class="player-q-pos">Q${q.index + 1}/${state.totalQuestions}</span>
        <span class="player-q-score">Score: ${state.scores[station.profile.id] ?? 0}</span>
      </div>
      <div class="player-q-prompt">${md(q.prompt)}</div>
      <div class="player-options">${optionsHtml}</div>
      <div class="player-verdict ${iWasRight ? 'ok' : 'err'}">
        ${mine ? (iWasRight ? '🎉 Correct · +100' : '❌ Not quite') : '⏱ No answer'}
      </div>
    </div>`;
}

function renderPlayerFinal(
  body: HTMLElement,
  profile: MultiPlayer & { emoji?: string },
  result: SessionResult,
): void {
  const sorted = Object.entries(result.scores).sort((a, b) => b[1] - a[1]);
  const rank = sorted.findIndex(([pid]) => pid === profile.id) + 1;
  const myScore = result.scores[profile.id] ?? 0;

  body.innerHTML = `
    <div class="player-screen final">
      <div class="big-icon">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎉'}</div>
      <div class="player-screen-title">Game over</div>
      <div class="player-screen-sub">
        You finished <strong>#${rank || '—'}</strong> with <strong>${myScore}</strong> points.
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

interface AnswerPayload {
  questionId: string;
  choiceIndex: number | null;
  text: string | null;
}

function buildQuestionView(
  index: number,
  item: OQSEItem,
  perQuestionSeconds: number,
): QuestionView {
  const deadlineAt = Date.now() + perQuestionSeconds * 1000;
  if (isMCQSingle(item)) {
    return {
      index,
      id: item.id,
      kind: 'mcq-single',
      prompt: item.question,
      options: [...item.options],
      deadlineAt,
    };
  }
  if (isTrueFalse(item)) {
    return {
      index,
      id: item.id,
      kind: 'true-false',
      prompt: item.question,
      options: ['True', 'False'],
      deadlineAt,
    };
  }
  if (isShortAnswer(item)) {
    return {
      index,
      id: item.id,
      kind: 'short-answer',
      prompt: item.question,
      options: [],
      deadlineAt,
    };
  }
  // Fallback: treat unknown items as a short-answer with a blank list.
  return {
    index,
    id: item.id,
    kind: 'short-answer',
    prompt: (item as { question?: string }).question ?? '(Unsupported item)',
    options: [],
    deadlineAt,
  };
}

function isCorrect(q: QuestionView, payload: AnswerPayload): boolean {
  const item = SAMPLE_ITEMS.find((i) => i.id === q.id);
  if (!item) return false;
  if (isMCQSingle(item)) {
    return payload.choiceIndex === item.correctIndex;
  }
  if (isTrueFalse(item)) {
    // options[0] = 'True', options[1] = 'False'
    const picked = payload.choiceIndex === 0;
    return picked === item.answer;
  }
  if (isShortAnswer(item)) {
    const user = (payload.text ?? '').trim();
    const norm = (s: string) =>
      item.caseSensitive === true ? s : s.toLowerCase();
    return item.answers.some((a) => norm(a.trim()) === norm(user));
  }
  return false;
}

function computeReveal(q: QuestionView): {
  correctIndex: number | null;
  correctText: string | null;
} {
  const item = SAMPLE_ITEMS.find((i) => i.id === q.id);
  if (!item) return { correctIndex: null, correctText: null };
  if (isMCQSingle(item)) {
    return { correctIndex: item.correctIndex, correctText: item.options[item.correctIndex] ?? null };
  }
  if (isTrueFalse(item)) {
    return { correctIndex: item.answer ? 0 : 1, correctText: item.answer ? 'True' : 'False' };
  }
  if (isShortAnswer(item)) {
    return { correctIndex: null, correctText: item.answers[0] ?? null };
  }
  return { correctIndex: null, correctText: null };
}

function renderOptionsHtml(q: QuestionView): string {
  if (q.options.length === 0) {
    return `<div class="q-options free">
              <div class="q-free-hint">Players type a free-form answer on their device.</div>
            </div>`;
  }
  return `<div class="q-options">
    ${q.options
      .map(
        (label, idx) => `
      <div class="q-option">
        <span class="q-option-letter">${letterFor(idx)}</span>
        <span class="q-option-text">${md(label)}</span>
      </div>`,
      )
      .join('')}
  </div>`;
}

function letterFor(idx: number): string {
  return String.fromCharCode(65 + idx);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI (pure DOM, no dependency)
// ═══════════════════════════════════════════════════════════════════════════

function spawnConfetti(): void {
  const layer = $id('confetti-layer');
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
  for (let i = 0; i < 16; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length]!;
    piece.style.animationDelay = `${Math.random() * 0.2}s`;
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 1800);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════

const sandbox = new Sandbox();
void (async () => {
  log('Sandbox booting…', 'sys');
  await sandbox.bootstrap();

  $id('btn-reset').addEventListener('click', () => void sandbox.reset());
  $id('btn-add-player').addEventListener('click', () => void sandbox.addPlayer());
  $id('btn-remove-player').addEventListener('click', () => void sandbox.removeLastPlayer());
  $id('btn-disconnect').addEventListener('click', () => void sandbox.disconnectLastPlayer());
  $id('btn-reconnect').addEventListener('click', () => void sandbox.reconnectLastPlayer());
  $id('btn-late-join').addEventListener('click', () => void sandbox.simulateLateJoin());
  $id('btn-clear-log').addEventListener('click', () => {
    $id('log-panel').innerHTML = '';
    log('Log cleared.', 'sys');
  });

  log('Sandbox ready.', 'ok');
})();
