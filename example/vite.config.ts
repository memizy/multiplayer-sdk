import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(here, '..');
const packageJson = JSON.parse(
  readFileSync(resolve(sdkRoot, 'package.json'), 'utf-8'),
) as { version: string };

/**
 * Vite config for the multiplayer-sdk example plugin.
 *
 * Serves / builds the interactive demo that lives in `example/`. The
 * `@memizy/multiplayer-sdk` alias points at the SDK source so changes
 * show up live without rebuilding the library.
 *
 * GitHub Pages deploys the `dist/` output of this config under a
 * subpath matching the repo name (`/multiplayer-sdk/`), so we honour
 * the `--base` CLI flag.
 */
export default defineConfig({
  root: here,
  base: './',
  define: {
    __SDK_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@memizy/multiplayer-sdk': resolve(sdkRoot, 'src/index.ts'),
    },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        minimal: resolve(here, 'minimal.html'),
      },
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});
