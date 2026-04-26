/**
 * @memizy/multiplayer-sdk — v0.4.1
 *
 * Public entry point. One import gets plugin authors:
 *  - The `MemizyMultiplayerSDK` class.
 *  - The namespaced managers' public types.
 *  - The full RPC contract for host-side type safety.
 *  - Manifest + landing-page helpers.
 *  - Re-exports of the OQSE data-model / rich-text API.
 */

// ── Main SDK class & options ───────────────────────────────────────────────
export { MemizyMultiplayerSDK } from './MemizyMultiplayerSDK';
export type {
  MemizyMultiplayerSDKOptions,
  ConnectOptions,
  InitHandler,
  PhaseChangeHandler,
  ConfigUpdateHandler,
  SessionAbortedHandler,
  PlayerJoinHandler,
  PlayerLeaveHandler,
  PlayerReadyHandler,
  PlayerActionHandler,
  StartGameRequestedHandler,
  GameEndHandler,
} from './MemizyMultiplayerSDK';

// ── Manager classes (exported for advanced usage / typing) ─────────────────
export { SysManager } from './managers/SysManager';
export { RoomManager } from './managers/RoomManager';
export { SettingsManager } from './managers/SettingsManager';
export { HostManager } from './managers/HostManager';
export { PlayerManager } from './managers/PlayerManager';
export { TextManager } from './managers/TextManager';

export type { SettingsRecipe } from './managers/SettingsManager';
export type { StateRecipe } from './managers/HostManager';
export type {
  StateChangeHandler,
  GameEventHandler,
} from './managers/PlayerManager';
export type { RenderHtmlOptions } from './managers/TextManager';

// ── Errors ────────────────────────────────────────────────────────────────
export {
  SdkDestroyedError,
  SdkNotReadyError,
  SdkPhaseError,
  SdkRoleError,
} from './errors';

// ── RPC contract (needed by host-side code for type safety) ───────────────
export type {
  HostApi,
  PluginApi,
  PluginIdentity,
  InitSessionPayload,
  InitSessionPayloadBase,
  HostInitSessionPayload,
  PlayerInitSessionPayload,
  SessionSettings,
  ConfigUpdate,
  SessionAbortedReason,
  ResizeRequest,
  PluginErrorReport,
  PlayerAction,
  GameEvent,
  EventTarget,
  SessionResult,
  JsonPatch,
  JsonPatches,
  OQSETextToken,
  PluginRole,
  GamePhase,
  RunMode,
  MultiPlayer,
  TeamInfo,
  PlayerJoinMeta,
} from './rpc/types';

// ── Manifest helpers ──────────────────────────────────────────────────────
export type {
  MultiplayerManifestConfig,
} from './manifest';
export type { OQSEManifest } from '@memizy/oqse';
export {
  loadManifestFromDataIsland,
  isInsideIframe,
  readMultiplayerConfig,
} from './manifest';

// ── Standalone helpers (mock host + landing page) ─────────────────────────
export { MockHost, MemoryMockHub } from './standalone/MockHost';
export type {
  StandaloneMockData,
  MockHub,
  MockParticipant,
} from './standalone/MockHost';

export { renderLandingPageIfNeeded } from './standalone/LandingPage';
export type { LandingPageOptions } from './standalone/LandingPage';

// ── Utility re-exports ────────────────────────────────────────────────────
export { toJsonPatches } from './utils/patches';

// ── OQSE data model (re-exports for convenience) ──────────────────────────
export type {
  OQSEItem,
  OQSEFile,
  OQSEMeta,
  MediaObject,
  MediaType,
  SubtitleTrack,
  AssetDictionary,
  PersonObject,
  SourceMaterial,
  SourceMaterialType,
  SourceReference,
  TagDefinition,
  TagDefinitionDictionary,
  FeatureProfile,
  TranslationObject,
  LinkedSetObject,
  LanguageCode,
  SPDXLicense,
  ISO8601DateTime,
  CoreItemType,
  ExtendedItemType,
  BloomLevel,
  CognitiveLoad,
  Pedagogy,
} from '@memizy/oqse';

// ── OQSE validators & type guards ─────────────────────────────────────────
export {
  // OQSE
  OQSEFileSchema,
  OQSEItemSchema,
  OQSEMetaSchema,
  MediaObjectSchema,
  AssetDictionarySchema,
  FeatureProfileSchema,
  validateOQSEFile,
  safeValidateOQSEFile,
  validateOQSEItem,
  safeValidateOQSEItem,
  // Type guards (useful for plugin render logic)
  isNote,
  isFlashcard,
  isTrueFalse,
  isMCQSingle,
  isMCQMulti,
  isShortAnswer,
  isFillInBlanks,
  isFillInSelect,
  isMatchPairs,
  isMatchComplex,
  isSortItems,
  isSlider,
  isPinOnImage,
  isCategorize,
  isTimeline,
  isMatrix,
  isMathInput,
  isDiagramLabel,
  isOpenEnded,
  isNumericInput,
  isPinOnModel,
  isChessPuzzle,
  isCoreItem,
  isExtendedItem,
  // Utilities
  generateUUID,
  isValidUUID,
  formatOQSEErrors,
} from '@memizy/oqse';

// ── Rich text processing helpers ──────────────────────────────────────────
export {
  prepareRichTextForDisplay,
  tokenizeOqseTags,
  detokenizeOqseTags,
  validateTier1Markdown,
} from '@memizy/oqse';
export type {
  RichTextProcessingOptions,
  TokenMap,
} from '@memizy/oqse';
