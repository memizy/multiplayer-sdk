# Multiplayer SDK API Specification v0.3

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Lifecycle](#lifecycle)
- [Message Envelope](#message-envelope)
- [Message Protocol](#message-protocol)
  - [Host App -> Plugin messages](#host-app---plugin-messages)
  - [Plugin -> Host App messages](#plugin---host-app-messages)
- [Message Reference Table](#message-reference-table)
- [SDK Runtime API](#sdk-runtime-api)
- [Text Processing Facade](#text-processing-facade)
- [Type Facade Exports](#type-facade-exports)
- [Current Implementation Notes and Gaps](#current-implementation-notes-and-gaps)

---

## Overview

This document describes the real protocol and SDK behavior currently implemented in `@memizy/multiplayer-sdk` version `0.3.0`.

The SDK is designed for Split-Lobby multiplayer sessions with three start phases:

1. `Init`
2. `Prepare`
3. `Start`

The same SDK bundle can run in two roles, selected by host initialization:

- `host`
- `player`

The role is assigned from incoming `INIT_SESSION` or legacy `MULTI_INIT` messages.

---

## Architecture

### Split-Lobby run modes

`InitContext.runMode` can carry one of these values:

- `host-settings`
- `host-game`
- `client-game`

Typical intent:

- `host-settings`: teacher setup UI before game launch.
- `host-game`: teacher/game board runtime.
- `client-game`: student controller runtime.

### Role-specific behavior

- In `host` role, SDK routes player lifecycle and action events to host callbacks.
- In `player` role, SDK routes state updates and start lifecycle hooks to player callbacks.

---

## Lifecycle

Current runtime lifecycle in the SDK:

1. Plugin calls `start()`.
2. SDK attaches `window` message listener.
3. SDK sends `PLUGIN_READY` once (id + version).
4. Host App responds with `INIT_SESSION` (or legacy `MULTI_INIT`).
5. SDK resolves `role` and normalized `InitContext`, then calls:
   - `defineHost().onInit(context)` for host role
   - `definePlayer().onInit(context)` for player role
6. Host App may send `PREPARE_GAME` with finalized players.
7. Host App may send `START_GAME` to start active gameplay.
8. Plugin may send `MULTI_READY` when loading/preparation is complete.

---

## Message Envelope

The SDK expects postMessage envelopes with a `type` string and optional `payload`.

```ts
interface MessageEnvelope {
  type: string
  payload?: unknown
  role?: 'host' | 'player' | null
  context?: unknown
}
```

For initialization compatibility:

- Role is extracted from: `message.role`, `message.context.role`, or `message.payload.role`.
- Context is extracted from: `message.context` or `message.payload`.

---

## Message Protocol

## Host App -> Plugin messages

### INIT_SESSION

Primary initialization message.

```ts
{
  type: 'INIT_SESSION',
  role: 'host' | 'player',
  context: InitContext
}
```

SDK effects:

- Sets active role.
- Normalizes missing fields (`pin`, `items`, `assets`, etc.).
- Stores `context.assets` into internal session asset map for rich text rendering.
- Calls `onInit` callback for active role.

### MULTI_INIT (legacy)

Backward-compatible initialization message accepted by the SDK.

```ts
{
  type: 'MULTI_INIT',
  role?: 'host' | 'player',
  context?: InitContext & { role?: 'host' | 'player' },
  payload?: InitContext & { role?: 'host' | 'player' }
}
```

### PREPARE_GAME

Prepare phase event.

```ts
{
  type: 'PREPARE_GAME',
  payload: { players: MultiPlayer[] }
}
```

SDK routing:

- host role -> `hostConfig.onPrepareGame(players)`
- player role -> `playerConfig.onPrepareGame(players)`

### START_GAME

Start phase event.

```ts
{
  type: 'START_GAME'
}
```

SDK routing:

- host role -> `hostConfig.onStartGame()`
- player role -> `playerConfig.onStartGame()`

### PLAYER_JOINED

Delivered to host role only.

```ts
{
  type: 'PLAYER_JOINED',
  payload: MultiPlayer
}
```

### PLAYER_LEFT

Delivered to host role only.

```ts
{
  type: 'PLAYER_LEFT',
  payload: { playerId: string } | string
}
```

### MULTI_ACTION

Delivered to host role only. Supports two payload shapes:

```ts
{
  type: 'MULTI_ACTION',
  payload: {
    playerId?: string,
    playerName?: string,
    type: string,
    data?: unknown
  }
}
```

or

```ts
{
  type: 'MULTI_ACTION',
  payload: {
    action?: { type: string; data?: unknown },
    playerId?: string
  }
}
```

SDK maps payload to:

- `hostConfig.onPlayerAction(action, playerId)`

If action cannot be resolved, SDK falls back to `{ type: 'unknown', data: undefined }`.

### STATE_UPDATE

Delivered to player role only.

```ts
{
  type: 'STATE_UPDATE',
  payload: { state?: GameState } | GameState
}
```

SDK extracts state from either `payload.state` or `payload`, then calls:

- `playerConfig.onStateUpdate(state)`

## Plugin -> Host App messages

### PLUGIN_READY

Sent automatically by `start()` once.

```ts
{
  type: 'PLUGIN_READY',
  payload: {
    id: string,      // window.location.origin + window.location.pathname
    version: string  // SDK_VERSION constant (currently 0.3.0)
  }
}
```

### MULTI_READY

Sent by plugin via `postReadyToStart()`.

```ts
{
  type: 'MULTI_READY'
}
```

Use this after plugin-side preload/get-ready work is complete.

### MULTI_BROADCAST

Sent by host-side plugin logic via `host.broadcastState(state)`.

```ts
{
  type: 'MULTI_BROADCAST',
  payload: State
}
```

### MULTI_ACTION

Sent by player-side plugin logic via `player.sendAction(type, data)`.

```ts
{
  type: 'MULTI_ACTION',
  payload: {
    type: string,
    data: unknown
  }
}
```

### SESSION_COMPLETED

Sent by host-side plugin logic via `host.endSession(scores)`.

```ts
{
  type: 'SESSION_COMPLETED',
  payload: Record<string, MultiPlayer>
}
```

---

## Message Reference Table

| Message | Direction | Consumed/Sent by SDK | Notes |
| :--- | :--- | :--- | :--- |
| `PLUGIN_READY` | Plugin -> Host App | Sent | Automatic in `start()` |
| `INIT_SESSION` | Host App -> Plugin | Consumed | Primary init |
| `MULTI_INIT` | Host App -> Plugin | Consumed | Legacy init fallback |
| `PREPARE_GAME` | Host App -> Plugin | Consumed | Split-Lobby phase 2 |
| `START_GAME` | Host App -> Plugin | Consumed | Split-Lobby phase 3 |
| `MULTI_READY` | Plugin -> Host App | Sent | Via `postReadyToStart()` |
| `PLAYER_JOINED` | Host App -> Plugin | Consumed | Host role only |
| `PLAYER_LEFT` | Host App -> Plugin | Consumed | Host role only |
| `MULTI_ACTION` | Bi-directional | Both | Player -> app send, app -> host consume |
| `MULTI_BROADCAST` | Plugin -> Host App | Sent | Host broadcast state |
| `STATE_UPDATE` | Host App -> Plugin | Consumed | Player role only |
| `SESSION_COMPLETED` | Plugin -> Host App | Sent | End session with scores |

---

## SDK Runtime API

Current public runtime surface returned by `createMultiplayerPlugin<State>()`:

- `defineHost(config)`
- `definePlayer(config)`
- `host.broadcastState(state)`
- `host.endSession(scores)`
- `player.sendAction(type, data)`
- `postReady()`
- `postReadyToStart()`
- `parseTextTokens(rawText)`
- `renderHtml(rawText, options?)`
- `start()`

---

## Text Processing Facade

The SDK directly reuses OQSE rich-text processors and session assets:

- `parseTextTokens(rawText)` -> `tokenizeOqseTags(rawText)`
- `renderHtml(rawText, options?)` -> `prepareRichTextForDisplay(...)`

`renderHtml` behavior:

- Supports optional markdown parser callback.
- Supports optional sanitizer callback.
- Resolves `<asset:...>` tags via session assets captured from init context.
- Replaces `<blank:...>` with text input placeholders.

---

## Type Facade Exports

The SDK re-exports selected OQSE core types from its package entrypoint, so plugin authors can import these types directly from `@memizy/multiplayer-sdk`.

Current facade exports:

- `OQSEItem`
- `OQSEMeta`
- `MediaObject`
- `ProgressRecord`
- `ProgressStats` (alias of `StatsObject`)
- `ProgressLastAnswer` (alias of `LastAnswerObject`)

---

## Current Implementation Notes and Gaps

This section lists real, current behavior that is important for integrators.

1. The SDK currently posts to `window.parent` with target origin `*`.
2. The SDK does not currently validate incoming message origin/source before consuming events.
3. `SESSION_COMPLETED` is sent by `host.endSession`, but no dedicated TypeScript interface exists yet in `src/types.ts`.
4. There is no explicit host acknowledgment message implemented for `MULTI_READY` in this SDK.
5. `runMode` is optional in `InitContext`; plugins should handle missing values defensively.
6. `MULTI_INIT` remains supported for compatibility and is still part of effective runtime contract.

If you want, these gaps can be turned into a follow-up hardening roadmap (typed `SESSION_COMPLETED`, strict origin checks, and optional `READY_ACK` contract).
