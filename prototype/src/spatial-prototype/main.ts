import './styles.css'
import { createMovementController } from '../scene/movementController'
import { createFacingController, getFacingPresentation } from '../scene/playerVisual'
import { createWalkableArea } from '../scene/walkableArea'
import { spatialPrototypeConfig as config, type FriendDefinition } from './config'
import { createObservationPanel } from './observationPanel'
import { createObservationTracker } from './observationTracker'
import { createPresetSoundBank } from './presetSoundBank'
import { createSpatialMixer, type SpatialMixer } from './spatialMixer'
import { createPrototypeStage } from './stage'

type PageMode = 'landing' | 'spatial' | 'playlist'

const getPageMode = (): PageMode => {
  const mode = new URLSearchParams(window.location.search).get('mode')
  return mode === 'spatial' || mode === 'playlist' ? mode : 'landing'
}

const app = document.querySelector<HTMLElement>('#spatial-prototype-app')
if (!app) throw new Error('Prototype root was not found.')

const mode = getPageMode()
const debugMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1'
const modeUrl = (nextMode: Exclude<PageMode, 'landing'>): string => {
  const url = new URL(window.location.href)
  url.search = `?mode=${nextMode}${debugMode ? '&debug=1' : ''}`
  return url.toString()
}

const createHeader = (eyebrow: string, title: string, description: string): HTMLElement => {
  const header = document.createElement('header')
  header.className = 'experiment-header'
  header.innerHTML = `
    <div>
      <p class="experiment-header__eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="experiment-header__description">${description}</p>
    </div>
    <a class="experiment-header__home" href="${new URL('spatial-audio.html', window.location.href).toString()}">选择体验版本</a>
  `
  return header
}

const renderLanding = (): void => {
  app.className = 'experiment-app experiment-app--landing'
  app.innerHTML = `
    <section class="experiment-intro">
      <p class="experiment-intro__eyebrow">Echo Cabin · 核心机制隔离 Prototype</p>
      <h1>同样的三段声音，<br />空间与移动会改变什么？</h1>
      <p class="experiment-intro__lead">请选择本轮要体验的版本。两版使用完全相同的声音素材与单声响度。</p>
      <div class="experiment-choice-grid">
        <a class="experiment-choice experiment-choice--spatial" href="${modeUrl('spatial')}">
          <span class="experiment-choice__index">A</span>
          <strong>空间移动版</strong>
          <span>点击地面移动，在朋友之间靠近、离开与停留。</span>
          <em>进入空间</em>
        </a>
        <a class="experiment-choice experiment-choice--playlist" href="${modeUrl('playlist')}">
          <span class="experiment-choice__index">B</span>
          <strong>播放列表对照版</strong>
          <span>不显示空间，只通过三个按钮分别播放同样的声音。</span>
          <em>进入播放列表</em>
        </a>
      </div>
      <p class="experiment-intro__note">测试主持人应交替安排 A/B 顺序。当前内置声音为本地占位素材，不用于最终体验结论。</p>
    </section>
  `
}

const createAudioGate = (
  label: string,
  description: string,
  onStart: (setStatus: (message: string, error?: boolean) => void) => Promise<void>,
): HTMLElement => {
  const gate = document.createElement('section')
  gate.className = 'audio-gate'
  gate.innerHTML = `
    <span class="audio-gate__icon" aria-hidden="true">◖))</span>
    <h2>${label}</h2>
    <p>${description}</p>
    <button type="button">开始体验</button>
    <output aria-live="polite"></output>
  `
  const button = gate.querySelector<HTMLButtonElement>('button')!
  const output = gate.querySelector<HTMLOutputElement>('output')!
  const setStatus = (message: string, error = false): void => {
    output.textContent = message
    output.dataset.error = String(error)
  }
  button.addEventListener('click', async () => {
    button.disabled = true
    setStatus('正在读取三段本地声音…')
    try {
      await onStart(setStatus)
      gate.remove()
    } catch (error) {
      button.disabled = false
      setStatus(error instanceof Error ? error.message : '声音启动失败，请重试。', true)
    }
  })
  return gate
}

const renderSpatial = (): (() => void) => {
  app.className = 'experiment-app experiment-app--spatial'
  const header = createHeader(
    'A · 空间移动版',
    '听见朋友的位置',
    '点击地面移动。没有任务，也没有正确路线。',
  )
  const stage = createPrototypeStage(config, debugMode)
  const shell = document.createElement('div')
  shell.className = 'spatial-shell'
  shell.append(stage.element)
  app.replaceChildren(header, shell)

  const walkable = createWalkableArea(config.walkablePolygon)
  const movement = createMovementController(
    config.player.initialPosition,
    config.player.speed,
    walkable.isPointWalkable,
    config.player.acceleration,
    config.player.deceleration,
  )
  const facing = createFacingController('front', 120)
  const soundBank = createPresetSoundBank(config.friends)
  const observationTracker = debugMode
    ? createObservationTracker(config.friends, config.audio)
    : null
  const observationPanel = debugMode ? createObservationPanel() : null
  if (observationPanel) app.append(observationPanel.element)
  let mixer: SpatialMixer | null = null
  let animationFrame = 0
  let previousTime = 0
  let previousObservationRenderTime = 0

  const gate = createAudioGate(
    '戴上耳机，从安静处出发',
    '声音需要一次点击才能开始。之后只需点击地面移动。',
    async () => {
      await soundBank.initialize()
      mixer = createSpatialMixer(soundBank, config.friends, config.audio, (friendId, speaking) => {
        stage.setFriendSpeaking(friendId, speaking)
      })
      mixer.startSpatial(movement.getSnapshot().position)
      if (observationTracker && observationPanel) {
        observationPanel.render(
          observationTracker.start(movement.getSnapshot().position, performance.now()),
        )
      }
    },
  )
  shell.append(gate)

  stage.onGroundTap((position) => {
    if (!walkable.isPointWalkable(position)) return
    if (movement.setTarget(position)) {
      observationTracker?.recordMoveTarget(movement.getSnapshot().position, position)
      stage.setTarget(position)
    }
  })

  const handleDebugKey = (event: KeyboardEvent): void => {
    if (!debugMode) return
    const offsets: Record<string, { x: number; y: number }> = {
      w: { x: 0, y: -120 }, a: { x: -120, y: 0 }, s: { x: 0, y: 120 }, d: { x: 120, y: 0 },
    }
    const offset = offsets[event.key.toLowerCase()]
    if (!offset) return
    const current = movement.getSnapshot().position
    const target = { x: current.x + offset.x, y: current.y + offset.y }
    if (walkable.isPointWalkable(target) && movement.setTarget(target)) stage.setTarget(target)
  }
  window.addEventListener('keydown', handleDebugKey)

  const animate = (time: number): void => {
    const delta = previousTime === 0 ? 0 : Math.min((time - previousTime) / 1000, 0.05)
    previousTime = time
    const snapshot = movement.update(delta)
    stage.setPlayerPosition(snapshot.position)
    mixer?.updateListener(snapshot.position)
    if (
      observationTracker &&
      observationPanel &&
      mixer?.getMode() === 'spatial' &&
      time - previousObservationRenderTime >= 200
    ) {
      observationPanel.render(observationTracker.update(snapshot.position, time))
      previousObservationRenderTime = time
    }
    if (snapshot.isMoving && snapshot.target) {
      const nextFacing = facing.update({
        x: snapshot.target.x - snapshot.position.x,
        y: snapshot.target.y - snapshot.position.y,
      }, time)
      const presentation = getFacingPresentation(nextFacing, config.player.facingSprites)
      stage.setPlayerFacing(presentation.imageUrl, presentation.mirrored)
    }
    if (!snapshot.isMoving) stage.setTarget(null)
    animationFrame = requestAnimationFrame(animate)
  }
  animationFrame = requestAnimationFrame(animate)

  return () => {
    cancelAnimationFrame(animationFrame)
    window.removeEventListener('keydown', handleDebugKey)
    movement.cancel()
    mixer?.destroy()
    stage.destroy()
    void soundBank.destroy()
  }
}

const renderPlaylist = (): (() => void) => {
  app.className = 'experiment-app experiment-app--playlist'
  const header = createHeader(
    'B · 播放列表对照版',
    '同样的声音，没有空间',
    '这里只能分别播放三个角色声音；没有移动或距离变化。',
  )
  const content = document.createElement('section')
  content.className = 'playlist-panel'
  content.innerHTML = `
    <div class="playlist-panel__label">播放列表对照版</div>
    <h2>朋友声音</h2>
    <p>点击任意一位朋友进行播放。再次点击其他朋友会切换声音。</p>
    <div class="playlist-list"></div>
    <output class="playlist-panel__status" aria-live="polite">声音尚未开始</output>
  `
  const list = content.querySelector<HTMLDivElement>('.playlist-list')!
  const status = content.querySelector<HTMLOutputElement>('.playlist-panel__status')!
  const buttons = new Map<FriendDefinition['id'], HTMLButtonElement>()
  config.friends.forEach((friend, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'playlist-item'
    button.style.setProperty('--friend-color', friend.color)
    button.style.setProperty('--friend-color-soft', friend.colorSoft)
    button.innerHTML = `
      <span class="playlist-item__number">${String(index + 1).padStart(2, '0')}</span>
      <span class="playlist-item__avatar">${friend.monogram}</span>
      <span class="playlist-item__copy"><strong>${friend.name}</strong><small>约 2—4 秒</small></span>
      <span class="playlist-item__play" aria-hidden="true">▶</span>
    `
    buttons.set(friend.id, button)
    list.append(button)
  })
  app.replaceChildren(header, content)

  const soundBank = createPresetSoundBank(config.friends)
  let mixer: SpatialMixer | null = null
  const setSpeaking = (friendId: FriendDefinition['id'], speaking: boolean): void => {
    buttons.get(friendId)?.setAttribute('data-playing', String(speaking))
  }
  const gate = createAudioGate(
    '播放列表对照版',
    '先启用声音，再分别点击三个角色按钮。',
    async () => {
      await soundBank.initialize()
      mixer = createSpatialMixer(soundBank, config.friends, config.audio, setSpeaking)
      buttons.forEach((button, friendId) => {
        button.addEventListener('click', () => {
          mixer?.playPlaylist(friendId)
          const friend = config.friends.find((candidate) => candidate.id === friendId)!
          status.textContent = `正在播放：${friend.name}`
        })
      })
      status.textContent = '请选择一位朋友'
    },
  )
  content.append(gate)

  return () => {
    mixer?.destroy()
    void soundBank.destroy()
  }
}

let cleanup: (() => void) | null = null
if (mode === 'landing') renderLanding()
if (mode === 'spatial') cleanup = renderSpatial()
if (mode === 'playlist') cleanup = renderPlaylist()

window.addEventListener('pagehide', () => cleanup?.(), { once: true })
