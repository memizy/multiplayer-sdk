/**
 * Public type contracts for implementing host/player multiplayer plugins.
 */
export type {
  GamePhase,
  RunMode,
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
  PrepareGameMessage,
  StartGameMessage,
  MultiReadyMessage,
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

/**
 * Re-exported OQSE core types for convenience.
 * Developers can type their payloads directly from the multiplayer SDK.
 */
export type {
  OQSEItem,
  OQSEMeta,
  MediaObject,
  ProgressRecord,
  StatsObject as ProgressStats,
  LastAnswerObject as ProgressLastAnswer,
} from '@memizy/oqse'
