/**
 * `sdk.sys` — system-level plumbing exposed to every plugin.
 *
 * A thin wrapper over the connected `HostApi` that:
 *  - Tracks the session's start time so `sysExit()` can report it
 *    implicitly.
 *  - Normalises the `resize` / `reportError` argument shapes.
 *  - Hides Penpal errors behind a plain Promise surface.
 */

import type {
  HostApi,
  PluginErrorReport,
  ResizeRequest,
} from '../rpc/types';

export class SysManager {
  private readonly host: HostApi;
  private readonly sessionStartedAt: number;

  constructor(host: HostApi, sessionStartedAt: number) {
    this.host = host;
    this.sessionStartedAt = sessionStartedAt;
  }

  /**
   * Ask the host application to resize the iframe. `'auto'` requests
   * intrinsic sizing; the host MAY ignore this.
   */
  requestResize(
    height: ResizeRequest['height'],
    width: ResizeRequest['width'] = null,
  ): Promise<void> {
    return this.host.sysRequestResize({ height, width });
  }

  /**
   * Log a non-fatal error to the host for telemetry. The plugin MUST
   * continue running after calling this.
   */
  reportError(
    code: string,
    message: string,
    context: PluginErrorReport['context'] = null,
  ): Promise<void> {
    return this.host.sysReportError({ code, message, context });
  }

  /**
   * Voluntarily close this plugin instance. Unlike the single-player
   * SDK there is no "score" parameter — final results are communicated
   * via `sdk.host.endGame()` instead.
   */
  exit(): Promise<void> {
    return this.host.sysExit();
  }

  /** Milliseconds since `sysReady()` resolved. */
  get elapsedMs(): number {
    return Date.now() - this.sessionStartedAt;
  }
}
