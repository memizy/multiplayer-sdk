/**
 * Manifest helper utilities for OQSE plugin discovery and landing pages.
 */

export interface OQSEManifest {
  $schema?: string
  version: string
  pluginVersion?: string
  minOqseVersion?: string
  maxOqseVersion?: string
  id: string
  appName: string
  description?: string
  author?: string
  authorUrl?: string
  locales?: string[]
  tags?: string[]
  emoji?: string
  studyMode?: 'game' | 'fun' | 'drill'
  questionDensity?: 'low' | 'medium' | 'high'
  appSpecific?: Record<string, any>
  capabilities: {
    actions: string[]
    types?: string[]
    assets?: Record<string, string[] | null>
    features?: string[]
    latexPackages?: string[]
    itemProperties?: string[]
    metaProperties?: string[]
  }
}

/**
 * Load OQSE manifest from HTML data island.
 * @returns The manifest object, or null if not found.
 */
export function loadManifestFromDataIsland(): OQSEManifest | null {
  const script = document.querySelector('script[type="application/oqse-manifest+json"]')
  if (!script?.textContent) {
    return null
  }

  try {
    return JSON.parse(script.textContent) as OQSEManifest
  } catch (e) {
    console.error('Failed to parse manifesto data island:', e)
    return null
  }
}

/**
 * Check if the plugin is running inside an iframe.
 */
export function isInsideIframe(): boolean {
  return window.self !== window.top
}

/**
 * Render a plugin landing page when not inside an iframe.
 * Should be called early in the plugin's initialization.
 *
 * @param manifest The OQSE manifest object
 * @param options Configuration for landing page behavior
 */
export function renderLandingPageIfNeeded(
  manifest: OQSEManifest | null,
  options?: {
    sandboxUrl?: string
    docsUrl?: string
  },
): boolean {
  // Only render landing page if NOT in iframe
  if (isInsideIframe()) {
    return false
  }

  const app = document.getElementById('app') as HTMLDivElement | null
  if (!app) {
    console.warn('No #app element found for landing page')
    return false
  }

  const sandboxUrl = options?.sandboxUrl ?? 'https://memizy.com/multiplayer/sandbox'
  const docsUrl = options?.docsUrl ?? 'https://learn.memizy.com/multiplayer'

  const name = manifest?.appName ?? 'Plugin'
  const description = manifest?.description ?? 'A Memizy plugin'
  const emoji = manifest?.emoji ?? '🎮'
  const author = manifest?.author ?? 'Unknown author'
  const authorUrl = manifest?.authorUrl

  const authorLink = authorUrl
    ? `<a href="${authorUrl}" target="_blank" rel="noopener noreferrer">${author}</a>`
    : author

  app.innerHTML = `
    <div class="landing-page">
      <header class="landing-header">
        <div class="landing-hero">
          <div class="landing-emoji">${emoji}</div>
          <h1 class="landing-title">${name}</h1>
          <p class="landing-subtitle">A Memizy multiplayer plugin</p>
        </div>
      </header>

      <main class="landing-content">
        <section class="landing-card">
          <h2>About</h2>
          <p>${description}</p>
          ${author ? `<p class="landing-meta"><strong>By:</strong> ${authorLink}</p>` : ''}
        </section>

        <section class="landing-card">
          <h2>Getting Started</h2>
          <p>This plugin is designed to run inside Memizy, our platform for collaborative learning.</p>
          <ul>
            <li>
              <strong>Learn more:</strong>
              <a href="${docsUrl}" target="_blank" rel="noopener noreferrer">Multiplayer SDK Documentation</a>
            </li>
            <li>
              <strong>Try it out:</strong>
              <a href="${sandboxUrl}" target="_blank" rel="noopener noreferrer">Open in Sandbox</a>
            </li>
          </ul>
        </section>

        <section class="landing-card landing-links">
          <a href="${sandboxUrl}" class="landing-btn landing-btn-primary" target="_blank" rel="noopener noreferrer">
            🎮 Try in Sandbox
          </a>
          <a href="${docsUrl}" class="landing-btn landing-btn-secondary" target="_blank" rel="noopener noreferrer">
            📚 Read Docs
          </a>
        </section>
      </main>

      <footer class="landing-footer">
        <p>Powered by <strong>Memizy</strong> · <a href="https://memizy.com" target="_blank" rel="noopener noreferrer">memizy.com</a></p>
      </footer>
    </div>
  `

  return true
}
