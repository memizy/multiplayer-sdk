/**
 * Memizy Multiplayer SDK v0.4 — Minimal example.
 *
 * The smallest possible file that exercises the full
 * `host-settings → synchronizing → playing → finished` cycle.
 *
 * What it shows:
 *   - Two `MemizyMultiplayerSDK` instances (host + player) sharing a
 *     single `MemoryMockHub`.
 *   - `sdk.room.startGame()` as the trigger from settings to playing.
 *   - `sdk.host.setState()` + `sdk.host.updateState()` producing
 *     automatic full-state / JSON-patch broadcasts.
 *   - `sdk.player.sendAction()` + `sdk.player.onStateChange()` echoing
 *     player intents back through the host.
 *   - `sdk.host.endGame()` → `sdk.player.onGameEnd()`.
 *
 * Every outbound and inbound RPC is printed to the log pane on the
 * page, so you can follow the full wire-level sequence in real time.
 */

import {
  MemizyMultiplayerSDK,
  MemoryMockHub,
  type InitSessionPayload,
  type MultiPlayer,
} from '@memizy/multiplayer-sdk';

// ── State shape ───────────────────────────────────────────────────────────

interface MinimalState {
  round: number;
  totalRounds: number;
  buzzes: Array<{ playerId: string; at: number }>;
  winner: string | null;
}

// ── DOM helpers ───────────────────────────────────────────────────────────

const logEl = document.getElementById('mini-log') as HTMLElement;

function log(kind: 'host' | 'player' | 'sys', msg: string): void {
  const line = document.createElement('div');
  line.className = `log-line log-${kind}`;
  const ts = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="log-ts">${ts}</span><span class="log-tag log-tag-${kind}">${
    kind === 'host' ? 'HOST' : kind === 'player' ? 'PLAYER' : 'SYS'
  }</span><span class="log-msg">${escape(msg)}</span>`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ── Boot ──────────────────────────────────────────────────────────────────

const hub = new MemoryMockHub();

const hostSdk = new MemizyMultiplayerSDK<MinimalState>({
  id: 'com.memizy.example.multiplayer-minimal',
  version: '1.0.0',
});

const playerProfile: MultiPlayer = {
  id: 'alice',
  name: 'Alice',
  joinedAt: Date.now(),
};

const playerSdk = new MemizyMultiplayerSDK<MinimalState>({
  id: 'com.memizy.example.multiplayer-minimal',
  version: '1.0.0',
});

void (async () => {
  log('sys', 'Booting minimal sandbox…');

  // ── Host lifecycle ─────────────────────────────────────────────────────
  hostSdk.onInit((init: InitSessionPayload) => {
    log('host', `onInit — phase=${init.phase} role=${init.role} pin=${init.pin}`);
  });

  hostSdk.onPlayerJoin((p, meta) =>
    log('host', `onPlayerJoin ${p.id} reconnect=${meta.isReconnect}`),
  );

  hostSdk.onPlayerReady((pid) =>
    log('host', `onPlayerReady ${pid}`),
  );

  hostSdk.onPlayerAction(async (pid, action) => {
    log('host', `onPlayerAction ${pid} → ${action.type}`);
    if (action.type === 'buzz' && hostSdk.currentPhase === 'playing') {
      await hostSdk.host.updateState((draft) => {
        draft.buzzes.push({ playerId: pid, at: Date.now() });
        if (!draft.winner) draft.winner = pid;
      });
      await hostSdk.host.sendEvent('all', {
        type: 'buzzed',
        data: { playerId: pid },
      });
    }
  });

  hostSdk.onPhaseChange(async (phase) => {
    log('host', `onPhaseChange → ${phase}`);
    setText('mini-phase', phase);
    if (phase === 'playing') {
      await hostSdk.host.setState({
        round: 1,
        totalRounds: 1,
        buzzes: [],
        winner: null,
      });
    }
  });

  await hostSdk.connect({
    mode: 'standalone',
    mockHub: hub,
    standalone: {
      role: 'host',
      pin: '000000',
      phase: 'host-settings',
      items: [],
      players: [],
      teams: [],
      supportsLateJoin: true,
      supportsReconnect: true,
      capacity: { min: 1, max: 10, recommended: 1 },
      settings: { rounds: 1 },
    },
  });

  // ── Player lifecycle ───────────────────────────────────────────────────
  playerSdk.onInit((init) => {
    log('player', `onInit — phase=${init.phase} role=${init.role}`);
    if (init.phase === 'synchronizing' || init.phase === 'playing') {
      void playerSdk.room.clientReady();
      log('player', '→ room.clientReady()');
    }
  });

  playerSdk.onPhaseChange(async (phase) => {
    log('player', `onPhaseChange → ${phase}`);
    if (phase === 'synchronizing' || phase === 'playing') {
      await playerSdk.room.clientReady();
      log('player', '→ room.clientReady()');
    }
  });

  playerSdk.onState((state, meta) => {
    log('player', `onState (${meta.reason}) — winner=${state?.winner ?? '—'} buzzes=${state?.buzzes.length ?? 0}`);
    setText('mini-state', JSON.stringify(state, null, 2));
  });

  playerSdk.onEvent((event) =>
    log('player', `onEvent ${event.type} ${JSON.stringify(event.data ?? {})}`),
  );

  playerSdk.onGameEnd((result) => {
    log('player', `onGameEnd scores=${JSON.stringify(result.scores)}`);
    setText('mini-phase', 'finished');
  });

  await playerSdk.connect({
    mode: 'standalone',
    mockHub: hub,
    standalone: {
      role: 'player',
      pin: '000000',
      phase: 'synchronizing',
      items: [],
      players: [],
      teams: [],
      supportsLateJoin: true,
      supportsReconnect: true,
      capacity: { min: 1, max: 10, recommended: 1 },
      settings: { rounds: 1 },
      self: playerProfile,
    },
  });

  log('sys', 'Both SDKs connected.');
  setText('mini-phase', hostSdk.currentPhase ?? '—');

  // ── UI buttons ─────────────────────────────────────────────────────────
  const btnStart = document.getElementById('mini-btn-start') as HTMLButtonElement;
  const btnBuzz  = document.getElementById('mini-btn-buzz')  as HTMLButtonElement;
  const btnEnd   = document.getElementById('mini-btn-end')   as HTMLButtonElement;

  btnStart.addEventListener('click', async () => {
    await hostSdk.settings.set({ rounds: 1 });
    await hostSdk.room.hostReady();
    log('host', '→ room.hostReady()');
    hub.advancePhase('synchronizing');
    setTimeout(async () => {
      await hostSdk.room.startGame();
      log('host', '→ room.startGame()');
    }, 500);
  });

  btnBuzz.addEventListener('click', async () => {
    await playerSdk.player.sendAction('buzz');
    log('player', '→ sendAction(buzz)');
  });

  btnEnd.addEventListener('click', async () => {
    if (hostSdk.currentPhase !== 'playing') return;
    const state = hostSdk.host.getState();
    await hostSdk.host.endGame({
      scores: { [playerProfile.id]: state?.winner === playerProfile.id ? 100 : 0 },
    });
    log('host', '→ endGame()');
    hub.advancePhase('finished');
  });
})();
