# Plugin Developer Guide

> A complete walkthrough of `@memizy/multiplayer-sdk` from a plugin author's
> point of view. If you want to understand the wire protocol instead, see
> [`host-protocol.md`](./host-protocol.md).

---

## Table of contents

1. [Mental model](#mental-model)
2. [Installation & first connection](#installation--first-connection)
3. [The lifecycle: phases, roles, run modes](#the-lifecycle-phases-roles-run-modes)
4. [`sdk.sys` — system plumbing](#sdksys--system-plumbing)
5. [`sdk.room` — lobby, roster, teams, synchronization](#sdkroom--lobby-roster-teams-synchronization)
6. [`sdk.settings` — authoring in `host-settings`](#sdksettings--authoring-in-host-settings)
7. [`sdk.host` — authoritative gameplay (host role)](#sdkhost--authoritative-gameplay-host-role)
8. [`sdk.player` — player gameplay (player role)](#sdkplayer--player-gameplay-player-role)
9. [`sdk.text` — OQSE rich text rendering](#sdktext--oqse-rich-text-rendering)
10. [Lifecycle callbacks](#lifecycle-callbacks)
11. [Late join, reconnect, and disconnect handling](#late-join-reconnect-and-disconnect-handling)
12. [Teams](#teams)
13. [Error taxonomy](#error-taxonomy)
14. [Standalone mode (local development)](#standalone-mode-local-development)
15. [Manifest configuration](#manifest-configuration)
16. [A complete walkthrough: Quiz plugin](#a-complete-walkthrough-quiz-plugin)

---

## Mental model

A Memizy multiplayer plugin is a **single HTML bundle** that runs inside an
iframe managed by the Memizy Host application. The exact same bundle is
instantiated twice (with different roles):

- **Host role** — one projector / teacher device. Owns authoritative game
  state, seeds the initial round, validates player actions, and declares the
  winner.
- **Player role** — one per participant. Renders the controller UI, submits
  intents (answers, buzzes, picks) to the host plugin and mirrors the
  authoritative state broadcast from the host.

The SDK exposes **six namespaced managers** that map 1:1 onto the protocol
domains of the host ↔ plugin RPC:

| Manager        | Role(s)        | Purpose                                     |
| -------------- | -------------- | ------------------------------------------- |
| `sdk.sys`      | host & player  | Resize, report errors, exit.                |
| `sdk.room`     | host & player  | Roster, teams, sync signals.                |
| `sdk.settings` | host only      | Author settings during `host-settings`.     |
| `sdk.host`     | host only      | Authoritative state & events.               |
| `sdk.player`   | player only    | Intents and state mirroring.                |
| `sdk.text`     | host & player  | Render OQSE rich text safely.               |

The SDK **enforces** these role boundaries — calling `sdk.host.*` from a
player plugin throws `SdkRoleError` immediately, not silently on the wire.

---

## Installation & first connection

Install the SDK:

```bash
npm install @memizy/multiplayer-sdk
```

Create an SDK instance, register lifecycle handlers, then `await sdk.connect()`.
`connect()` performs the Penpal handshake with the Host application and
resolves with the **initial session payload** — everything the plugin needs
to render the first frame (items, assets, roster, teams, settings, phase,
role, …).
During this `connect()` handshake, the SDK automatically sends
`PluginIdentity.sdkVersion` (the package version) and `protocol` to the host.

```ts
import { MemizyMultiplayerSDK } from '@memizy/multiplayer-sdk';

const sdk = new MemizyMultiplayerSDK({
  id: 'com.example.quiz',
  version: '1.0.0',
  debug: true,
});

sdk.onInit(async (init) => {
  console.log(`role=${init.role} phase=${init.phase} pin=${init.pin}`);
});

await sdk.connect();
```

The SDK auto-detects the runtime:

- Embedded (`window.parent !== window.self`) → iframe mode → Penpal
  handshake against the parent window.
- Opened directly (stand-alone) → in-memory `MockHost` backed by the seed
  data you pass to `connect({ standalone: { … } })`.

### Constructor options

```ts
interface MemizyMultiplayerSDKOptions {
  /** Unique plugin id (usually the manifest `id`). */
  id: string;
  /** Plugin version (semver). */
  version: string;
  /** Minimum protocol version. Defaults to `'0.4'`. */
  protocol?: string;
  /** Accepted parent origins. Defaults to `['*']`; tighten in prod. */
  allowedOrigins?: (string | RegExp)[];
  /** Penpal handshake timeout in ms. Defaults to `10_000`. */
  handshakeTimeout?: number;
  /** Log lifecycle events. */
  debug?: boolean;
}
```

### The init payload

Everything you need to render the first frame lives in
`InitSessionPayload`. Destructure what you need:

```ts
sdk.onInit((init) => {
  const { role, phase, players, settings, items, assets, capacity } = init;

  if (init.role === 'player') {
    const me = init.self;            // your MultiPlayer record
    const lateJoin = init.gameState; // defined for late-joiners
  }
});
```

Field-by-field breakdown is documented in [`host-protocol.md`](./host-protocol.md#init-session-payload).

---

## The lifecycle: phases, roles, run modes

### Phases

Every session moves through a forward-only state machine:

```
host-settings ──► synchronizing ──► playing ──► finished
```

| Phase            | Who is alive          | What happens                                                   |
| ---------------- | --------------------- | -------------------------------------------------------------- |
| `host-settings`  | Host plugin only      | Teacher configures the game. Plugin authors settings.          |
| `synchronizing`  | Host + players        | Plugin loads on every device; all clients report readiness.    |
| `playing`        | Host + players        | Authoritative gameplay: state broadcasts, actions, events.     |
| `finished`       | Host + players        | Final leaderboard / recap.                                     |

Subscribe with `sdk.onPhaseChange((phase) => …)` to switch UI screens.

### Roles

```ts
type PluginRole = 'host' | 'player';
```

Check `init.role` in `onInit` to branch behaviour. Accessing a wrong-role
manager throws `SdkRoleError`:

```ts
if (init.role === 'host') {
  await sdk.settings.update(/* ... */);   // ✓ allowed
}

// Later, inside player code:
await sdk.host.setState(/* ... */);       // ✗ throws SdkRoleError
```

### Run modes

The host app exposes a secondary, finer-grained classification you rarely
need directly:

```ts
type RunMode = 'host-settings' | 'host-game' | 'client-game';
```

It's mainly useful for hosts that want to render very different UIs during
`host-settings` vs. `host-game` without tracking `phase` manually.

---

## `sdk.sys` — system plumbing

Plumbing available to every plugin regardless of role.

```ts
// Ask the host to resize the iframe. 'auto' means "use my intrinsic height".
await sdk.sys.requestResize('auto');
await sdk.sys.requestResize(720, 1080);

// Log a non-fatal error for host-side telemetry.
await sdk.sys.reportError('render_failed', 'Could not render item', {
  itemId,
});

// Voluntarily close the plugin instance (e.g. user pressed Leave).
await sdk.sys.exit();

// Elapsed time since sysReady() resolved (ms).
console.log(sdk.sys.elapsedMs);
```

---

## `sdk.room` — lobby, roster, teams, synchronization

Snapshot accessors (safe to call any time after `connect()`):

```ts
sdk.room.pin               // '123456'
sdk.room.role              // 'host' | 'player'
sdk.room.self              // MultiPlayer | null (always null for hosts)
sdk.room.getPlayers()      // MultiPlayer[]  (shallow copy)
sdk.room.getPlayer(id)     // MultiPlayer | undefined
sdk.room.getTeams()        // TeamInfo[]
sdk.room.getPlayersInTeam(teamId)
sdk.room.supportsTeams     // boolean
sdk.room.supportsLateJoin  // boolean
sdk.room.supportsReconnect // boolean
sdk.room.capacity          // { min, max, recommended? }
```

Synchronization signals:

```ts
// Player: tell the host "my UI is live, I can play."
await sdk.room.clientReady();

// Host: tell the host app "I finished init; give me the Start command."
await sdk.room.hostReady();

// Host: promote the session to 'playing' (triggers onPhaseChange for all).
await sdk.room.startGame();
```

The SDK automatically keeps `sdk.room.getPlayers()` up to date when the
host fires `onPlayerJoin` / `onPlayerLeave`.

---

## `sdk.settings` — authoring in `host-settings`

During `host-settings` the teacher configures the game through your plugin's
UI. The `sdk.settings` manager holds a local snapshot and forwards
incremental **JSON patches** to the host via `mutative`. This is identical
in feel to single-player's `StoreManager.update(recipe)`.

```ts
interface QuizSettings {
  roundTimeSec: number;
  shuffleQuestions: boolean;
  categories: string[];
  leaderboardSize: 5 | 10 | 20;
}

sdk.onInit((init) => {
  if (init.role !== 'host') return;

  // Pre-fill safe defaults on first load.
  sdk.settings.update((draft) => {
    (draft as QuizSettings).roundTimeSec ??= 15;
    (draft as QuizSettings).shuffleQuestions ??= true;
    (draft as QuizSettings).categories ??= [];
    (draft as QuizSettings).leaderboardSize ??= 10;
  });

  // Enable the "Start game" button only once the form is valid.
  sdk.settings.setValid((sdk.settings.get() as QuizSettings).categories.length > 0);
});
```

API surface:

```ts
// Structured-cloned snapshot.
const current = sdk.settings.get() as QuizSettings;

// Full replacement (e.g. loading a preset). Emits settings:replace.
await sdk.settings.set({ ...preset });

// Incremental update. Emits settings:patch with minimal diff.
await sdk.settings.update((draft) => {
  (draft as QuizSettings).roundTimeSec = 20;
  (draft as QuizSettings).categories.push('history');
});

// Gate the Start button in the host shell.
await sdk.settings.setValid(isValid);
console.log(sdk.settings.valid);
```

**Players** see `sdk.settings.get()` as a read-only snapshot of what the
teacher confirmed when they pressed Start. Any mutating call from the
player role throws `SdkRoleError`.

---

## `sdk.host` — authoritative gameplay (host role)

The host plugin owns the canonical game state. The recommended pattern is:

1. Seed the state with `sdk.host.setState(state)` once in
   `onStartGameRequested` (or when entering `playing`).
2. Mutate it with `sdk.host.updateState(recipe)` — mutative generates the
   minimal JSON patch.
3. For late-joiners or reconnects, push the current state to *only* that
   player via `sdk.host.sendStateTo(playerId)`.

```ts
interface QuizState {
  currentIndex: number;
  remainingMs: number;
  revealed: boolean;
  scores: Record<string, number>;      // playerId → points
}

sdk.onStartGameRequested(async () => {
  await sdk.host.setState<QuizState>({
    currentIndex: -1,
    remainingMs: 0,
    revealed: false,
    scores: {},
  });
});

// Advance to the next round with a minimal patch.
async function nextQuestion(): Promise<void> {
  await sdk.host.updateState<QuizState>((draft) => {
    draft.currentIndex += 1;
    draft.remainingMs = 15_000;
    draft.revealed = false;
  });
}
```

Transient, non-persisted events go via `sendEvent`:

```ts
// Play a sound only on the host screen.
await sdk.host.sendEvent('__host__', { type: 'play_sound', data: { id: 'tick' } });

// Fire confetti on every player.
await sdk.host.sendEvent('all', { type: 'confetti' });

// Whisper to one player.
await sdk.host.sendEvent(playerId, { type: 'answer_feedback', data: { correct: true } });

// Broadcast to a subset.
await sdk.host.sendEvent([a.id, b.id], { type: 'buzz' });
```

End the session with a final scoreboard:

```ts
await sdk.host.endGame({
  scores: { [alice.id]: 90, [bob.id]: 70 },
  summary: { winner: alice.id, teams: { red: 160, blue: 120 } },
});
```

Full surface:

| Method                             | Effect                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| `setState(state)`                  | Replace full state, broadcast snapshot.                 |
| `updateState(recipe)`              | Mutative recipe → minimal JSON patch broadcast.         |
| `sendStateTo(playerId, state?)`    | Targeted full-state push (late join / reconnect).       |
| `getState()`                       | Local clone of the most recently authored state.        |
| `sendEvent(target, event)`         | Transient event (no state impact).                      |
| `endGame(result)`                  | Final scoreboard + transition to `finished`.            |

### JSON patch semantics

Patches are mutative-generated and look like:

```json
[
  { "op": "replace", "path": ["currentIndex"], "value": 3 },
  { "op": "add", "path": ["scores", "p17"], "value": 10 },
  { "op": "replace", "path": ["scores", "p42"], "value": 40 }
]
```

You never author patches manually — you write mutative recipes and the
manager generates and transmits them.

---

## `sdk.player` — player gameplay (player role)

The player plugin submits intents and mirrors the authoritative state.

```ts
// Submit an answer.
await sdk.player.sendAction('answer', { option: 'A' });
await sdk.player.sendAction('buzz');  // data is optional
```

State mirroring:

```ts
// Current state (structured-cloned read). Always synchronous.
const state = sdk.player.state as QuizState | undefined;

// Subscribe. Replaces any prior subscription — pass a single handler that
// routes to sub-components internally.
sdk.player.onStateChange((state, meta) => {
  if (!state) return;
  render(state);
  console.log(`state updated via ${meta.reason}`); // 'state' | 'patches' | 'initial'
});

sdk.player.onEvent((event) => {
  if (event.type === 'confetti') fireConfetti();
});

sdk.player.onGameEnd((result) => {
  showFinalScoreboard(result.scores);
});
```

For late-joiners the SDK populates `sdk.player.state` from
`init.gameState` **before** `onInit` fires, so you can render the current
round immediately.

---

## `sdk.text` — OQSE rich text rendering

Plugins receive OQSE items + an asset dictionary. `sdk.text` wraps the
rich-text pipeline so you can render questions that contain
`<asset:key />` and `<blank:key />` tokens safely.

```ts
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const html = sdk.text.renderHtml(item.question, {
  markdownParser: (md) => marked.parse(md) as string,
  sanitizer: DOMPurify.sanitize,
});

container.innerHTML = html; // already sanitised
```

For fine-grained control (e.g. custom React/Vue rendering of assets),
tokenise:

```ts
const tokens = sdk.text.parseTokens(rawText);
for (const tok of tokens) {
  if (tok.type === 'text')  appendText(tok.value);
  if (tok.type === 'asset') appendAsset(tok.key, tok.media);
  if (tok.type === 'blank') appendBlankInput(tok.key);
}
```

**Security:** `renderHtml` without a sanitizer is unsafe; always pass
`DOMPurify.sanitize` (or equivalent) before inserting untrusted input.
`parseTokens` returns raw token values — escape before DOM insertion.

---

## Lifecycle callbacks

All callbacks accept sync or async handlers; the SDK awaits them. Every
handler is wrapped in a try/catch so throwing won't break the SDK.

| Callback                  | Fires for       | Signature                                      |
| ------------------------- | --------------- | ---------------------------------------------- |
| `onInit(init)`            | Both            | Once after `connect()` resolves.               |
| `onPhaseChange(phase)`    | Both            | Every phase transition.                        |
| `onConfigUpdate(cfg)`     | Both            | Host sent a theme/locale update.               |
| `onSessionAborted(why)`   | Both            | Session terminated externally.                 |
| `onPlayerJoin(p, meta)`   | Host            | Lobby roster grew (incl. reconnects).          |
| `onPlayerLeave(id)`       | Host            | Player dropped / left.                         |
| `onPlayerRename(id, name)`| Host            | A player's display name changed.               |
| `onPlayerReady(id)`       | Host            | A player called `room.clientReady()`.          |
| `onPlayerAction(id, a)`   | Host            | A player submitted an action.                  |
| `onStartGameRequested()`  | Host            | Teacher pressed Start in `host-settings`.      |
| `onState(state)`          | Player          | Full state broadcast (shortcut for manager).   |
| `onEvent(event)`          | Player          | Transient event (shortcut).                    |
| `onGameEnd(result)`       | Player          | Host called `endGame` (shortcut).              |

```ts
sdk
  .onInit(handleInit)
  .onPhaseChange(handlePhase)
  .onConfigUpdate(applyTheme)
  .onSessionAborted(showEndScreen)
  .onPlayerJoin(trackRoster)
  .onPlayerLeave(trackRoster)
  .onPlayerRename(trackPlayerRename)
  .onPlayerReady(markReady)
  .onPlayerAction(applyAction)
  .onStartGameRequested(startGame);
```

---

## Late join, reconnect, and disconnect handling

### Late join

When a new player opens the lobby URL while the session is already in
`playing`, the host app emits `onPlayerJoin(player, { isLateJoin: true, isReconnect: false })`
on the host plugin. The player plugin's `init.gameState` is populated
with the current authoritative state.

Recommended host-plugin handling:

```ts
sdk.onPlayerJoin(async (player, meta) => {
  if (meta.isLateJoin) {
    // Give them the authoritative state without disturbing everyone.
    await sdk.host.sendStateTo(player.id);
    // Let the UI know.
    await sdk.host.sendEvent(player.id, { type: 'you_joined_late' });
  }
});
```

On the **player** side, you don't need to do anything special — if
`init.gameState` is defined the SDK preloads it and your
`onStateChange` handler will be invoked immediately with
`meta.reason === 'initial'` when you register.

### Reconnect

A reconnect is a player who had previously joined, dropped, and came back
(same `playerId`). `meta.isReconnect === true`. Treat it identically to a
late join for state:

```ts
sdk.onPlayerJoin(async (player, meta) => {
  if (meta.isReconnect || meta.isLateJoin) {
    await sdk.host.sendStateTo(player.id);
  }
});
```

### Disconnect

`onPlayerLeave(playerId)` fires on the host plugin. You decide:

- Pause the round?
- Auto-continue and count their time-out as a wrong answer?
- Reassign a team slot?

Check the manifest settings — see [Teams](#teams) — to decide whether to
keep scores around for a potential reconnect.

---

## Teams

Teams are opt-in: set `supportsTeams: true` in the manifest. When teams
are enabled:

- `init.teams` is populated.
- Each `MultiPlayer.teamId` is set (or `undefined` for unassigned).
- `sdk.room.getTeams()` and `sdk.room.getPlayersInTeam(teamId)` are
  meaningful.

Example team-based scoring:

```ts
interface QuizState {
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  // ...
}

sdk.onPlayerAction(async (playerId, action) => {
  if (action.type !== 'answer') return;
  const player = sdk.room.getPlayer(playerId);
  const teamId = player?.teamId;
  if (!isCorrect(action.data)) return;

  await sdk.host.updateState<QuizState>((draft) => {
    draft.scores[playerId] = (draft.scores[playerId] ?? 0) + 10;
    if (teamId) draft.teamScores[teamId] = (draft.teamScores[teamId] ?? 0) + 10;
  });
});
```

The host app is responsible for authoring the team assignments (in the
lobby UI). Plugins can read them, plugins cannot create / delete teams.

---

## Error taxonomy

All runtime guards throw typed errors you can `instanceof`-check:

| Error                | Meaning                                                |
| -------------------- | ------------------------------------------------------ |
| `SdkNotReadyError`   | Accessed a manager before `connect()` resolved.        |
| `SdkRoleError`       | Host-only method called from player (or vice versa).   |
| `SdkPhaseError`      | Phase-restricted method called outside its window.     |
| `SdkDestroyedError`  | Any call after `sdk.destroy()`.                        |

```ts
import { SdkRoleError } from '@memizy/multiplayer-sdk';

try {
  await sdk.host.setState(/* ... */);
} catch (err) {
  if (err instanceof SdkRoleError) {
    console.warn('I should only do this from the host role', err.message);
  }
}
```

Plugins can always attempt, then inspect, rather than pre-checking the
role — the SDK will tell you politely.

---

## Standalone mode (local development)

Opened directly in a browser (no iframe), the SDK swaps the real host for
an in-memory `MockHost`. The landing page helper renders a branded page
with two buttons — "Try as host" and "Try as player" — so you can run
each role locally.

```ts
import {
  MemizyMultiplayerSDK,
  renderLandingPageIfNeeded,
  loadManifestFromDataIsland,
} from '@memizy/multiplayer-sdk';

const manifest = loadManifestFromDataIsland();
renderLandingPageIfNeeded(manifest, {
  docsUrl: 'https://learn.memizy.com/multiplayer',
  onTryHost: () => bootstrap('host'),
  onTryPlayer: () => bootstrap('player'),
});

async function bootstrap(role: 'host' | 'player'): Promise<void> {
  const sdk = new MemizyMultiplayerSDK({ id: manifest!.id, version: '1.0.0' });
  wireHandlers(sdk, role);
  await sdk.connect({
    mode: 'standalone',
    standalone: {
      role,
      pin: '424242',
      phase: role === 'host' ? 'host-settings' : 'synchronizing',
      items: SAMPLE_ITEMS,
      assets: {},
      settings: { roundTimeSec: 15 },
      supportsTeams: true,
      supportsLateJoin: true,
      supportsReconnect: true,
      capacity: { min: 2, max: 30, recommended: 12 },
      teams: [
        { id: 'red',  name: 'Red',  color: '#ef4444' },
        { id: 'blue', name: 'Blue', color: '#3b82f6' },
      ],
      players: [
        { id: 'alice', name: 'Alice', joinedAt: Date.now(), teamId: 'red'  },
        { id: 'bob',   name: 'Bob',   joinedAt: Date.now(), teamId: 'blue' },
      ],
      self: role === 'player'
        ? { id: 'alice', name: 'Alice', joinedAt: Date.now(), teamId: 'red' }
        : undefined,
    },
  });
}
```

For multi-participant local tests (host + N players talking to each other
in the same tab) wire multiple `MockHost`s to a shared `MemoryMockHub`:

```ts
import { MemoryMockHub, MockHost } from '@memizy/multiplayer-sdk';

const hub = new MemoryMockHub();
// Manually construct MockHost + SDK pairs and register them with the hub.
// This is what the example plugin's standalone harness does.
```

See the [example plugin](../example/) for a working reference.

---

## Manifest configuration

Declare multiplayer capabilities in `appSpecific.memizy.multiplayerSdk`:

```json
{
  "id": "com.example.quiz",
  "appName": "Example Quiz",
  "description": "...",
  "capabilities": {
    "actions": ["render"],
    "types": ["mcq-single", "mcq-multi", "true-false"]
  },
  "appSpecific": {
    "memizy": {
      "multiplayerSdk": {
        "apiVersion": "0.4",
        "minimumHostApiVersion": "0.4",
        "players":            { "min": 2, "max": 60, "recommended": 20 },
        "supportsLateJoin":   true,
        "supportsReconnect":  true,
        "supportsTeams":      true,
        "customSyncScreen":   false,
        "hasSettingsScreen":  true,
        "requiresHostScreen": true,
        "clientOrientation":  "portrait"
      }
    }
  }
}
```

| Field                | Effect                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| `apiVersion`         | SDK/API version used to build the plugin (for host compatibility checks).       |
| `minimumHostApiVersion` | Oldest host protocol/API version the plugin can tolerate.                    |
| `players`            | Lobby capacity; surfaced as `init.capacity`.                                     |
| `supportsLateJoin`   | Host app permits joins during `playing`.                                         |
| `supportsReconnect`  | Host app reuses `playerId` when a dropout returns.                               |
| `supportsTeams`      | `init.teams` / `MultiPlayer.teamId` are populated.                               |
| `customSyncScreen`   | Plugin provides its own sync/waiting screen; host shell can skip default UI. (Defaults to `false` if omitted). |
| `hasSettingsScreen`  | Plugin provides an in-iframe host settings UI in `host-settings`. (Defaults to `true` if omitted). |
| `requiresHostScreen` | Host app refuses to start without a projector device. **Host app concern.**      |
| `clientOrientation`  | Host app enforces portrait/landscape on players. **Host app concern.**           |

`requiresHostScreen` and `clientOrientation` are **not** policed by the
plugin — the host Vue shell reads them before mounting the iframe.

Extract the block from inside the plugin:

```ts
import { loadManifestFromDataIsland, readMultiplayerConfig } from '@memizy/multiplayer-sdk';

const manifest = loadManifestFromDataIsland();
const multi = readMultiplayerConfig(manifest);
console.log(multi.supportsTeams);
```

---

## A complete walkthrough: Quiz plugin

The `example/` folder ships a fully-featured quiz plugin that exercises
every area of the SDK (teams, late join, reconnect, timed rounds, live
leaderboard, confetti events). Read the annotated source there for a
reference implementation. Key extracts:

### 1. Bootstrap

```ts
const sdk = new MemizyMultiplayerSDK<QuizState>({
  id: 'com.memizy.example.multiplayer-quiz',
  version: '1.0.0',
  debug: true,
});
```

### 2. Settings phase (host only)

```ts
sdk.onInit(async (init) => {
  if (init.role !== 'host') return;

  const current = sdk.settings.get() as QuizSettings;
  await sdk.settings.update((draft) => {
    Object.assign(draft, { ...DEFAULT_SETTINGS, ...current });
  });

  renderSettingsUi();
  await sdk.settings.setValid(true);
});
```

### 3. Start game → seed state

```ts
sdk.onStartGameRequested(async () => {
  await sdk.host.setState<QuizState>(initialState(sdk.settings.get() as QuizSettings));
});
```

### 4. Players ready → advance phase

```ts
const readyPlayers = new Set<string>();
const START_TIMEOUT_MS = 12_000;
let startTimer: ReturnType<typeof setTimeout> | null = null;

sdk.onPhaseChange((phase) => {
  if (phase === 'synchronizing') {
    startTimer = setTimeout(() => sdk.room.startGame(), START_TIMEOUT_MS);
  }
});

sdk.onPlayerReady(async (id) => {
  readyPlayers.add(id);
  if (readyPlayers.size >= sdk.room.getPlayers().length) {
    if (startTimer) clearTimeout(startTimer);
    await sdk.room.startGame();
  }
});
```

### 5. Handle answers

```ts
sdk.onPlayerAction(async (playerId, action) => {
  if (action.type !== 'answer') return;
  const { option } = action.data as { option: string };
  await sdk.host.updateState<QuizState>((draft) => {
    const q = questions[draft.currentIndex];
    const correct = q?.correct === option;
    if (correct) {
      draft.scores[playerId] = (draft.scores[playerId] ?? 0) + 10;
      const teamId = sdk.room.getPlayer(playerId)?.teamId;
      if (teamId) draft.teamScores[teamId] = (draft.teamScores[teamId] ?? 0) + 10;
    }
    draft.lastAnswers[playerId] = { option, correct };
  });
});
```

### 6. Late join / reconnect

```ts
sdk.onPlayerJoin(async (player, meta) => {
  if (meta.isLateJoin || meta.isReconnect) {
    await sdk.host.sendStateTo(player.id);
    await sdk.host.sendEvent(player.id, {
      type: 'toast',
      data: { text: meta.isReconnect ? 'Welcome back!' : 'Joined mid-game' },
    });
  }
});
```

### 7. End the session

```ts
async function finishGame(): Promise<void> {
  const state = sdk.host.getState()!;
  await sdk.host.endGame({
    scores: state.scores,
    summary: { teamScores: state.teamScores, playedAt: new Date().toISOString() },
  });
}
```

### 8. Player rendering

```ts
sdk.onInit(async (init) => {
  if (init.role !== 'player') return;
  renderLobby(init);
  await sdk.room.clientReady();
});

sdk.onState((state) => {
  renderBoard(state as QuizState);
});

sdk.onEvent((event) => {
  if (event.type === 'confetti') fireConfetti();
});

sdk.onGameEnd((result) => renderLeaderboard(result.scores));
```

---

For the wire-level counterpart to every section here, open
[`host-protocol.md`](./host-protocol.md).
