import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(here, '..');

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
