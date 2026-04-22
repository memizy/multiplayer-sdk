# @memizy/multiplayer-sdk

TypeScript SDK for building Memizy multiplayer plugins — teacher/host on a
projector, players on their phones, one OQSE set, one shared lobby.

- **Penpal-based RPC** — plugins call typed async functions on the host (and
  vice versa); no hand-rolled `postMessage` envelopes.
- **Mutative-based state sync** — authoritative state is broadcast as tiny
  JSON patches instead of resending 500 kB snapshots on every tick.
- **Namespaced protocol** — `sys` / `settings` / `room` / `game` domains keep
  system chatter separate from gameplay traffic.
- **Strict role model** — one SDK bundle, two API surfaces (`sdk.host` vs
  `sdk.player`) with compile-time *and* runtime role guards.
- **Content is read-only** — multiplayer plugins consume OQSE items; editing
  and asset uploads belong to the single-player SDK.
- **Standalone mode out of the box** — a branded landing page and an in-memory
  `MockHost` let you run a plugin locally with zero Memizy dependencies.

**Package version:** `0.4.0` &middot; **Protocol version:** `0.4`

---

## Documentation

Full documentation lives in [`docs/`](./docs):

- **[Plugin Developer Guide](./docs/plugin-developers.md)** — the API surface,
  lifecycle, manager-by-manager reference, late-join / reconnect / teams
  patterns, standalone mode, and a fully worked quiz walkthrough.
- **[Host Protocol Reference](./docs/host-protocol.md)** — the Penpal wire
  protocol, `HostApi` / `PluginApi` contracts, payload shapes, sequence
  diagrams and forward-compatibility rules.

---

## Example plugin

A complete, deployable reference plugin lives in [`example/`](./example): a
multiplayer quiz with teams, live leaderboard, timed rounds, late join,
reconnect and a fully working standalone harness you can run in your browser.

```bash
npm install
npm run example:dev
```

The example ships with a separate minimal variant (`minimal.html`) for the
tiniest possible working plugin, and is laid out to deploy to GitHub Pages
unchanged via `npm run example:build`.

See [`example/README.md`](./example/README.md) for screenshots, URL params
and the list of demoed SDK features.

---

## Installation

```bash
npm install @memizy/multiplayer-sdk
```

---

## 60-second overview

A multiplayer session walks through four phases; the host application drives
every transition, the plugin observes them:

```
host-settings  ──►  synchronizing  ──►  playing  ──►  finished
```

One SDK bundle runs on both a host device (teacher / projector) and every
player device. `init.role` tells each instance which manager surface to use.

```ts
import { MemizyMultiplayerSDK } from '@memizy/multiplayer-sdk';

interface QuizState {
  currentIndex: number;
  scores: Record<string, number>;
}

const sdk = new MemizyMultiplayerSDK<QuizState>({
  id: 'com.example.quiz',
  version: '1.0.0',
});

sdk.onInit(async (init) => {
  if (init.role === 'host') {
    await sdk.settings.update((draft) => {
      (draft as Record<string, unknown>).roundTimeSec ??= 15;
    });
    await sdk.settings.setValid(true);
  } else {
    renderLobby(init);
    await sdk.room.clientReady();
  }
});

sdk.onStartGameRequested(async () => {
  await sdk.host.setState<QuizState>({ currentIndex: -1, scores: {} });
});

sdk.onPlayerReady(async (playerId) => {
  if (allReady()) await sdk.room.startGame();
});

sdk.onPlayerAction(async (playerId, action) => {
  if (action.type !== 'answer') return;
  await sdk.host.updateState<QuizState>((draft) => {
    draft.scores[playerId] = (draft.scores[playerId] ?? 0) + 10;
  });
});

sdk.onState((state) => render(state as QuizState));

await sdk.connect();
```

The detailed versions of these patterns — with teams, late join, reconnect,
transient events and error handling — live in
[`docs/plugin-developers.md`](./docs/plugin-developers.md).

---

## Protocol at a glance

The SDK exposes two namespaced APIs; the full list of methods and payloads
is specified in [`docs/host-protocol.md`](./docs/host-protocol.md).

### Plugin → Host (`HostApi`)

| Domain      | Method                               | Role(s) |
| ----------- | ------------------------------------ | ------- |
| `sys`       | `sysReady`, `sysRequestResize`, …    | Both    |
| `settings`  | `settingsReplace` / `ApplyPatches` / `SetValid` | Host |
| `room`      | `roomClientReady` / `HostReady` / `StartGame` | Both |
| `game`      | `gameBroadcastState` / `StatePatches` / `SendStateTo` / `SendEvent` / `EndSession` | Host |
| `game`      | `gameSendAction`                     | Player  |

### Host → Plugin (`PluginApi`)

| Method                             | Who receives it                          |
| ---------------------------------- | ---------------------------------------- |
| `onConfigUpdate` / `onSessionAborted` / `onPhaseChange` | Both |
| `onPlayerJoin` / `onPlayerLeave` / `onPlayerReady` / `onPlayerAction` / `onStartGameRequested` | Host |
| `onState` / `onStatePatches` / `onEvent` / `onGameEnd` | Player |

---

## Manifest

Declare multiplayer capabilities under `appSpecific.memizy.multiplayer`:

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

Use `readMultiplayerConfig(manifest)` inside a plugin to extract this block
in a typed way. `requiresHostScreen` and `clientOrientation` are enforced by
the **host application**, not the plugin.

---

## Standalone mode

Plugins opened directly in a browser (not inside a Memizy iframe) fall back
to an in-memory `MockHost` and render a branded landing page with "Try as
host" / "Try as player" buttons. This is what makes the [example](./example)
deployable on GitHub Pages.

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
  await sdk.connect({
    mode: 'standalone',
    standalone: {
      role,
      items: SAMPLE_ITEMS,
      assets: {},
      settings: { roundTimeSec: 15 },
      players: [
        { id: 'alice', name: 'Alice', joinedAt: Date.now() },
        { id: 'bob',   name: 'Bob',   joinedAt: Date.now() },
      ],
    },
  });
}
```

---

## Errors

Every runtime guard throws a typed error you can discriminate:

- `SdkNotReadyError` — manager accessed before `connect()` resolved.
- `SdkRoleError` — host-only (or player-only) method called from the wrong role.
- `SdkPhaseError` — phase-restricted method called outside its window.
- `SdkDestroyedError` — any call after `destroy()`.

---

## License

MIT
