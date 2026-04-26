# AI Agent Guide: Single-File HTML Multiplayer Plugins

This guide is for AI agents that need to generate a complete multiplayer plugin as **one `index.html` file** using `@memizy/multiplayer-sdk`.

It includes:
- required manifest shape,
- import map setup,
- host/player lifecycle wiring,
- question rendering patterns,
- safe defaults,
- and a copy-paste starter template.

---

## 1) Non-Negotiable Requirements

When generating a plugin, always satisfy all of these:

1. Use a manifest data-island:
   - `<script type="application/oqse-manifest+json"> ... </script>`
2. Put multiplayer config under:
   - `appSpecific.memizy.multiplayerSdk`
3. Set these fields in `multiplayerSdk`:
   - `apiVersion: "0.4"` (major.minor protocol API)
   - `minimumHostApiVersion: "0.4"`
   - `customSyncScreen: false` unless plugin intentionally renders a custom sync/waiting UI
   - `hasSettingsScreen: true` if plugin renders host settings in iframe
4. Import SDK via ESM import map:
   - `@memizy/multiplayer-sdk@0.4.1` (or the currently requested release)
5. Call `await sdk.connect()` once.
6. Register role-aware handlers:
   - host: `onStartGameRequested`, `onPlayerAction`, etc.
   - player: `onState`, `onGameEnd`, `onEvent`
7. Use `sdk.settings` only in host settings phase.
8. Use `sdk.host` methods only from host role.
9. Use `sdk.player.sendAction(...)` only from player role.
10. Keep all outbound payloads JSON-safe.

---

## 2) Recommended Manifest (Copy Pattern)

Use this exact shape, then adjust IDs and capabilities:

```json
{
  "$schema": "https://memizy.com/schemas/oqse-manifest/v1.0.json",
  "version": "0.1",
  "pluginVersion": "1.0.0",
  "id": "https://example.com/your-plugin/",
  "appName": "Your Multiplayer Plugin",
  "description": "Short plugin description",
  "capabilities": {
    "actions": ["render"],
    "types": [
      "flashcard",
      "mcq-single",
      "mcq-multi",
      "true-false",
      "match-pairs",
      "sort-items",
      "short-answer",
      "note"
    ],
    "assets": { "image": null, "audio": null, "video": null, "model": null },
    "features": ["markdown", "math", "html"]
  },
  "appSpecific": {
    "memizy": {
      "multiplayerSdk": {
        "apiVersion": "0.4",
        "minimumHostApiVersion": "0.4",
        "customSyncScreen": false,
        "hasSettingsScreen": true,
        "players": { "min": 2, "max": 60, "recommended": 20 },
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

Notes:
- `customSyncScreen` defaults to `false` if omitted, but explicitly include it.
- `hasSettingsScreen` defaults to `true` if omitted, but explicitly include it.
- If plugin does **not** support teams, keep `supportsTeams: false`.

---

## 3) Import Map + Dependencies

For single-file HTML (no bundler), use import map:

```html
<script type="importmap">
{
  "imports": {
    "@memizy/multiplayer-sdk": "https://esm.sh/@memizy/multiplayer-sdk@0.4.1",
    "dompurify": "https://esm.sh/dompurify@3",
    "marked": "https://esm.sh/marked@12",
    "katex": "https://esm.sh/katex@0.16",
    "marked-katex-extension": "https://esm.sh/marked-katex-extension@5"
  }
}
</script>
```

If using markdown/math in prompt rendering:
- parse markdown with `marked`
- enable KaTeX extension
- sanitize with `DOMPurify`

---

## 4) Lifecycle Contract You Must Implement

### Core initialization

```ts
const sdk = new MemizyMultiplayerSDK({ id: "your-id", version: "1.0.0" });
await sdk.connect();
```

### `onInit(init)`

- If `init.role === "host"`:
  - render host settings UI,
  - push settings via `sdk.settings.set(...)`,
  - call `sdk.settings.setValid(true|false)`,
  - call `sdk.room.hostReady()`.

- If `init.role === "player"`:
  - render neutral ready UI (not required to be a custom sync screen),
  - call `sdk.room.clientReady()`.

### `onStartGameRequested()` (host)

- Build authoritative state from:
  - `init.items`,
  - current settings,
  - `sdk.room.getPlayers()`.
- Set it via `sdk.host.setState(state)`.
- Move game forward using your own state machine.

### `onPlayerAction(playerId, action)` (host)

- Validate `action.type` and payload shape before applying.
- Update state with `sdk.host.updateState(draft => ...)`.
- Reveal/advance when enough answers exist.

### Player subscriptions

- `sdk.onState((state) => ...)`
- `sdk.onEvent((event) => ...)`
- `sdk.onGameEnd((result) => ...)`

---

## 5) Authoritative State Pattern (Host)

Use one state object as the source of truth:

```ts
type Phase = "question" | "reveal" | "leaderboard" | "finished";

interface GameState {
  phase: Phase;
  currentIndex: number;
  items: unknown[];
  timerSec: number;
  timeRemaining: number;
  revealTimeRemaining: number;
  scores: Record<string, number>;
  answers: Record<string, unknown>;
}
```

Guidelines:
- Only host mutates state.
- Player never trusts local assumptions; only renders state snapshots.
- Always guard against double-answer (`if (answers[playerId]) return`).
- Keep transitions explicit:
  - question -> reveal -> next question / finished.

---

## 6) Type-Specific Answer Validation (Minimum)

Implement per-item validation by `item.type`:

- `mcq-single`, `true-false`: compare one selected index.
- `mcq-multi`: compare sorted selected index arrays.
- `short-answer`: normalize text (`trim`, case rules), compare against accepted answers.
- `match-pairs`: compare left-right mappings.
- `sort-items`: compare submitted order to expected order.
- `flashcard`, `note`: allow ack/continue action (`{ ack: true }`).

Never assume all item types share the same payload shape.

---

## 7) Rendering Rules

1. Do not render host-only controls on player role.
2. Do not call host-only SDK APIs from player role.
3. Sanitize any HTML before injecting into DOM.
4. Disable input after submitting answer.
5. Show deterministic timer feedback (`timeRemaining`, `revealTimeRemaining`).
6. Keep `showScreen(...)` role/phase-driven, not ad-hoc.

---

## 8) Single-File HTML Starter Skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Multiplayer Plugin</title>

  <script type="application/oqse-manifest+json">
  { "...": "manifest from section 2" }
  </script>

  <script type="importmap">
  { "...": "imports from section 3" }
  </script>
</head>
<body>
  <div id="app"></div>

  <script type="module">
    import { MemizyMultiplayerSDK } from "@memizy/multiplayer-sdk";

    const sdk = new MemizyMultiplayerSDK({
      id: "my-plugin-id",
      version: "1.0.0",
    });

    sdk.onInit(async (init) => {
      if (init.role === "host") {
        await sdk.settings.set({ timerSec: 20 });
        await sdk.settings.setValid(true);
        await sdk.room.hostReady();
      } else {
        await sdk.room.clientReady();
      }
    });

    sdk.onStartGameRequested(async () => {
      await sdk.host.setState({
        phase: "question",
        currentIndex: 0,
        items: sdk.session?.items ?? [],
        scores: Object.fromEntries(sdk.room.getPlayers().map((p) => [p.id, 0])),
        answers: {},
        timerSec: 20,
        timeRemaining: 20,
        revealTimeRemaining: 0,
      });
    });

    sdk.onPlayerAction(async (playerId, action) => {
      // validate + update state
    });

    sdk.onState((state) => {
      // player render
    });

    sdk.onGameEnd((result) => {
      // final scoreboard render
    });

    await sdk.connect();
  </script>
</body>
</html>
```

---

## 9) AI Agent Output Checklist

Before finishing generation, verify:

- [ ] Manifest key is `multiplayerSdk` (not `multiplayer`).
- [ ] `apiVersion` uses `"0.4"` (major.minor), not patch.
- [ ] `minimumHostApiVersion` present.
- [ ] `customSyncScreen` and `hasSettingsScreen` explicitly set.
- [ ] Import map uses requested SDK version.
- [ ] Host flow calls `settings.setValid(...)`, `room.hostReady()`.
- [ ] Player flow calls `room.clientReady()`.
- [ ] State transitions are deterministic.
- [ ] All supported item types have payload validation path.
- [ ] HTML output is sanitized when rendering markdown/html.

---

## 10) Common Mistakes to Avoid

1. Using `appSpecific.memizy.multiplayer` (old key).
2. Using `apiVersion: "0.4.1"` instead of protocol-style `"0.4"`.
3. Calling `sdk.host.*` from player role.
4. Accepting unvalidated action payloads.
5. Mutating player UI state without server-authoritative updates.
6. Forgetting `await sdk.connect()`.
7. Not handling late join/reconnect (`onPlayerJoin` + `sendStateTo`).

