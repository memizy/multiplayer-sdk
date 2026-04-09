# Memizy Multiplayer SDK

TypeScript SDK for Memizy multiplayer plugins. It provides a declarative `postMessage` bridge for host and player plugins, plus manifest and sandbox helpers for standalone development.

Version: `0.2.0`

## What changed in v0.2

- Plugins announce readiness with `PLUGIN_READY`.
- Hosts respond with `INIT_SESSION`.
- `MULTI_INIT` is still accepted as a legacy fallback for older plugins.
- The sandbox emits both `INIT_SESSION` and `MULTI_INIT` so existing examples keep working while you migrate.

## Core APIs

- `createMultiplayerPlugin()` creates the host/player bridge.
- `loadManifestFromDataIsland()` reads an OQSE manifest from `<script type="application/oqse-manifest+json">`.
- `renderLandingPageIfNeeded()` renders a standalone landing page when the plugin is opened outside an iframe.
- `createLocalSandbox()` mounts a local host/player preview for development.

## Minimal plugin flow

```ts
import { createMultiplayerPlugin } from '@memizy/multiplayer-sdk'

const sdk = createMultiplayerPlugin()

sdk.defineHost({
	onInit(context) {
		console.log('host init', context)
	},
	onPlayerAction(action, playerId) {
		console.log('player action', playerId, action)
	},
})

sdk.definePlayer({
	onInit(context) {
		console.log('player init', context)
	},
	onStateUpdate(state) {
		console.log('state update', state)
	},
})

sdk.start()
```

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
