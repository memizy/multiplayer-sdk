/**
 * OQSE manifest helpers for plugin discovery and standalone landing
 * pages.
 *
 * These utilities mirror the single-player SDK so plugin authors can
 * share their existing manifest code unchanged. The multiplayer-specific
 * configuration lives under `appSpecific.memizy.multiplayerSdk`.
 */

/** Shape of an OQSE manifest as far as the SDK is concerned. */
export interface OQSEManifest {
  $schema?: string;
  version: string;
  pluginVersion?: string;
  minOqseVersion?: string;
  maxOqseVersion?: string;
  id: string;
  appName: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  locales?: string[];
  tags?: string[];
  emoji?: string;
  studyMode?: 'game' | 'fun' | 'drill';
  questionDensity?: 'low' | 'medium' | 'high';
  appSpecific?: AppSpecificConfigs;
  capabilities: {
    actions: string[];
    types?: string[];
    assets?: Record<string, string[] | null>;
    features?: string[];
    latexPackages?: string[];
    itemProperties?: string[];
    metaProperties?: string[];
  };
}

export interface AppSpecificConfigs {
  memizy?: {
    multiplayerSdk?: Partial<MultiplayerManifestConfig>;
  };
  [key: string]: unknown;
}

/** Multiplayer-specific block under `appSpecific.memizy.multiplayerSdk`. */
export interface MultiplayerManifestConfig {
  apiVersion: string;
  minimumHostApiVersion: string;
  players?: { min: number; max: number; recommended?: number };
  supportsLateJoin?: boolean;
  supportsReconnect?: boolean;
  supportsTeams?: boolean;
  customSyncScreen?: boolean;
  hasSettingsScreen?: boolean;
  requiresHostScreen?: boolean;
  clientOrientation?: 'portrait' | 'landscape';
}

/**
 * Extract the multiplayer-specific block from a manifest. Returns an
 * empty object when no block is declared.
 */
export function readMultiplayerConfig(
  manifest: OQSEManifest | null | undefined,
): MultiplayerManifestConfig {
  const multiplayerSdk = manifest?.appSpecific?.memizy?.multiplayerSdk;
  return {
    apiVersion: multiplayerSdk?.apiVersion ?? '0.4',
    minimumHostApiVersion: multiplayerSdk?.minimumHostApiVersion ?? '0.4',
    ...multiplayerSdk,
  };
}

/**
 * Load the OQSE manifest from an HTML data island of the form:
 *
 *   <script type="application/oqse-manifest+json">{...}</script>
 */
export function loadManifestFromDataIsland(): OQSEManifest | null {
  const script = document.querySelector(
    'script[type="application/oqse-manifest+json"]',
  );
  if (!script?.textContent) return null;

  try {
    return JSON.parse(script.textContent) as OQSEManifest;
  } catch (e) {
    console.error('[memizy-multiplayer-sdk] failed to parse manifest:', e);
    return null;
  }
}

/** `true` when this window is nested inside a parent frame. */
export function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access throws -> we ARE embedded.
    return true;
  }
}
