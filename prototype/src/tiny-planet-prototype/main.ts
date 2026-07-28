import './styles.css'
import { tinyPlanetConfig } from './config'
import { createTinyPlanetStage } from './stage'
import { createPresetSoundBank } from '../spatial-prototype/presetSoundBank'
import { createSphereMixer, type SphereAudioState, type SphereMixer } from './sphereMixer'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('找不到球形声音 Prototype 的挂载节点。')

const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'

root.innerHTML = `
  <main class="planet-shell">
    <div class="planet-canvas" data-planet-canvas></div>
    <aside class="prototype-label" aria-label="Prototype 说明">
      <strong>小型球形声音世界 · 灰盒</strong>
      <span>只验证移动、寻声、停留与往返</span>
    </aside>
    <div class="movement-hint">点击可见球面移动 · 沿地平线寻找朋友声音</div>
    ${debugEnabled ? `
      <aside class="debug-panel" data-debug-panel>
        <h2>开发观察 · 球面弧长</h2>
        <div data-debug-rows></div>
        <div class="zone-badge" data-zone>当前：未开始</div>
      </aside>
    ` : ''}
    <section class="start-layer" data-start-layer>
      <div class="start-card">
        <h1>绕着小星球，寻找朋友的声音</h1>
        <p>这里没有任务或建筑。戴上耳机，点击球面移动，观察自己会不会因为听见谁而靠近、停下或回头。</p>
        <button type="button" data-start>开始声音体验</button>
        <p class="error" data-error hidden></p>
      </div>
    </section>
  </main>
`

const canvasContainer = root.querySelector<HTMLElement>('[data-planet-canvas]')
const startLayer = root.querySelector<HTMLElement>('[data-start-layer]')
const startButton = root.querySelector<HTMLButtonElement>('[data-start]')
const errorMessage = root.querySelector<HTMLElement>('[data-error]')
const debugRows = root.querySelector<HTMLElement>('[data-debug-rows]')
const zoneLabel = root.querySelector<HTMLElement>('[data-zone]')

if (!canvasContainer || !startLayer || !startButton || !errorMessage) {
  throw new Error('球形声音 Prototype 页面结构不完整。')
}

const soundBank = createPresetSoundBank(tinyPlanetConfig.friends)
let mixer: SphereMixer | null = null
let latestAudioStates: SphereAudioState[] = []
let started = false

const renderDebugState = (moving: boolean): void => {
  if (!debugRows || !zoneLabel) return
  debugRows.innerHTML = latestAudioStates.map((state) => {
    const friend = tinyPlanetConfig.friends.find((item) => item.id === state.friendId)
    return `
      <div class="debug-row">
        <span>${friend?.name ?? state.friendId}</span>
        <span>弧长 ${state.distance.toFixed(2)} · gain ${state.gain.toFixed(2)}${state.speaking ? ' · 发声' : ''}</span>
      </div>
    `
  }).join('')
  const audibleCount = latestAudioStates.filter((state) => state.gain >= 0.08).length
  const zoneName = ['安静区', '单声区', '双声区', '三声区'][audibleCount] ?? '三声区'
  zoneLabel.textContent = `当前：${zoneName}${moving ? ' · 移动中' : ' · 停留中'}`
}

const stage = createTinyPlanetStage(
  canvasContainer,
  tinyPlanetConfig,
  (direction, moving) => {
    if (mixer?.getMode() === 'spatial') latestAudioStates = mixer.update(direction)
    renderDebugState(moving)
  },
)
stage.setDebugVisible(debugEnabled)
stage.start()

startButton.addEventListener('click', async () => {
  if (started) return
  startButton.disabled = true
  startButton.textContent = '正在加载声音…'
  errorMessage.hidden = true
  try {
    await soundBank.initialize()
    mixer = createSphereMixer(
      soundBank,
      tinyPlanetConfig.friends,
      tinyPlanetConfig.radius,
      tinyPlanetConfig.audio,
      (friendId, speaking) => stage.setSpeaking(friendId, speaking),
    )
    mixer.start(stage.getPlayerDirection())
    latestAudioStates = mixer.update(stage.getPlayerDirection())
    started = true
    startLayer.remove()
  } catch (error: unknown) {
    startButton.disabled = false
    startButton.textContent = '重新加载声音'
    errorMessage.textContent = error instanceof Error ? error.message : '声音加载失败，请刷新后重试。'
    errorMessage.hidden = false
  }
})

window.addEventListener('beforeunload', () => {
  mixer?.destroy()
  stage.destroy()
  void soundBank.destroy()
}, { once: true })
