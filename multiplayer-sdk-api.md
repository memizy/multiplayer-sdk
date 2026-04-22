# Multiplayer SDK API Specification v0.4

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [OQSE Manifest Configuration (`appSpecific`)](#oqse-manifest-configuration-appspecific)
- [Role & Phase Model](#role--phase-model)
- [Transport: Penpal RPC](#transport-penpal-rpc)
- [Protocol Domains](#protocol-domains)
  - [`sys*` - System](#sys---system)
  - [`settings*` - Host-only authoring](#settings---host-only-authoring)
  - [`room*` - Roster & synchronization](#room---roster--synchronization)
  - [`game*` - Authoritative gameplay](#game---authoritative-gameplay)
- [Inbound Plugin Methods (`PluginApi`)](#inbound-plugin-methods-pluginapi)
- [Init Session Payload](#init-session-payload)
- [State Synchronization Model](#state-synchronization-model)
- [SDK Runtime Surface](#sdk-runtime-surface)
  - [Constructor & Connection](#constructor--connection)
  - [Namespaced Managers](#namespaced-managers)
  - [Lifecycle Handlers](#lifecycle-handlers)
- [Error Taxonomy](#error-taxonomy)
- [Standalone Mode](#standalone-mode)
- [Migration from v0.3](#migration-from-v03)

---

## Overview

This document describes the protocol and SDK behaviour implemented by `@memizy/multiplayer-sdk` v0.4.

Compared to v0.3 the SDK is a ground-up rewrite:

- **Penpal v7** replaces hand-rolled `postMessage` envelopes. Every exchange between plugin and host is an async RPC call with typed arguments and return values.
- **Mutative** replaces whole-object rebroadcasts. Game state travels as minimal JSON patches.
- **Namespaced protocol**. The single `MULTI_ACTION` bag from v0.3 is gone; every call lives in a `sys`, `settings`, `room`, or `game` domain that matches its responsibility.
- **Strict role model**. Host and player plugins share one SDK bundle but the accessor `sdk.host` / `sdk.player` throws `SdkRoleError` when used from the wrong role.
- **Consumer-only content**. Multiplayer plugins can no longer upload assets, mutate items, or persist per-item progress. That is the single-player SDK's (`@memizy/plugin-sdk`) job.

---

## Architecture

Three components share responsibility for a live session:

| Component | Runs in | Responsibilities |
| --- | --- | --- |
| **Host application** (Vue) | Teacher & student devices | WebSocket / Supabase transport, manifest validation, lobby (PIN, teams, rotation / host-screen gating), routing RPC calls. |
| **Multiplayer SDK** | Iframe (this package) | Penpal handshake, role-aware namespaced managers, mutative state snapshots, standalone fallback. |
| **Multiplayer Plugin** | Iframe | Pure game logic. Reads items, writes settings, authors game state, dispatches events, consumes player actions. |

The plugin never talks to the network directly. All traffic is:

```
Plugin  <-- Penpal -->  Host App  <-- Supabase/WebSocket -->  Other Host Apps
```

---

## OQSE Manifest Configuration (`appSpecific`)

Multiplayer-specific manifest hints live under `appSpecific.memizy.multiplayer` (unchanged from v0.3 beyond the `apiVersion` bump):

```json
{
  "capabilities": {
    "actions": ["render"],
    "types":   ["mcq-single"]
  },
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

| Field | Who enforces it |
| --- | --- |
| `apiVersion` | Host app (refuses incompatible SDKs). |
| `players.{min,max,recommended}` | Host app (lobby sizing). |
| `supportsLateJoin` | Host app (keeps PIN open) + host plugin (handles late-join via `onPlayerJoin` + `sendStateTo`). |
| `supportsReconnect` | Host app (persists player ids) + host plugin (same path as late-join). |
| `supportsTeams` | Host app (adds team picker). Plugins see `room.teams` populated. |
| `requiresHostScreen` | Host app only. Plugins MUST NOT implement this. |
| `clientOrientation` | Host app only. Plugins MUST NOT implement this. |

Use `readMultiplayerConfig(manifest)` exported by the SDK to extract the block in a typed way.

---

## Role & Phase Model

Every plugin instance sees exactly one role and four possible phases.

### Role

`role: 'host' | 'player'` is assigned by the host application and returned in the init payload. The SDK binds the appropriate set of managers:

- `role === 'host'` - `sdk.sys`, `sdk.settings`, `sdk.room`, `sdk.host`, `sdk.text`.
- `role === 'player'` - `sdk.sys`, `sdk.room`, `sdk.player`, `sdk.text`, plus read-only `sdk.settings.get()`.

### Phase

`phase: 'host-settings' | 'synchronizing' | 'playing' | 'finished'`.

```
host-settings ---> synchronizing ---> playing ---> finished
```

| Phase | What happens |
| --- | --- |
| `host-settings` | Only the host plugin runs. The teacher edits settings. |
| `synchronizing` | Teacher pressed Start. Player iframes load; each signals `room.clientReady()`. Host waits (with a grace timeout) via `onPlayerReady`. |
| `playing` | Host called `room.startGame()`. Authoritative state flows. |
| `finished` | Host called `host.endGame(result)`. Clients may display scoreboards. |

Phase transitions arrive through `onPhaseChange(phase)`.

---

## Transport: Penpal RPC

The SDK performs the Penpal handshake automatically during `sdk.connect()`. Two flat surfaces are exposed:

- `HostApi` - methods the host exposes, called by the plugin through a Penpal remote proxy.
- `PluginApi` - methods the plugin exposes, called by the host through its remote proxy.

Every method is async and serialises arguments via the structured clone algorithm. `File`/`Blob` arguments are NOT used in the multiplayer SDK (assets are already resolved in the init payload).

---

## Protocol Domains

### `sys*` - System

| Method | Dir | Meaning |
| --- | --- | --- |
| `sysReady(identity)` | Plugin -> Host | Called once by the SDK after handshake. Returns the init payload. |
| `sysRequestResize(request)` | Plugin -> Host | Ask the host iframe container to resize. |
| `sysReportError(error)` | Plugin -> Host | Non-fatal error telemetry. |
| `sysExit()` | Plugin -> Host | Voluntarily close this plugin instance. |

### `settings*` - Host-only authoring

Valid only during `host-settings`. The host app persists the settings object and uses them when advancing to `synchronizing`.

| Method | Semantics |
| --- | --- |
| `settingsReplace(settings)` | Wholesale replace. |
| `settingsApplyPatches(patches)` | Apply mutative-generated JSON patches. |
| `settingsSetValid(valid)` | Toggle the host app's "Start game" button. |

### `room*` - Roster & synchronization

| Method | Role | Meaning |
| --- | --- | --- |
| `roomClientReady()` | Player | "My UI is rendered, I'm ready for gameplay." Forwarded to the host plugin as `onPlayerReady`. |
| `roomHostReady()` | Host | "I finished bootstrapping and I can accept the Start command." Informational for the host app. |
| `roomStartGame()` | Host | Authoritatively promote the session to `playing`. |

### `game*` - Authoritative gameplay

| Method | Role | Meaning |
| --- | --- | --- |
| `gameBroadcastState(state)` | Host | Replace the full game state; sent to every player as `game:state:sync`. |
| `gameBroadcastStatePatches(patches)` | Host | Apply a diff to every player's state (`game:state:patch`). |
| `gameSendStateTo(playerId, state)` | Host | Send the current full state to a single player (reconnect / late-join). |
| `gameSendEvent(target, event)` | Host | Transient event to `'all'`, a playerId, or an array. Never persisted. |
| `gameEndSession(result)` | Host | Close the game and trigger `onGameEnd` on every player. |
| `gameSendAction(action)` | Player | Submit a player intent. The host plugin is the authority. |

---

## Inbound Plugin Methods (`PluginApi`)

Implemented by the SDK and exposed to the host. Plugin authors register handlers via `sdk.on*(...)`.

| Method | Who receives | Description |
| --- | --- | --- |
| `onConfigUpdate(config)` | Both | Theme / locale changed. |
| `onSessionAborted(reason)` | Both | Session terminated externally (`user_exit`, `timeout`, `host_error`, `kicked`, `room_closed`). |
| `onPhaseChange(phase)` | Both | Lifecycle advanced. |
| `onPlayerJoin(player, meta)` | Host | A player joined. `meta.isReconnect` / `meta.isLateJoin` hint the correct response. |
| `onPlayerLeave(playerId)` | Host | A player left. |
| `onPlayerReady(playerId)` | Host | A player called `roomClientReady()`. |
| `onPlayerAction(playerId, action)` | Host | A player dispatched an action. |
| `onStartGameRequested()` | Host | Teacher pressed "Start game" in the host UI. Host plugin should perform final prep. |
| `onState(state)` | Player | Full state broadcast. |
| `onStatePatches(patches)` | Player | Patches on top of the previous state. |
| `onEvent(event)` | Player | Transient event. |
| `onGameEnd(result)` | Player | Session ended. |

---

## Init Session Payload

Returned by `HostApi.sysReady()`:

```ts
interface InitSessionPayloadBase {
  sessionId:      string;
  pin:            string;
  role:           'host' | 'player';
  runMode:        'host-settings' | 'host-game' | 'client-game';
  phase:          GamePhase;

  items:          OQSEItem[];
  setMeta?:       OQSEMeta;
  assets:         Record<string, MediaObject>;

  players:        MultiPlayer[];
  teams:          TeamInfo[];

  supportsTeams:      boolean;
  supportsLateJoin:   boolean;
  supportsReconnect:  boolean;
  capacity:           { min: number; max: number; recommended?: number };

  configuration: SessionSettings;            // theme, locale
  settings:      Record<string, unknown>;    // plugin-defined
  gameState?:    unknown;                    // only for late-joining players
}
```

Player payloads additionally carry `self: MultiPlayer`.

---

## State Synchronization Model

The host plugin owns the authoritative state. Recommended pattern:

```ts
await sdk.host.setState({ currentIndex: 0, ... });   // full broadcast
await sdk.host.updateState((draft) => {              // mutative recipe
  draft.currentIndex += 1;
});                                                  // -> patches on the wire

// Reconnect
sdk.onPlayerJoin(async (p, meta) => {
  if (meta.isReconnect || meta.isLateJoin) {
    await sdk.host.sendStateTo(p.id);  // no effect on other players
  }
});
```

On the player side:

```ts
sdk.onState((state) => {  /* full replace */ });
// `sdk.player.state` is always the most recent snapshot (patches applied automatically)
```

The patch format is:

```ts
interface JsonPatch {
  op:    'add' | 'remove' | 'replace';
  path:  (string | number)[];
  value?: unknown;
}
```

This is structurally the same shape mutative emits with default options; the host side does NOT need `mutative` as a dependency.

---

## SDK Runtime Surface

### Constructor & Connection

```ts
const sdk = new MemizyMultiplayerSDK<State>({
  id:              string,
  version:         string,
  protocol?:       '0.4',
  allowedOrigins?: (string | RegExp)[],   // default ['*']
  handshakeTimeout?: number,              // default 10_000 ms
  debug?:          boolean,
});

const init = await sdk.connect(/* { mode, standalone } */);
```

### Namespaced Managers

| Accessor | Role | Purpose |
| --- | --- | --- |
| `sdk.sys` | Both | Resize, error, exit. |
| `sdk.room` | Both | Roster read + synchronization signals (`clientReady`, `hostReady`, `startGame`). |
| `sdk.settings` | Both (mutators: host only) | Authoring surface + read-only snapshot. |
| `sdk.host` | Host | State authoring, events, end-game. |
| `sdk.player` | Player | `sendAction`, `state`, `onStateChange`, `onEvent`, `onGameEnd`. |
| `sdk.text` | Both | OQSE rich-text rendering. |

### Lifecycle Handlers

Chainable registration on the SDK instance:

```ts
sdk
  .onInit(init => { ... })
  .onPhaseChange(phase => { ... })
  .onConfigUpdate(cfg => { ... })
  .onSessionAborted(reason => { ... })

  // Host
  .onPlayerJoin((player, meta) => { ... })
  .onPlayerLeave(id => { ... })
  .onPlayerReady(id => { ... })
  .onPlayerAction((id, action) => { ... })
  .onStartGameRequested(() => { ... })

  // Player
  .onState(state => { ... })
  .onEvent(event => { ... })
  .onGameEnd(result => { ... });
```

---

## Error Taxonomy

| Error | Thrown when |
| --- | --- |
| `SdkNotReadyError` | A manager accessor is used before `connect()` resolved. |
| `SdkRoleError` | A host-only method was invoked from a player (or vice versa). |
| `SdkPhaseError` | A phase-restricted method was called outside its window. |
| `SdkDestroyedError` | Any SDK method was called after `destroy()`. |

All are exported from the package root.

---

## Standalone Mode

Opened outside a Memizy host the SDK falls back to an in-memory `MockHost`. Use the `standalone` option to seed it:

```ts
await sdk.connect({
  mode: 'standalone',
  standalone: {
    role: 'host',
    items: [...],
    players: [{ id: 'p1', name: 'Alice', joinedAt: Date.now() }],
    settings: { roundTimeSec: 15 },
  },
});
```

For multi-iframe harnesses, attach several `MockHost` instances to a single `MemoryMockHub`. The hub routes `onPlayerJoin`, `onPlayerAction`, `onState`, etc., so a host iframe and multiple player iframes can exchange state with no real network.

---

## Migration from v0.3

| v0.3 | v0.4 |
| --- | --- |
| `createMultiplayerPlugin()` | `new MemizyMultiplayerSDK()` |
| `sdk.defineHost({...})` | `sdk.on*()` registration on the instance |
| `INIT_SESSION` / `MULTI_INIT` | `HostApi.sysReady()` returns the init payload |
| `PREPARE_GAME` | Replaced by the `synchronizing` phase + `onPlayerReady` signals |
| `START_GAME` | `onPhaseChange('playing')` after the host calls `room.startGame()` |
| `MULTI_READY` | `room.clientReady()` / `room.hostReady()` |
| `MULTI_ACTION` (plugin -> host for players) | `gameSendAction(action)` |
| `MULTI_ACTION` (host -> plugin for teacher) | `onPlayerAction(playerId, action)` |
| `MULTI_BROADCAST` | `gameBroadcastState` / `gameBroadcastStatePatches` |
| `STATE_UPDATE` | `onState` / `onStatePatches` |
| `SESSION_COMPLETED` | `gameEndSession(result)` |
| Asset uploads | **Removed** - multiplayer plugins are read-only consumers. |
| Progress sync | **Removed** - multiplayer sessions do not persist per-item progress. |

---
