/**
 * Landing page injected when a plugin is opened directly (i.e. not
 * embedded in a Memizy host iframe).
 *
 * The landing page serves three purposes:
 *
 *  1. Gives the plugin author a polished "about" page they can link to
 *     from their marketing site.
 *  2. Surfaces the multiplayer-specific manifest config so integrators
 *     can quickly see capabilities (lateJoin, teams, orientation, ...).
 *  3. Offers one-click buttons that launch the built-in standalone
 *     mode (`as host` / `as player`) so the plugin can be exercised
 *     locally without a real Memizy host.
 */

import { isInsideIframe, readMultiplayerConfig } from '../manifest';
import type { OQSEManifest } from '@memizy/oqse';

const LANDING_STYLE_ID = 'memizy-mp-landing-styles';

export interface LandingPageOptions {
  /** Link target shown behind the "Open in Memizy Learn" button. */
  docsUrl?: string;
  /** Container element. Defaults to `#app` in the document. */
  mount?: HTMLElement;
  /** Called when the user presses "Try as host". */
  onTryHost?: () => void;
  /** Called when the user presses "Try as player". */
  onTryPlayer?: () => void;
}

/**
 * Render the landing page when the current window is NOT inside an
 * iframe. Returns `true` if the page was rendered.
 */
export function renderLandingPageIfNeeded(
  manifest: OQSEManifest | null,
  options: LandingPageOptions = {},
): boolean {
  if (isInsideIframe()) return false;

  const mount = options.mount ?? document.getElementById('app');
  if (!(mount instanceof HTMLElement)) {
    console.warn(
      '[memizy-multiplayer-sdk] no mount element found for landing page',
    );
    return false;
  }

  injectLandingStyles();
  mount.innerHTML = buildHtml(manifest, options.docsUrl ?? '#');
  wireButtons(mount, options);
  return true;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function injectLandingStyles(): void {
  if (document.getElementById(LANDING_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LANDING_STYLE_ID;
  style.textContent = LANDING_CSS;
  document.head.appendChild(style);
}

const LANDING_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap");

:root {
  --mp-color-primary: #1E88E5;
  --mp-color-primary-dark: #1565C0;
  --mp-color-accent: #FF6F00;
  --mp-color-accent-light: #FF8F00;
  --mp-color-bg: #F8F9FA;
  --mp-color-text: #212529;
  --mp-color-muted: #6C757D;
  --mp-font: "Inter", system-ui, sans-serif;
  --mp-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  --mp-shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.12);
  --mp-radius: 22px;
}

body {
  margin: 0;
  background: #fff;
  color: var(--mp-color-text);
  font-family: var(--mp-font);
}

.mp-landing {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, var(--mp-color-bg) 100%);
}

.mp-landing-shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 40px 0 56px;
}

.mp-hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 20px;
  align-items: center;
  padding: 28px;
  border-radius: var(--mp-radius);
  background: linear-gradient(135deg, rgba(30,136,229,0.08), rgba(255,111,0,0.08));
  box-shadow: var(--mp-shadow);
  border: 1px solid rgba(33,37,41,0.08);
}

.mp-hero-emoji {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: #fff;
  box-shadow: var(--mp-shadow);
  font-size: 34px;
}

.mp-kicker {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mp-color-primary-dark);
}

.mp-title {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.05;
  font-weight: 900;
}

.mp-subtitle {
  margin: 10px 0 0;
  color: var(--mp-color-muted);
  line-height: 1.6;
  max-width: 68ch;
}

.mp-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 20px;
  margin-top: 24px;
}

.mp-card {
  background: #fff;
  border-radius: var(--mp-radius);
  border: 1px solid rgba(33,37,41,0.08);
  box-shadow: var(--mp-shadow);
  padding: 24px;
}

.mp-card h2 {
  margin: 0 0 12px;
  font-size: 1.15rem;
  font-weight: 800;
}

.mp-card p {
  margin: 0;
  color: var(--mp-color-muted);
  line-height: 1.7;
}

.mp-list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.mp-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  color: var(--mp-color-muted);
  line-height: 1.6;
}

.mp-list strong {
  color: var(--mp-color-text);
}

.mp-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.mp-badge {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(30,136,229,0.08);
  color: var(--mp-color-primary-dark);
  font-size: 0.9rem;
  font-weight: 700;
}

.mp-badge-accent {
  background: rgba(255,111,0,0.12);
  color: var(--mp-color-accent);
}

.mp-actions {
  grid-column: span 12;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.mp-btn {
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
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  box-shadow: var(--mp-shadow);
}

.mp-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--mp-shadow-hover);
}

.mp-btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--mp-color-accent) 0%, var(--mp-color-accent-light) 100%);
}

.mp-btn-secondary {
  color: var(--mp-color-primary-dark);
  background: #fff;
  border: 1px solid rgba(30,136,229,0.18);
}

.mp-footer {
  margin-top: 24px;
  padding: 18px 8px 0;
  text-align: center;
  color: var(--mp-color-muted);
  font-size: 0.92rem;
}

.mp-footer a {
  color: var(--mp-color-primary-dark);
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 720px) {
  .mp-landing-shell { width: min(1120px, calc(100% - 20px)); padding: 20px 0 28px; }
  .mp-hero { grid-template-columns: 1fr; text-align: center; padding: 22px; }
  .mp-hero-emoji { margin: 0 auto; }
  .mp-actions { grid-template-columns: 1fr; }
}
`;

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function buildHtml(
  manifest: OQSEManifest | null,
  docsUrl: string,
): string {
  const name = manifest?.appName ?? 'Memizy Multiplayer Plugin';
  const description =
    manifest?.description ?? 'A multiplayer plugin for Memizy.';
  const emoji = manifest?.emoji ?? '🎮';
  const rawAuthor = manifest?.author;
  const author =
    typeof rawAuthor === 'string'
      ? rawAuthor
      : rawAuthor && typeof rawAuthor === 'object' && 'name' in rawAuthor
        ? String(
            (
              rawAuthor as {
                name?: unknown;
              }
            ).name ?? 'Unknown author',
          )
        : 'Unknown author';
  const authorUrl =
    rawAuthor && typeof rawAuthor === 'object' && 'url' in rawAuthor
      ? (
          rawAuthor as {
            url?: unknown;
          }
        ).url
      : undefined;
  const authorUrlString = typeof authorUrl === 'string' ? authorUrl : undefined;
  const authorLink = authorUrlString
    ? `<a href="${esc(authorUrlString)}" target="_blank" rel="noopener noreferrer">${esc(author)}</a>`
    : esc(author);

  const multi = readMultiplayerConfig(manifest);
  const players = multi.players;

  const capabilityChips: string[] = [];
  if (multi.supportsLateJoin)
    capabilityChips.push('<span class="mp-badge">Late join</span>');
  if (multi.supportsReconnect)
    capabilityChips.push('<span class="mp-badge">Reconnect</span>');
  if (multi.supportsTeams)
    capabilityChips.push('<span class="mp-badge">Teams</span>');
  if (multi.requiresHostScreen)
    capabilityChips.push(
      '<span class="mp-badge mp-badge-accent">Requires host screen</span>',
    );
  if (multi.clientOrientation)
    capabilityChips.push(
      `<span class="mp-badge">Orientation: ${esc(multi.clientOrientation)}</span>`,
    );

  return `
    <div class="mp-landing">
      <div class="mp-landing-shell">
        <header class="mp-hero">
          <div class="mp-hero-emoji">${esc(emoji)}</div>
          <div>
            <p class="mp-kicker">Memizy Multiplayer Plugin</p>
            <h1 class="mp-title">${esc(name)}</h1>
            <p class="mp-subtitle">${esc(description)}</p>
          </div>
        </header>

        <main class="mp-grid">
          <section class="mp-card" style="grid-column: span 7;">
            <h2>About</h2>
            <p>This plugin runs inside a Memizy host, which coordinates the lobby, players and orchestration. The SDK handles the handshake and the protocol; the plugin only has to render and author game state.</p>
            <p class="mp-meta" style="margin-top:14px;"><strong>By:</strong> ${authorLink}</p>
            <div class="mp-badges">
              ${manifest?.studyMode ? `<span class="mp-badge">Study mode: ${esc(manifest.studyMode)}</span>` : ''}
              ${manifest?.questionDensity ? `<span class="mp-badge">Density: ${esc(manifest.questionDensity)}</span>` : ''}
              ${players ? `<span class="mp-badge">Players: ${players.min}-${players.max}${players.recommended ? ` (ideal ${players.recommended})` : ''}</span>` : ''}
              ${capabilityChips.join('')}
            </div>
          </section>

          <section class="mp-card" style="grid-column: span 5;">
            <h2>Try it locally</h2>
            <p>Run this plugin outside a real Memizy host to exercise its UI with mock data.</p>
            <ul class="mp-list">
              <li><strong>Host mode:</strong> author settings, observe player signals, broadcast state.</li>
              <li><strong>Player mode:</strong> render a simulated session where every broadcast is applied locally.</li>
            </ul>
          </section>

          <section class="mp-actions">
            <a href="${esc(docsUrl)}" class="mp-btn mp-btn-primary" target="_blank" rel="noopener noreferrer">🚀 Open in Memizy</a>
            <button type="button" class="mp-btn mp-btn-secondary" data-mp-try-host>🧪 Try as host</button>
            <button type="button" class="mp-btn mp-btn-secondary" data-mp-try-player>👤 Try as player</button>
          </section>
        </main>

        <footer class="mp-footer">
          <p>Powered by <strong>Memizy</strong> &middot; <a href="https://memizy.com" target="_blank" rel="noopener noreferrer">memizy.com</a></p>
        </footer>
      </div>
    </div>
  `;
}

function wireButtons(mount: HTMLElement, options: LandingPageOptions): void {
  mount
    .querySelector<HTMLButtonElement>('[data-mp-try-host]')
    ?.addEventListener('click', () => {
      options.onTryHost?.();
    });
  mount
    .querySelector<HTMLButtonElement>('[data-mp-try-player]')
    ?.addEventListener('click', () => {
      options.onTryPlayer?.();
    });
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
