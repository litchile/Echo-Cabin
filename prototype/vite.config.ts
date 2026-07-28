import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Echo-Cabin/' : '/',
  build: {
    assetsInlineLimit: 0,
  },
}))
