import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return {
      define: {
        __SDK_VERSION__: JSON.stringify(packageJson.version),
      },
    }
  }

  return {
    define: {
      __SDK_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
      dts({
        insertTypesEntry: true,
        rollupTypes: false,
      })
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'MemizyMultiplayer',
        fileName: 'multiplayer-sdk',
      },
    },
  }
})