# Host Protocol Reference

> The wire-level contract between a multiplayer plugin and the Memizy Host
> application. For plugin-author ergonomics, start with
> [`plugin-developers.md`](./plugin-developers.md) — this document is the
> host-integration reference.

`@memizy/multiplayer-sdk` version **`0.4.0`** speaks protocol version
**`0.4`**.

---

## Table of contents

1. [Transport: Penpal over `postMessage`](#transport-penpal-over-postmessage)
2. [Handshake and identity](#handshake-and-identity)
3. [Init session payload](#init-session-payload)
4. [Lifecycle phases & run modes](#lifecycle-phases--run-modes)
5. [`HostApi` — plugin → host calls](#hostapi--plugin--host-calls)
6. [`PluginApi` — host → plugin calls](#pluginapi--host--plugin-calls)
7. [Data shapes](#data-shapes)
8. [Sequence diagrams](#sequence-diagrams)
9. [Invariants enforced by the SDK](#invariants-enforced-by-the-sdk)
10. [Security notes for host integrators](#security-notes-for-host-integrators)
11. [Forward-compatibility policy](#forward-compatibility-policy)

---

## Transport: Penpal over `postMessage`

Every frame exchanged between the plugin iframe and the Memizy Host
application is a **Penpal RPC call**. The SDK wires this up as follows:

```
┌──────────────── Plugin iframe ────────────────┐
│ MemizyMultiplayerSDK                           │
│   ├─ WindowMessenger(remoteWindow = parent)    │
│   ├─ penpal.connect<HostApi>({                 │
│   │     methods: <PluginApi implementation>,   │
│   │     timeout: handshakeTimeout,             │
│   │   })                                       │
│   └─ hostProxy: RemoteProxy<HostApi>           │
└────────────────────────────────────────────────┘
                  ▲         │
     postMessage  │         │  postMessage
                  │         ▼
┌──────────────── Memizy Host app ───────────────┐
│ penpal.connect({                                │
│   methods: <HostApi implementation>,            │
│   remoteWindow: iframe.contentWindow,           │
│ })                                              │
└────────────────────────────────────────────────┘
```

Each side implements its **own** half of the contract (`HostApi` on the
host, `PluginApi` on the plugin) and receives a typed proxy for the
opposite half. All methods return `Promise<T>` because Penpal marshals
replies asynchronously.

### Origin allowlist

The SDK accepts `allowedOrigins?: (string | RegExp)[]`. Host integrators
SHOULD tighten this in production:

```ts
new MemizyMultiplayerSDK({
  id, version,
  allowedOrigins: [
    'https://learn.memizy.com',
    /^https:\/\/plugins-[a-z0-9]+\.memizy\.app$/,
  ],
});
```

The **host** side must similarly restrict `childOrigin` when creating its
Penpal child connection; plugins served from unrecognised origins should
be rejected before `sysReady` can resolve.

### Serialization

All payloads are transported via `postMessage`, so:

- Functions, classes, and DOM nodes are NOT supported.
- `structuredClone`-compatible values are (plain objects, arrays,
  `ArrayBuffer`, `Date`, `Map`, `Set`, …).
- `undefined` inside arrays is converted to `null` by Penpal in some
  browsers — avoid holes in arrays you transmit.

The SDK never transmits `Error` instances directly; errors are converted
to `PluginErrorReport` values (`code` + `message` + context).

---

## Handshake and identity

1. The plugin iframe loads. The Host application calls
   `penpal.connect({ methods: HostApi })` with the iframe's
   `contentWindow`.
2. The plugin calls `penpal.connect<HostApi>()` against `window.parent`
   and waits for the resulting proxy.
3. The plugin calls `sysReady(identity)` to register itself and receive
   the initial session payload.

```ts
interface PluginIdentity {
  id:        string;  // matches the manifest id
  version:   string;  // plugin version
  sdkVersion: string; // @memizy/multiplayer-sdk package version
  protocol:  string;  // required protocol version (e.g. '0.4')
}
```

`sdkVersion` is injected by the SDK build (`__SDK_VERSION__`) and sent
automatically during `sdk.connect()`.

The host MAY refuse to serve a plugin whose `protocol` is incompatible
(semver major/minor check) by rejecting the `sysReady` promise with a
well-known error code.

Handshake timeout: default `10_000` ms. If the parent window never
answers, Penpal rejects `connect()` and the SDK surfaces the error.

---

## Init session payload

`HostApi.sysReady` returns an `InitSessionPayload`:

```ts
interface InitSessionPayloadBase {
  sessionId: string;              // globally unique
  pin: string;                    // 4-6 digit lobby code
  role: 'host' | 'player';
  runMode: 'host-settings' | 'host-game' | 'client-game';
  phase: 'host-settings' | 'synchronizing' | 'playing' | 'finished';

  items: OQSEItem[];              // immutable study set
  setMeta?: OQSEMeta;             // optional
  assets: Record<string, MediaObject>;

  players: MultiPlayer[];
  teams: TeamInfo[];

  supportsTeams: boolean;
  supportsLateJoin: boolean;
  supportsReconnect: boolean;
  capacity: { min: number; max: number; recommended?: number };

  configuration: { locale: string; theme: 'light' | 'dark' | 'system' };
  settings: Record<string, unknown>;  // plugin-defined

  gameState?: unknown;            // only populated for late-joiners
}

interface HostInitSessionPayload   extends InitSessionPayloadBase { role: 'host'; }
interface PlayerInitSessionPayload extends InitSessionPayloadBase {
  role: 'player';
  self: MultiPlayer;              // the current player's profile
}
```

**Responsibilities:**

- `sessionId` / `pin` are stable for the lifetime of the lobby.
- `items`, `assets`, `setMeta` are **immutable** — the multiplayer SDK
  intentionally omits mutation primitives. Editing happens via the
  single-player SDK or the Memizy web app.
- `players` MUST include the player themselves (and their `self` record
  MUST match one of the entries) when the role is `'player'`.
- For **late-joiners** (role `'player'`, phase `'playing'` or later),
  `gameState` MUST be the authoritative state at the moment of join.

---

## Lifecycle phases & run modes

### Phases

```
host-settings ──► synchronizing ──► playing ──► finished
```

Each transition is announced with `PluginApi.onPhaseChange(phase)`. The
transition is driven by the host application:

- `host-settings → synchronizing` after the host app processes
  `HostApi.roomStartGame()` or its own timeout.
- `synchronizing → playing` after the host plugin calls
  `HostApi.roomStartGame()` a second time (once all players are ready or
  the grace timeout expired).
- `* → finished` after `HostApi.gameEndSession(result)` resolves.

### Run modes

`runMode` is a secondary classification the host app sets at init time
to make UI branching easier. It never changes mid-session.

| Run mode          | Role    | Typical phase on init |
| ----------------- | ------- | --------------------- |
| `host-settings`   | host    | `host-settings`       |
| `host-game`       | host    | `synchronizing`       |
| `client-game`     | player  | `synchronizing`       |

A late-joining player still gets `runMode: 'client-game'` even though
their initial phase is `'playing'`.

---

## `HostApi` — plugin → host calls

All methods return `Promise<void>` unless noted.

### System

| Method                                         | When the plugin calls it                                    |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `sysReady(identity): Promise<InitSessionPayload>` | Once, right after the Penpal handshake.                  |
| `sysRequestResize(request)`                    | Plugin wants a different iframe height/width.               |
| `sysReportError(report)`                       | Non-fatal error for host telemetry.                         |
| `sysExit()`                                    | Plugin is voluntarily closing.                              |

```ts
interface ResizeRequest {
  height: number | 'auto';
  width?: number | 'auto' | null;
}

interface PluginErrorReport {
  code: string;
  message: string;
  context?: Record<string, unknown> | null;
}
```

The host SHOULD implement `sysRequestResize` as a hint (not a hard
constraint) so the host app layout remains authoritative.

### Settings (host role only, `host-settings` phase only)

| Method                                  | Semantics                                                      |
| --------------------------------------- | -------------------------------------------------------------- |
| `settingsReplace(settings)`             | Host adopts the full object as the new truth.                  |
| `settingsApplyPatches(patches)`         | Host applies JSON patches to the previously committed object.  |
| `settingsSetValid(valid)`               | Host toggles the "Start game" button.                          |

The host MUST validate the resulting object against any business rules
before exposing it to the teacher UI. Invalid settings SHOULD be
rejected (the Penpal promise resolves with a host-side error code or
the host calls `onConfigUpdate` to revert).

### Room / synchronization

| Method                | Role    | Meaning                                                                |
| --------------------- | ------- | ---------------------------------------------------------------------- |
| `roomClientReady()`   | player  | Player's UI is fully rendered; host should fire `onPlayerReady`.       |
| `roomHostReady()`     | host    | Host plugin is ready for the "Start" signal.                           |
| `roomStartGame()`     | host    | Authoritatively promote the session to `playing`.                      |

The host is free to ignore `roomStartGame()` if a prerequisite (e.g.
`supportsTeams` + every player assigned) is unmet — but it SHOULD emit a
`sysReportError` or `onConfigUpdate` to tell the plugin why.

### Game (host role, broadcasts)

| Method                                      | Effect                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| `gameBroadcastState(state)`                 | Host forwards `state` to every connected player.           |
| `gameBroadcastStatePatches(patches)`        | Host applies `patches` to the latest state and forwards.   |
| `gameSendStateTo(playerId, state)`          | Host forwards `state` to **one** player (late-join/reconnect). |
| `gameSendEvent(target, event)`              | Host dispatches a transient event (not persisted).         |
| `gameEndSession(result)`                    | Host transitions to `finished`, pushes `onGameEnd`.        |

`target` is `'all'`, a single `playerId` string, or a list of
`playerId`s.

### Game (player role)

| Method                   | Effect                                           |
| ------------------------ | ------------------------------------------------ |
| `gameSendAction(action)` | Host forwards to host plugin's `onPlayerAction`. |

The host MUST include the `playerId` when forwarding to the host plugin
— the plugin has no way of identifying the sender otherwise.

---

## `PluginApi` — host → plugin calls

All methods return `Promise<void>`. The plugin's implementations swallow
internal exceptions so a misbehaving handler never breaks the host.

### Common (both roles)

| Method                             | When the host calls it                                |
| ---------------------------------- | ----------------------------------------------------- |
| `onConfigUpdate(config)`           | Theme / locale changed mid-session.                   |
| `onSessionAborted(reason)`         | Session was terminated externally.                    |
| `onPhaseChange(phase)`             | Phase transition (one per actual change).             |

```ts
type ConfigUpdate = Partial<{
  locale: string;
  theme:  'light' | 'dark' | 'system';
}>;

type SessionAbortedReason =
  | 'user_exit'
  | 'timeout'
  | 'host_error'
  | 'kicked'
  | 'room_closed';
```

### Host role

| Method                              | When the host calls it                                    |
| ----------------------------------- | --------------------------------------------------------- |
| `onPlayerJoin(player, meta)`        | Any `room:join` (initial, reconnect, or late join).       |
| `onPlayerLeave(playerId)`           | A player disconnected / left.                             |
| `onPlayerRename(playerId, newName)` | A player changed their name.                              |
| `onPlayerReady(playerId)`           | A player plugin called `roomClientReady()`.               |
| `onPlayerAction(playerId, action)`  | A player plugin called `gameSendAction(action)`.          |
| `onStartGameRequested()`            | Teacher pressed "Start game" in the host-settings UI.     |

```ts
interface PlayerJoinMeta {
  isReconnect: boolean;   // same playerId as before
  isLateJoin:  boolean;   // phase was 'playing' when they joined
}
```

`isReconnect` and `isLateJoin` are NOT mutually exclusive — a previously
dropped player re-joining mid-game has `isReconnect && isLateJoin`.

### Player role

| Method                     | When the host calls it                                 |
| -------------------------- | ------------------------------------------------------ |
| `onState(state)`           | Full-state broadcast from the host plugin.             |
| `onStatePatches(patches)`  | JSON patches on top of the most recently delivered state. |
| `onEvent(event)`           | Transient event (sound, toast, confetti, …).           |
| `onGameEnd(result)`        | Host plugin called `gameEndSession`.                   |

`onStatePatches` MUST be applied on top of the *previous* state. If the
plugin somehow missed a broadcast the host SHOULD re-send a full state
rather than emit an unprocessable patch.

---

## Data shapes

### `MultiPlayer`

```ts
interface MultiPlayer {
  id: string;             // stable, host-assigned
  name: string;
  joinedAt: number;       // ms since epoch
  teamId?: string;        // only when supportsTeams is true
  meta?: Record<string, unknown>;
}
```

`meta` is opaque — plugins MUST treat unknown keys as transparent.
Standard keys suggested by the host app:

- `meta.avatarUrl`
- `meta.color`

### `TeamInfo`

```ts
interface TeamInfo {
  id: string;
  name: string;
  color?: string;         // CSS hex (e.g. '#ef4444')
}
```

### `PlayerAction`

```ts
interface PlayerAction<Data = unknown> {
  type: string;           // plugin-defined (e.g. 'answer', 'buzz')
  data?: Data;
}
```

### `GameEvent`

```ts
interface GameEvent<Data = unknown> {
  type: string;
  data?: Data;
}

type EventTarget = 'all' | string | string[];
```

### `SessionResult`

```ts
interface SessionResult {
  scores: Record<string, number>;   // playerId → score
  summary?: Record<string, unknown>;
}
```

### `JsonPatch`

Structurally compatible with mutative's default output
(`enablePatches: true`, `pathAsArray: true`):

```ts
interface JsonPatch {
  op: 'add' | 'remove' | 'replace';
  path: (string | number)[];
  value?: unknown;
}
type JsonPatches = JsonPatch[];
```

The host may apply these with mutative's `apply()` or any RFC 6902 patch
library (RFC 6902 uses string paths; mutative uses arrays of strings /
indices, which map unambiguously).

### `OQSEItem`, `OQSEMeta`, `MediaObject`

Re-exported from [`@memizy/oqse`](https://www.npmjs.com/package/@memizy/oqse).
See the OQSE specification for exhaustive field definitions.

---

## Sequence diagrams

### 1. Host: `host-settings` → `playing`

```
Teacher UI               Host app                     Host plugin
    │                       │                               │
    │  "Configure"          │                               │
    ├──────────────────────►│                               │
    │                       │   sysReady(identity)          │
    │                       │◄──────────────────────────────┤
    │                       │─►InitSessionPayload ──────────►│
    │                       │                               │
    │                       │   settingsApplyPatches(...)   │
    │                       │◄──────────────────────────────┤
    │                       │   settingsSetValid(true)      │
    │                       │◄──────────────────────────────┤
    │                       │                               │
    │  "Start game"         │                               │
    ├──────────────────────►│                               │
    │                       │   onStartGameRequested()      │
    │                       ├──────────────────────────────►│
    │                       │                               │
    │                       │   onPhaseChange('synchronizing')
    │                       ├──────────────────────────────►│
    │                       │   roomStartGame()  (for players to load)
    │                       │◄──────────────────────────────┤
```

### 2. Player readiness → `playing`

```
Host plugin            Host app           Player plugin
     │                     │                    │
     │                     │  (iframe loads)    │
     │                     │◄───────────────────┤ sysReady(identity)
     │                     │───────────────────►│ InitSessionPayload
     │                     │                    │
     │                     │◄───────────────────┤ roomClientReady()
     │  onPlayerReady(id)  │                    │
     │◄────────────────────┤                    │
     │                     │                    │
     │  roomStartGame()    │                    │
     ├────────────────────►│                    │
     │                     │  onPhaseChange('playing')
     │                     ├──all───────────────►│
```

### 3. Action round-trip

```
Player plugin          Host app          Host plugin
     │                    │                   │
     │ gameSendAction({type:'answer'...})     │
     ├───────────────────►│                   │
     │                    │ onPlayerAction(id,a)
     │                    ├──────────────────►│
     │                    │                   │
     │                    │ gameBroadcastStatePatches(patches)
     │                    │◄──────────────────┤
     │ onStatePatches(patches)                │
     │◄───────────────────┤                   │
```

### 4. Late join

```
New player            Host app             Host plugin
    │                     │                       │
    │  (iframe loads)     │                       │
    │────────────────────►│ sysReady(identity)    │
    │                     │───────────────────────►│ onPlayerJoin(p,{isLateJoin:true})
    │                     │                       │
    │                     │  gameSendStateTo(id, state)
    │                     │◄──────────────────────┤
    │ onState(state)      │                       │
    │◄────────────────────┤                       │
    │                     │                       │
    │ roomClientReady()   │                       │
    ├────────────────────►│ onPlayerReady(id)     │
    │                     │───────────────────────►│
```

---

## Invariants enforced by the SDK

The SDK guards the plugin side of the contract so host integrators can
rely on the following without runtime checks:

1. **Penpal handshake first.** No `HostApi` method is invoked before the
   handshake completes and `sysReady` resolves.
2. **One `sysReady` per lifetime.** The SDK caches the result; repeated
   `connect()` calls return the cached payload.
3. **Role-guarded methods.** `sdk.host.*` / `sdk.player.*` throw
   `SdkRoleError` at call time if the role is wrong. Hosts can assume
   they will never receive `gameBroadcastState` from a player or
   `gameSendAction` from a host.
4. **Settings authoring only during `host-settings`.** The SDK does NOT
   yet block `settings*` outside the phase at runtime, but the host
   application SHOULD reject late calls.
5. **Patch cadence.** `gameBroadcastStatePatches` is NEVER emitted
   without a prior `gameBroadcastState` or `gameSendStateTo` having
   seeded the player. If a plugin sends patches out of order it is
   either a bug or a late joiner that never received the state — the
   host SHOULD detect this and request a full re-broadcast.
6. **Destruction.** After `destroy()` the SDK rejects every further
   method with `SdkDestroyedError`. The Penpal connection is torn down
   cleanly.

---

## Security notes for host integrators

- **Never trust `identity.id`.** Cross-check it against the URL loaded
  in the iframe. A compromised plugin could claim any id.
- **Validate settings.** `settingsReplace` / `settingsApplyPatches`
  accept arbitrary JSON. Run a schema validation (Zod, Ajv, …) before
  persisting.
- **Don't execute plugin-supplied HTML.** Rich-text assets are sanitised
  on the plugin side, but you SHOULD still CSP-sandbox the iframe
  (`sandbox="allow-scripts allow-same-origin"` at minimum; drop
  `allow-same-origin` for untrusted plugins).
- **Restrict origins.** Use strict `allowedOrigins` / `childOrigin`
  lists on both sides.
- **Enforce `requiresHostScreen` and `clientOrientation`.** The plugin
  cannot do this itself; the host shell must refuse the role assignment
  when the device doesn't qualify.
- **Honor `multiplayerSdk` manifest flags** under
  `appSpecific.memizy.multiplayerSdk`.
  `customSyncScreen` / `hasSettingsScreen` control host-shell UI decisions,
  while `apiVersion` / `minimumHostApiVersion` provide compatibility
  metadata used during host/plugin version negotiation.
- **Rate-limit actions.** `gameSendAction` is unthrottled at the
  protocol level. The host SHOULD enforce per-player rate limits before
  forwarding to `onPlayerAction`.

---

## Forward-compatibility policy

- **Adding methods** to `HostApi` / `PluginApi` is a minor-version bump.
  Plugins using an older minor SHOULD continue to work; unknown methods
  resolve to noop implementations.
- **Adding optional fields** to payload shapes is a minor-version bump.
- **Removing / renaming** anything is a major-version bump (triggers a
  new `protocol` value; the host MAY refuse older plugins).

Plugins declare the minimum protocol they require via
`PluginIdentity.protocol`. The Memizy Host application compares this to
its own supported range and rejects the handshake when mismatched.
