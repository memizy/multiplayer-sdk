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

const LANDING_STYLE_ID = 'memizy-oqse-landing-styles'

function injectLandingStyles() {
  if (document.getElementById(LANDING_STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = LANDING_STYLE_ID
  style.textContent = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap");

:root {
  --color-primary-blue: #1E88E5;
  --color-primary-blue-dark: #1565C0;
  --color-accent-orange: #FF6F00;
  --color-accent-orange-light: #FF8F00;
  --color-accent-orange-dark: #E65100;
  --color-off-white: #F8F9FA;
  --color-text-dark: #212529;
  --color-text-gray: #6C757D;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --shadow-soft: 0 4px 24px rgba(0, 0, 0, 0.08);
  --shadow-soft-hover: 0 8px 32px rgba(0, 0, 0, 0.12);
}

body {
  margin: 0;
  background-color: white;
  color: var(--color-text-dark);
  font-family: var(--font-sans);
}

button:hover {
  cursor: pointer;
}

.memizy-landing-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, var(--color-off-white) 100%);
  color: var(--color-text-dark);
}

.memizy-landing-shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 40px 0 56px;
}

.memizy-landing-hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 20px;
  align-items: center;
  padding: 28px;
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(30, 136, 229, 0.08), rgba(255, 111, 0, 0.08));
  box-shadow: var(--shadow-soft);
  border: 1px solid rgba(33, 37, 41, 0.08);
}

.memizy-landing-emoji {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: #fff;
  box-shadow: var(--shadow-soft);
  font-size: 34px;
}

.memizy-landing-kicker {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-primary-blue-dark);
}

.memizy-landing-title {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.05;
  font-weight: 900;
  color: var(--color-text-dark);
}

.memizy-landing-subtitle {
  margin: 10px 0 0;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--color-text-gray);
  max-width: 68ch;
}

.memizy-landing-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 20px;
  margin-top: 24px;
}

.memizy-landing-card {
  background: #fff;
  border-radius: 22px;
  border: 1px solid rgba(33, 37, 41, 0.08);
  box-shadow: var(--shadow-soft);
  padding: 24px;
}

.memizy-landing-card h2 {
  margin: 0 0 12px;
  font-size: 1.15rem;
  line-height: 1.2;
  font-weight: 800;
  color: var(--color-text-dark);
}

.memizy-landing-card p {
  margin: 0;
  color: var(--color-text-gray);
  line-height: 1.7;
}

.memizy-landing-meta {
  margin-top: 14px !important;
  font-size: 0.95rem;
}

.memizy-landing-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.memizy-landing-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(30, 136, 229, 0.08);
  color: var(--color-primary-blue-dark);
  font-size: 0.9rem;
  font-weight: 700;
}

.memizy-landing-actions {
  grid-column: span 12;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.memizy-landing-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 52px;
  padding: 14px 18px;
  border-radius: 16px;
  font-weight: 800;
  font-size: 0.98rem;
  text-decoration: none;
  border: 0;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  box-shadow: var(--shadow-soft);
}

.memizy-landing-button:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-soft-hover);
}

.memizy-landing-button-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--color-accent-orange) 0%, var(--color-accent-orange-light) 100%);
}

.memizy-landing-button-secondary {
  color: var(--color-primary-blue-dark);
  background: #fff;
  border: 1px solid rgba(30, 136, 229, 0.18);
}

.memizy-landing-list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.memizy-landing-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  color: var(--color-text-gray);
  line-height: 1.6;
}

.memizy-landing-list strong {
  color: var(--color-text-dark);
}

.memizy-landing-list a,
.memizy-landing-footer a {
  color: var(--color-primary-blue-dark);
  text-decoration: none;
  font-weight: 700;
}

.memizy-landing-list a:hover,
.memizy-landing-footer a:hover {
  text-decoration: underline;
}

.memizy-landing-footer {
  margin-top: 24px;
  padding: 18px 8px 0;
  text-align: center;
  color: var(--color-text-gray);
  font-size: 0.92rem;
}

@media (max-width: 720px) {
  .memizy-landing-shell {
    width: min(1120px, calc(100% - 20px));
    padding-top: 20px;
    padding-bottom: 28px;
  }

  .memizy-landing-hero {
    grid-template-columns: 1fr;
    text-align: center;
    padding: 22px;
  }

  .memizy-landing-emoji {
    margin: 0 auto;
  }

  .memizy-landing-actions {
    grid-template-columns: 1fr;
  }
}
  `

  document.head.appendChild(style)
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

  injectLandingStyles()

  const sandboxUrl = options?.sandboxUrl ?? 'https://memizy.com/multiplayer/sandbox'
  const docsUrl = options?.docsUrl ?? 'https://learn.memizy.com/multiplayer'
  const settingsSchema = manifest?.appSpecific?.memizy?.settingsSchema
  const settingsSummary = Array.isArray(settingsSchema) && settingsSchema.length > 0
    ? settingsSchema.map((setting) => setting.label ?? setting.id).slice(0, 4)
    : []

  const name = manifest?.appName ?? 'Plugin'
  const description = manifest?.description ?? 'A Memizy plugin'
  const emoji = manifest?.emoji ?? '🎮'
  const author = manifest?.author ?? 'Unknown author'
  const authorUrl = manifest?.authorUrl

  const authorLink = authorUrl
    ? `<a href="${authorUrl}" target="_blank" rel="noopener noreferrer">${author}</a>`
    : author

  app.innerHTML = `
    <div class="memizy-landing-root">
      <div class="memizy-landing-shell">
        <header class="memizy-landing-hero">
          <div class="memizy-landing-emoji">${emoji}</div>
          <div>
            <p class="memizy-landing-kicker">Memizy plugin</p>
            <h1 class="memizy-landing-title">${name}</h1>
            <p class="memizy-landing-subtitle">${description}</p>
          </div>
        </header>

        <main class="memizy-landing-grid">
          <section class="memizy-landing-card" style="grid-column: span 7;">
            <h2>About</h2>
            <p>This plugin is designed to run inside Memizy and use the multiplayer SDK directly for host and player flows.</p>
            ${author ? `<p class="memizy-landing-meta"><strong>By:</strong> ${authorLink}</p>` : ''}
            <div class="memizy-landing-badges">
              ${manifest?.studyMode ? `<span class="memizy-landing-badge">Study mode: ${manifest.studyMode}</span>` : ''}
              ${manifest?.questionDensity ? `<span class="memizy-landing-badge">Density: ${manifest.questionDensity}</span>` : ''}
              ${manifest?.capabilities?.actions?.length ? `<span class="memizy-landing-badge">Actions: ${manifest.capabilities.actions.join(', ')}</span>` : ''}
            </div>
          </section>

          <section class="memizy-landing-card" style="grid-column: span 5;">
            <h2>What it supports</h2>
            <ul class="memizy-landing-list">
              <li><strong>Manifest data:</strong> loaded from the HTML data island.</li>
              <li><strong>Standalone mode:</strong> a landing page is shown outside the iframe.</li>
              <li><strong>Host/player runtime:</strong> handled by the SDK callbacks.</li>
              ${settingsSummary.length ? `<li><strong>Settings:</strong> ${settingsSummary.join(', ')}</li>` : ''}
            </ul>
          </section>

          <section class="memizy-landing-card" style="grid-column: span 12;">
            <h2>Getting Started</h2>
            <p>Use the sandbox to preview the plugin exactly the way Memizy will launch it, or open the docs for implementation details.</p>
            <ul class="memizy-landing-list">
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

          <section class="memizy-landing-actions">
            <a href="${sandboxUrl}" class="memizy-landing-button memizy-landing-button-primary" target="_blank" rel="noopener noreferrer">
              🎮 Try in Sandbox
            </a>
            <a href="${docsUrl}" class="memizy-landing-button memizy-landing-button-secondary" target="_blank" rel="noopener noreferrer">
              📚 Read Docs
            </a>
          </section>
        </main>

        <footer class="memizy-landing-footer">
          <p>Powered by <strong>Memizy</strong> · <a href="https://memizy.com" target="_blank" rel="noopener noreferrer">memizy.com</a></p>
        </footer>
      </div>
    </div>
  `

  return true
}
