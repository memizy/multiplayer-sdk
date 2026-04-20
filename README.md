# Memizy Multiplayer SDK

TypeScript SDK for Memizy multiplayer plugins. It provides a declarative `postMessage` bridge for host and player plugins, plus manifest and sandbox helpers for standalone development.

Version: `0.3.0` (API `0.3`)

## What changed in v0.3

- Split-Lobby lifecycle is now first-class with 3 phases: `Init -> Prepare -> Start`.
- `context.runMode` now indicates one of `host-settings`, `host-game`, or `client-game`.
- New incoming events: `PREPARE_GAME` and `START_GAME`.
- New outgoing event: `MULTI_READY` via `sdk.postReadyToStart()`.
- SDK now injects package version automatically into `PLUGIN_READY`.
- Rich text helpers are available on the SDK instance via `sdk.parseTextTokens()` and `sdk.renderHtml()`.

## Core APIs

- `createMultiplayerPlugin()` creates the host/player bridge.
- `loadManifestFromDataIsland()` reads an OQSE manifest from `<script type="application/oqse-manifest+json">`.
- `renderLandingPageIfNeeded()` renders a standalone landing page when the plugin is opened outside an iframe.
- `createLocalSandbox()` mounts a local host/player preview for development.

## Minimal plugin flow (3-Phase Start)

The SDK uses a "Split-Lobby" architecture. The Host app (Memizy) manages the network lobby and waiting screens. The plugin operates in 3 distinct modes provided via `context.runMode`:

1. **`host-settings`**: Renders a setup form on the teacher's screen before the game starts.
2. **`host-game`**: Renders the main game board on the teacher's screen.
3. **`client-game`**: Renders the controller on the students' devices.

```ts
import { createMultiplayerPlugin } from '@memizy/multiplayer-sdk'

const sdk = createMultiplayerPlugin()

// 1. Host Logic (Teacher's Screen)
sdk.defineHost({
	onInit(context) {
		if (context.runMode === 'host-settings') {
			console.log('Render setup form (e.g., Round Time, Difficulty)')
		} else if (context.runMode === 'host-game') {
			console.log('Render main game board')
		}
	},
	onPrepareGame(players) {
		console.log('Final players received. Downloading 3D models/assets...', players)
		// Signal Memizy that we are done loading so it can hide the "Get Ready" screen
		sdk.postReadyToStart()
	},
	onStartGame() {
		console.log('Memizy gave the green light. START!')
	},
	onPlayerAction(action, playerId) {
		console.log('Player performed action', playerId, action)
	}
})

// 2. Player Logic (Student's Phone)
sdk.definePlayer({
	onInit(context) {
		if (context.runMode === 'client-game') {
			console.log('Render mobile controller (A/B/C/D buttons)')
		}
	},
	onPrepareGame(players) {
		sdk.postReadyToStart()
	},
	onStartGame() {
		console.log('Enable buttons, start playing!')
	}
})

sdk.start()
```

## Rich text helpers

For OQSE content, the SDK now exposes:

- `sdk.parseTextTokens(rawText)` to parse OQSE tags/tokens.
- `sdk.renderHtml(rawText, options?)` to render safe HTML with asset and blank replacement.

## Manifest data island

```html
<script type="application/oqse-manifest+json">
{
	"version": "0.1",
	"id": "https://example.com/plugins/my-plugin/",
	"appName": "My Plugin",
	"description": "Standalone Memizy plugin",
	"capabilities": {
		"actions": ["render"],
		"types": ["mcq-single", "short-answer"]
	}
}
</script>
```

## Standalone usage

When the plugin is opened directly in the browser, `renderLandingPageIfNeeded()` shows a lightweight landing page with manifest details and links to the docs and sandbox.

## Local sandbox

Use `createLocalSandbox({ mount, pluginUrl })` to mount a host and player iframe side by side and test the handshake locally.

Standalone quiz example: https://github.com/memizy/multiplayer-quiz
