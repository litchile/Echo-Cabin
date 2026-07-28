import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Echo-Cabin/' : '/',
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: 'index.html',
        spatialAudio: 'spatial-audio.html',
        tinyPlanetAudio: 'tiny-planet-audio.html',
        tinyPlanetMultiplayer: 'tiny-planet-multiplayer.html',
      },
    },
  },
}))
