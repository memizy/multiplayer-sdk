# Multiplayer Quiz Example — @memizy/multiplayer-sdk

A live, brand-aligned sandbox for the `@memizy/multiplayer-sdk` v0.4.1. One
HTML page instantiates a full in-memory session — a host plugin plus
several player plugins, all sharing a `MemoryMockHub` — so every state
broadcast, transient event and player action actually travels between
them.

This example covers the **entire** public surface:

- 🛠️ `sdk.settings.update()` / `sdk.settings.set()` in the
  `host-settings` phase
- ⏳ `sdk.room.clientReady()` / `sdk.room.hostReady()` /
  `sdk.room.startGame()` lifecycle signals
- 👥 **Teams** (`supportsTeams`), **late join** (`supportsLateJoin`),
  **reconnect** (`supportsReconnect`) — all reachable from the toolbar
- 🔁 `sdk.host.setState()` + `sdk.host.updateState()` producing
  full-state broadcasts and minimal JSON-patch diffs
- 📨 `sdk.host.sendStateTo()` for per-player catch-up
- 📣 `sdk.host.sendEvent()` transient toasts / reveal pings
- 🎯 `sdk.player.sendAction()` + `sdk.player.onStateChange()` /
  `onEvent()` / `onGameEnd()`
- 🏁 `sdk.host.endGame()` with a per-player and per-team scoreboard

## Two entry points

| Page            | What it shows |
|-----------------|----------------|
| `index.html`    | **Full sandbox** — one host SDK + several player SDKs side-by-side with a live protocol log. Pedagogically dense but not a real deployable plugin. |
| `minimal.html`  | **Real single plugin** — exactly the shape `plugin-sdk/example/minimal.html` has: one `new MemizyMultiplayerSDK()`, one `await sdk.connect()`, the SDK's landing page routes the user to host or player. Invisible bot SDKs on a shared `MemoryMockHub` fill in the other participants so a single tab shows a working game. Drop the plugin code into a real Memizy lobby and it works unchanged. |

## Run it locally

From the `multiplayer-sdk/` package root:

```bash
npm install
npm run example:dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The Vite
dev server aliases `@memizy/multiplayer-sdk` to the package's own
`src/`, so edits to the SDK hot-reload instantly.

## Try the features

1. **Change settings** in the host screen (question count, per-question
   timer, teams toggle, live leaderboard). Every slider/checkbox hits
   `sdk.settings.update()` which ships a JSON patch through
   `settings:patch`.
2. **Start game** — the host calls `sdk.room.hostReady()` and advances
   the hub to `synchronizing`. Each player SDK auto-calls
   `sdk.room.clientReady()` after a short "loading" delay. Once the
   host sees everyone ready it calls `sdk.room.startGame()`.
3. **Add / remove players** from the toolbar to test lobby events
   (`onPlayerJoin`, `onPlayerLeave`).
4. **Disconnect + Reconnect last** simulates a dropout. On reconnect
   the host receives `onPlayerJoin` with `isReconnect: true` and
   pushes the current state via `sdk.host.sendStateTo(playerId)`.
5. **Late join** (while the game is running) connects a brand-new
   player. The host fires `onPlayerJoin` with `isLateJoin: true` and
   again sends the current state directly to them.

## Build for GitHub Pages

```bash
npm run example:build
```

The static bundle lands in `example/dist/` ready to deploy. Both
`index.html` and `minimal.html` end up as first-class routes.

## Files

| File                    | What it does |
|-------------------------|---------------|
| `index.html`            | Full sandbox layout + manifest island. |
| `minimal.html`          | Standalone ~180-line minimal demo. |
| `style.css`             | Brand tokens, sidebar, sandbox grid, phase pills. |
| `src/main.ts`           | Full sandbox logic — settings, question loop, teams, late join, reconnect, events, end-game. |
| `src/minimal.ts`        | Smallest working host + player harness. |
| `src/sample-set.ts`     | Hard-coded demo `OQSEItem[]`. |
| `vite.config.ts`        | Dev server + GH-Pages base-path + SDK alias. |
| `tsconfig.json`         | Per-example TS config. |

## SDK alias

Just like `plugin-sdk/example`, this example resolves
`@memizy/multiplayer-sdk` to the package's own `src/index.ts` via
`tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). You
can import the SDK exactly as a consumer would, while still getting
instant hot-reload on every SDK edit.
