# @memizy/multiplayer-sdk

TypeScript SDK for building Memizy multiplayer plugins.

- **Penpal-based RPC** - no more hand-rolled `postMessage` envelopes; plugins call async functions on the host and vice versa.
- **Mutative-based state sync** - authoritative game state is broadcast as JSON patches, not as 500&nbsp;kB snapshots.
- **Namespaced protocol** - `sys` / `settings` / `room` / `game` domains instead of one flat `MULTI_ACTION` bag.
- **Strict role model** - host and player plugins share one SDK bundle but expose distinct, typed surfaces.
- **Consumer-only content** - multiplayer plugins cannot mutate items/assets (that is the single-player SDK's job); the multiplayer SDK is purely read-only for study content.

**Version:** `0.4.0` &middot; **Protocol:** `0.4`

---

## Installation

```bash
npm install @memizy/multiplayer-sdk
```

---

## The Lifecycle

A multiplayer plugin session walks through four phases. The Host application drives every transition; the plugin observes them via `onPhaseChange`.

1. **`host-settings`** - only the host plugin runs. The teacher configures the game via the plugin's settings UI.
2. **`synchronizing`** - the teacher pressed "Start". Player plugins load on every device and signal `room.clientReady()`. The host plugin waits for all of them (or a grace timeout).
3. **`playing`** - every player is ready. The host broadcasts authoritative state, players render it, players dispatch intents.
4. **`finished`** - the host called `host.endGame(result)`. Players see the final scoreboard.

---

## The Protocol at a Glance

All traffic between the iframe and the Memizy host app is now a **Penpal RPC call**. The SDK surfaces it as two namespaced APIs:

### `HostApi` (plugin -> host app)

| Domain | Method | Who | When |
| --- | --- | --- | --- |
| `sys` | `sysReady(identity)` | SDK | Once after Penpal handshake. |
| `sys` | `sysRequestResize(...)` | Both | Any time. |
| `sys` | `sysReportError(...)` | Both | Any time. |
| `sys` | `sysExit()` | Both | User leaves. |
| `settings` | `settingsReplace(...)` | Host | During `host-settings`. |
| `settings` | `settingsApplyPatches(...)` | Host | During `host-settings`. |
| `settings` | `settingsSetValid(valid)` | Host | During `host-settings`. |
| `room` | `roomClientReady()` | Player | Once the UI has rendered. |
| `room` | `roomHostReady()` | Host | When init payload is consumed. |
| `room` | `roomStartGame()` | Host | All ready / timeout. |
| `game` | `gameBroadcastState(state)` | Host | Full-state sync. |
| `game` | `gameBroadcastStatePatches(patches)` | Host | Incremental diff. |
| `game` | `gameSendStateTo(playerId, state)` | Host | Reconnect / late join. |
| `game` | `gameSendEvent(target, event)` | Host | Transient event. |
| `game` | `gameEndSession(result)` | Host | Close the game. |
| `game` | `gameSendAction(action)` | Player | Submit player intent. |

### `PluginApi` (host app -> plugin)

| Method | Who receives it | Meaning |
| --- | --- | --- |
| `onConfigUpdate(config)` | Both | Theme / locale changed. |
| `onSessionAborted(reason)` | Both | Session terminated externally. |
| `onPhaseChange(phase)` | Both | Lifecycle advanced. |
| `onPlayerJoin(player, meta)` | Host | `room:join` received. |
| `onPlayerLeave(playerId)` | Host | `room:leave` received. |
| `onPlayerReady(playerId)` | Host | A player called `roomClientReady()`. |
| `onPlayerAction(playerId, action)` | Host | A player called `gameSendAction()`. |
| `onStartGameRequested()` | Host | Teacher pressed "Start game". |
| `onState(state)` | Player | Full authoritative state. |
| `onStatePatches(patches)` | Player | Patches on top of the prior state. |
| `onEvent(event)` | Player | Transient event. |
| `onGameEnd(result)` | Player | Session ended. |

---

## Minimal Plugin (Host)

```ts
import { MemizyMultiplayerSDK } from '@memizy/multiplayer-sdk';

interface QuizState {
  currentIndex: number;
  remainingMs: number;
  leaderboard: Array<{ playerId: string; score: number }>;
}

const sdk = new MemizyMultiplayerSDK<QuizState>({
  id: 'com.example.quiz',
  version: '1.0.0',
});

sdk.onInit(async (init) => {
  if (init.role !== 'host') return;

  // Phase 1 — host-settings
  await sdk.settings.update((draft) => {
    draft.roundTimeSec ??= 15;
    draft.shuffle ??= true;
  });
  await sdk.settings.setValid(true);
});

sdk.onStartGameRequested(async () => {
  // Teacher pressed Start. Seed initial state; wait for players.
  await sdk.host.setState({
    currentIndex: -1,
    remainingMs: 0,
    leaderboard: [],
  });
});

const readyPlayers = new Set<string>();

sdk.onPlayerReady(async (playerId) => {
  readyPlayers.add(playerId);
  const roster = sdk.room.getPlayers();
  if (readyPlayers.size >= roster.length) {
    await sdk.room.startGame();          // transitions to `playing`
    await nextQuestion();
  }
});

sdk.onPlayerJoin(async (player, meta) => {
  if (meta.isReconnect) {
    // Ship the current state to just this player, don't disturb others.
    await sdk.host.sendStateTo(player.id);
  }
});

sdk.onPlayerAction(async (playerId, action) => {
  if (action.type !== 'answer') return;
  await sdk.host.updateState((draft) => {
    const entry = draft.leaderboard.find((e) => e.playerId === playerId);
    if (entry) entry.score += 10;
    else draft.leaderboard.push({ playerId, score: 10 });
  });
});

async function nextQuestion() {
  await sdk.host.updateState((draft) => {
    draft.currentIndex += 1;
    draft.remainingMs = 15_000;
  });
}

await sdk.connect();
```

## Minimal Plugin (Player)

```ts
import { MemizyMultiplayerSDK } from '@memizy/multiplayer-sdk';

const sdk = new MemizyMultiplayerSDK<QuizState>({
  id: 'com.example.quiz',
  version: '1.0.0',
});

sdk.onInit(async (init) => {
  if (init.role !== 'player') return;

  // Render the controller UI...
  await sdk.room.clientReady();
});

sdk.onState((state) => {
  // Full state broadcast. Replace everything.
  render(state!);
});

sdk.onEvent((event) => {
  if (event.type === 'play_sound') new Audio('/applause.mp3').play();
});

sdk.onGameEnd((result) => {
  showFinalScoreboard(result.scores);
});

document
  .querySelector('#answer-A')!
  .addEventListener('click', () =>
    sdk.player.sendAction('answer', { option: 'A' }),
  );

await sdk.connect();
```

---

## Authoring Settings During `host-settings`

The `sdk.settings` manager keeps a local snapshot of the plugin's settings object and forwards changes to the host via JSON patches (mutative).

```ts
await sdk.settings.update((draft) => {
  draft.roundTimeSec = 20;
  draft.categories ??= [];
  draft.categories.push('history');
});

// Toggle the "Start game" button in the host app shell.
await sdk.settings.setValid(isValid);

// Hard replace (e.g. loading a preset).
await sdk.settings.set({
  roundTimeSec: 10,
  shuffle: true,
  categories: ['math'],
});
```

Only the **host** role may call these methods; players see `sdk.settings.get()` as a read-only snapshot of what the teacher confirmed.

---

## Sending State to Players

The host plugin owns the canonical game state. The recommended pattern is:

1. Seed the initial state with `sdk.host.setState(state)`.
2. Mutate it with `sdk.host.updateState(recipe)` - mutative generates a minimal diff.
3. When a player reconnects or late-joins, send them the current state without disturbing the others: `sdk.host.sendStateTo(playerId)`.

Transient events (sounds, toasts, confetti) go through `sdk.host.sendEvent(target, event)` - they are NOT stored and missed events stay missed.

---

## The Manifest

Declare multiplayer capabilities in `appSpecific.memizy.multiplayer`:

```json
{
  "capabilities": { "actions": ["render"], "types": ["mcq-single"] },
  "appSpecific": {
    "memizy": {
      "multiplayer": {
        "apiVersion": "0.4",
        "players": { "min": 2, "max": 60, "recommended": 30 },
        "supportsLateJoin": true,
        "supportsReconnect": true,
        "supportsTeams": false,
        "requiresHostScreen": true,
        "clientOrientation": "portrait"
      }
    }
  }
}
```

The SDK exposes `readMultiplayerConfig(manifest)` to extract this block in a typed way.

`requiresHostScreen` and `clientOrientation` are **host-app** concerns - the plugin and the SDK do not implement them. The host Vue app reads the manifest *before* mounting the iframe and gates the `playing` phase on orientation, projector checks, etc.

---

## Standalone Mode

Opened directly in a browser, the SDK falls back to an in-memory `MockHost` backed by a seed object. This is great for local development:

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

async function bootstrap(role: 'host' | 'player') {
  const sdk = new MemizyMultiplayerSDK({ id: manifest!.id, version: '1.0.0' });
  // ... register handlers ...
  await sdk.connect({
    mode: 'standalone',
    standalone: {
      role,
      items: [/* seed OQSE items */],
      assets: {},
      settings: { roundTimeSec: 15 },
      players: [
        { id: 'p1', name: 'Alice', joinedAt: Date.now() },
        { id: 'p2', name: 'Bob',   joinedAt: Date.now() },
      ],
    },
  });
}
```

Advanced test harnesses can wire multiple `MockHost` instances to a single `MemoryMockHub` to exercise the full protocol without a real Memizy host.

---

## Error Types

Every runtime-guard on the SDK throws a typed error you can discriminate:

- `SdkNotReadyError` - a manager was accessed before `connect()` resolved.
- `SdkRoleError` - a host-only (or player-only) method was called from the wrong role.
- `SdkPhaseError` - a phase-restricted method was called outside its window.
- `SdkDestroyedError` - any SDK method was called after `destroy()`.

---

## Migrating from 0.3

| 0.3 | 0.4 |
| --- | --- |
| `createMultiplayerPlugin()` | `new MemizyMultiplayerSDK()` |
| `sdk.defineHost({...})` | `sdk.on*(...)` handler registration on the instance |
| `sdk.host.broadcastState(state)` | `sdk.host.setState(state)` / `sdk.host.updateState(recipe)` |
| `sdk.player.sendAction(type, data)` | `sdk.player.sendAction(type, data)` (unchanged) |
| `sdk.postReadyToStart()` | `sdk.room.clientReady()` (players) or `sdk.room.hostReady()` (host) |
| `START_GAME` inbound | `onPhaseChange('playing')` |
| `PREPARE_GAME` inbound | Replaced by the `synchronizing` phase + `onPlayerReady` signals |
| `SESSION_COMPLETED` outbound | `sdk.host.endGame(result)` |
| Asset uploads | Removed - multiplayer plugins are read-only consumers. |
| Progress sync | Removed - multiplayer sessions do not persist per-item progress. |

---

## License

MIT
