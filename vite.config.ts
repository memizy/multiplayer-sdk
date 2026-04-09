import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return {}
  }

  return {
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