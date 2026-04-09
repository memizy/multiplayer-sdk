/**
 * Public type contracts for implementing host/player multiplayer plugins.
 */
export type {
  GamePhase,
  MultiPlayer,
  GameState,
  InitContext,
  HostConfig,
  PlayerConfig,
  PluginReadyMessage,
  InitSessionMessage,
  LegacyMultiInitMessage,
  StateUpdateMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  MultiActionMessage,
  MultiBroadcastMessage,
} from './types'

/**
 * Factory for creating a declarative multiplayer plugin API over window.postMessage.
 */
export { createMultiplayerPlugin } from './sdk'

/**
 * OQSE Manifest utilities for plugin discovery and landing pages.
 */
export type { OQSEManifest } from './manifest'

export {
  loadManifestFromDataIsland,
  isInsideIframe,
  renderLandingPageIfNeeded,
} from './manifest'

/**
 * Local sandbox utilities for simulating host and player runtime.
 */
export type { LocalSandboxOptions, LocalSandboxController } from './sandbox'

export { createLocalSandbox } from './sandbox'
