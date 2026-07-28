import './styles.css'
import '@phosphor-icons/web/regular'
import { createSoundCaptureService } from './audio/soundCapture'
import { createSpatialAudioEngine } from './audio/spatialAudio'
import { createCharacterStore } from './characters/characterStore'
import type { ActiveCharacter } from './characters/characterTypes'
import { prototypeConfig } from './config/prototypeConfig'
import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './core/coordinates'
import {
  createMovementController,
  type MovementController,
  type MovementStopReason,
} from './scene/movementController'
import {
  buildWallNavigationBandPolygon,
  getWallNavigationBandHeight,
  resolveNavigationTarget,
} from './scene/navigationTarget'
import {
  createFacingController,
  getFacingPresentation,
  type FacingController,
  type PlayerFacing,
} from './scene/playerVisual'
import { createStage } from './scene/stage'
import { createWalkableArea } from './scene/walkableArea'
import { createCharacterControls } from './ui/characterControls'
import { createOrientationHint } from './ui/orientationHint'

const app = document.querySelector<HTMLElement>('#app')

if (!app) {
  throw new Error('Application root #app was not found.')
}

const stage = createStage(
  prototypeConfig.scene.imageUrl,
  prototypeConfig.scene.walkablePolygon,
  prototypeConfig.scene.itemPlacementPolygon,
  {
    enabled:
      import.meta.env.DEV && prototypeConfig.scene.wallNavigation.debugVisible,
    wallNavigationBandPolygon: buildWallNavigationBandPolygon(
      prototypeConfig.scene.walkableRearBoundary,
      getWallNavigationBandHeight(prototypeConfig.scene.wallNavigation),
    ),
    rearBoundary: prototypeConfig.scene.walkableRearBoundary,
  },
)
const orientationHint = createOrientationHint()
const walkableArea = createWalkableArea(prototypeConfig.scene.walkablePolygon)
const characterStore = createCharacterStore({
  capacity: prototypeConfig.characters.capacity,
  spawnPoints: prototypeConfig.characters.spawnPoints,
  avatarIds: prototypeConfig.characters.avatars.map((avatar) => avatar.id),
  isSpawnPointLegal: walkableArea.isPointWalkable,
})
const soundCapture = createSoundCaptureService()
const spatialAudio = createSpatialAudioEngine(soundCapture, prototypeConfig.audio)
let resumeSpatialAudioAfterPanel = false
let characterPanelOpen = false

const motionFeedback = prototypeConfig.player.motionFeedback
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const motionFeedbackEnabled = motionFeedback.enabled && !reducedMotion

interface CharacterActorView {
  element: HTMLDivElement
  visual: HTMLImageElement
  facingController: FacingController
  renderedFacing: PlayerFacing
}

const characterActors = new Map<string, CharacterActorView>()
let audioControl: HTMLButtonElement | null = null

Object.values(prototypeConfig.player.facingSprites).forEach((imageUrl) => {
  const image = new Image()
  image.src = imageUrl
})

const positionWorldElement = (element: HTMLElement, point: Point): void => {
  element.style.left = `${(point.x / WORLD_WIDTH) * 100}%`
  element.style.top = `${(point.y / WORLD_HEIGHT) * 100}%`
  element.style.zIndex = String(Math.round(point.y))
}

const createCharacterActor = (character: ActiveCharacter): CharacterActorView => {
  const element = document.createElement('div')
  element.className = 'temporary-player character-actor'
  element.dataset.interactive = 'true'
  element.dataset.avatar = character.avatarId
  element.dataset.name = character.name
  element.style.width = `${(prototypeConfig.player.visualWidth / WORLD_WIDTH) * 100}%`
  element.style.height = `${(prototypeConfig.player.visualHeight / WORLD_HEIGHT) * 100}%`
  element.dataset.motionEnabled = String(motionFeedbackEnabled)
  element.style.setProperty('--player-bob-amplitude', String(motionFeedback.bobAmplitudePercent))
  element.style.setProperty('--player-bob-cycle', `${motionFeedback.bobCycleMs}ms`)
  element.style.setProperty('--player-shadow-moving-scale', String(motionFeedback.shadowMovingScale))

  const shadow = document.createElement('div')
  shadow.className = 'temporary-player__shadow'
  shadow.setAttribute('aria-hidden', 'true')

  const visual = document.createElement('img')
  visual.className = 'temporary-player__visual'
  visual.src = prototypeConfig.player.facingSprites.front
  visual.alt = character.name
  visual.draggable = false
  element.append(shadow, visual)

  element.addEventListener('click', () => {
    const snapshot = characterStore.getSnapshot()
    const isCurrent = snapshot.currentCharacterId === character.id
    stage.setStatus(
      isCurrent
        ? `当前角色：${character.name}。点击角色不会同时设置移动目标`
        : `${character.name}：请通过右上角“切换角色”控制`,
    )
  })

  return {
    element,
    visual,
    facingController: createFacingController('front', motionFeedback.directionHoldMs, {
      horizontalHalfAngleDegrees: motionFeedback.horizontalFacingHalfAngleDegrees,
      verticalHalfAngleDegrees: motionFeedback.verticalFacingHalfAngleDegrees,
    }),
    renderedFacing: 'front',
  }
}

let movement: MovementController | null = null
let movingCharacterId: string | null = null
let previousStopReason: MovementStopReason | null = null

const syncCharacterActors = (): void => {
  const snapshot = characterStore.getSnapshot()
  const activeIds = new Set(snapshot.activeCharacters.map((character) => character.id))

  characterActors.forEach((view, characterId) => {
    if (!activeIds.has(characterId)) {
      view.element.remove()
      characterActors.delete(characterId)
    }
  })

  snapshot.activeCharacters.forEach((character) => {
    let view = characterActors.get(character.id)
    if (!view) {
      view = createCharacterActor(character)
      characterActors.set(character.id, view)
      stage.addWorldElement(view.element)
    }

    view.element.dataset.current = String(character.id === snapshot.currentCharacterId)
    view.element.dataset.avatar = character.avatarId
    view.element.dataset.name = character.name
    view.visual.alt = character.name
    if (character.id !== movingCharacterId) {
      positionWorldElement(view.element, character.position)
      view.element.dataset.moving = 'false'
    }
  })

  spatialAudio.sync(snapshot)
  if (audioControl) {
    audioControl.disabled = snapshot.activeCharacters.length === 0
    audioControl.innerHTML = spatialAudio.isRunning()
      ? '<i class="ph ph-speaker-high" aria-hidden="true"></i><span>重新开始角色声音</span>'
      : '<i class="ph ph-speaker-simple-high" aria-hidden="true"></i><span>开启角色声音</span>'
  }
}

const persistCurrentPosition = (): void => {
  if (!movement || !movingCharacterId) {
    return
  }

  characterStore.updateCharacterPosition(movingCharacterId, movement.getSnapshot().position)
}

const activateCurrentCharacter = (): void => {
  if (movement) {
    persistCurrentPosition()
    movement.cancel()
  }

  const snapshot = characterStore.getSnapshot()
  const currentCharacter = snapshot.activeCharacters.find(
    (character) => character.id === snapshot.currentCharacterId,
  )

  characterActors.forEach((view) => {
    view.element.dataset.moving = 'false'
  })
  stage.setTargetMarker(null)

  if (!currentCharacter) {
    movement = null
    movingCharacterId = null
    previousStopReason = null
    return
  }

  movingCharacterId = currentCharacter.id
  movement = createMovementController(
    currentCharacter.position,
    prototypeConfig.player.movementSpeed,
    walkableArea.isPointWalkable,
    prototypeConfig.player.acceleration,
    prototypeConfig.player.deceleration,
    prototypeConfig.player.motionFeedback.enabled,
  )
  previousStopReason = movement.getSnapshot().stopReason
  syncCharacterActors()
}

const characterControls = createCharacterControls(prototypeConfig.characters.avatars, {
  getSnapshot: () => characterStore.getSnapshot(),
  beginDraft: () => {
    characterStore.startDraft()
  },
  updateDraftIdentity: (name, avatarId) => {
    characterStore.updateDraftIdentity(name, avatarId)
  },
  completeDraftWithSound: (soundRef) => {
    characterStore.setDraftSound(soundRef)
    const character = characterStore.commitDraft()
    syncCharacterActors()
    if (!movement) {
      activateCurrentCharacter()
    }
    stage.setStatus(`${character.name} 已进入场景，请点击左侧“开启角色声音”`)
    return character
  },
  replaceCharacterSound: (characterId, soundRef) => {
    const previous = characterStore.replaceCharacterSound(characterId, soundRef)
    stage.setStatus('角色声音已替换')
    return previous
  },
  cancelDraft: () => {
    characterStore.cancelDraft()
    stage.setStatus('已取消创建，未占用角色容量或出生位置')
  },
  switchCharacter: (characterId) => {
    persistCurrentPosition()
    const character = characterStore.switchCurrentCharacter(characterId)
    activateCurrentCharacter()
    stage.setStatus(`已切换当前角色：${character.name}`)
  },
  onStateChanged: () => {
    syncCharacterActors()
  },
  onPanelVisibilityChanged: (isOpen) => {
    if (isOpen === characterPanelOpen) return
    characterPanelOpen = isOpen
    if (isOpen) {
      resumeSpatialAudioAfterPanel = spatialAudio.isRunning()
      if (resumeSpatialAudioAfterPanel) spatialAudio.stopAll()
      syncCharacterActors()
      return
    }
    if (!resumeSpatialAudioAfterPanel) return
    resumeSpatialAudioAfterPanel = false
    void spatialAudio.startAll()
      .then(() => syncCharacterActors())
      .catch(() => stage.setStatus('场景声音恢复失败，请点击“开启角色声音”重试', 'error'))
  },
}, soundCapture)

audioControl = document.createElement('button')
audioControl.type = 'button'
audioControl.className = 'stage-audio-control'
audioControl.dataset.interactive = 'true'
audioControl.innerHTML = '<i class="ph ph-speaker-simple-high" aria-hidden="true"></i><span>开启角色声音</span>'
audioControl.addEventListener('click', async () => {
  try {
    await spatialAudio.initialize()
    const mix = spatialAudio.sync(characterStore.getSnapshot())
    const played = await spatialAudio.startAll()
    syncCharacterActors()
    stage.setStatus(
      played > 0
        ? `空间声音已开始：${played} 个可听角色，角色总线 ${mix.characterBusGain.toFixed(2)}`
        : '没有找到可播放的角色声音，请重新录制或导入后再试',
    )
  } catch {
    stage.setStatus('声音初始化失败，请再次点击恢复声音', 'error')
  }
})

characterStore.startDraft()
characterControls.refresh()

stage.onWorldTap((worldPoint) => {
  if (!movement || !movingCharacterId) {
    stage.setStatus('请先完成第一个角色的创建', 'error')
    return
  }

  const resolution = resolveNavigationTarget(
    worldPoint,
    walkableArea.isPointWalkable,
    prototypeConfig.scene.walkableRearBoundary,
    prototypeConfig.scene.wallNavigation,
  )
  stage.setNavigationDebug({
    rawPoint: resolution.rawPoint,
    projectedPoint: resolution.projectedPoint,
    resolvedPoint: resolution.target,
    usedNearestLegalPoint: resolution.usedNearestLegalPoint,
  })

  if (!resolution.target) {
    if (resolution.rejectReason === 'no-legal-projected-point') {
      stage.setStatus('墙前投影附近没有合法地面，本次点击未更新移动目标', 'error')
    }
    return
  }

  const accepted = movement.setTarget(resolution.target)
  if (!accepted) {
    return
  }

  stage.setTargetMarker(resolution.target, true)
  if (resolution.source === 'wall-proxy') {
    const fallbackText = resolution.usedNearestLegalPoint ? '，已避开阻挡' : ''
    stage.setStatus(
      `墙前投影：${worldPoint.x.toFixed(0)}, ${worldPoint.y.toFixed(0)} → ${resolution.target.x.toFixed(0)}, ${resolution.target.y.toFixed(0)}${fallbackText}`,
    )
  } else {
    stage.setStatus(
      `移动目标：${resolution.target.x.toFixed(0)}, ${resolution.target.y.toFixed(0)}`,
    )
  }
})

stage.ready
  .then(() => stage.setStatus('场景已加载：请先创建角色；完成后可点击地板或墙前代理区移动'))
  .catch(() => stage.setStatus('场景资源加载失败，请刷新页面重试', 'error'))

stage.element.append(characterControls.element, audioControl)
app.replaceChildren(stage.element, orientationHint)
syncCharacterActors()

let animationFrame = 0
let previousTime = 0

const animate = (time: number): void => {
  const deltaSeconds = previousTime === 0 ? 0 : (time - previousTime) / 1000
  previousTime = time

  if (movement && movingCharacterId) {
    const snapshot = movement.update(deltaSeconds)
    const actor = characterActors.get(movingCharacterId)

    if (snapshot.isMoving || snapshot.stopReason !== previousStopReason) {
      characterStore.updateCharacterPosition(movingCharacterId, snapshot.position)
      spatialAudio.sync(characterStore.getSnapshot())
    }
    if (actor) {
      positionWorldElement(actor.element, snapshot.position)
      actor.element.dataset.moving = String(snapshot.isMoving && motionFeedbackEnabled)

      if (snapshot.isMoving && snapshot.target && motionFeedbackEnabled) {
        const facing = actor.facingController.update(
          {
            x: snapshot.target.x - snapshot.position.x,
            y: snapshot.target.y - snapshot.position.y,
          },
          time,
        )

        if (facing !== actor.renderedFacing) {
          const presentation = getFacingPresentation(
            facing,
            prototypeConfig.player.facingSprites,
          )
          actor.visual.src = presentation.imageUrl
          actor.visual.dataset.mirrored = String(presentation.mirrored)
          actor.renderedFacing = facing
        }
      }
    }

    if (snapshot.stopReason !== previousStopReason) {
      if (snapshot.stopReason === 'arrived') {
        stage.setStatus(
          `已到达：${snapshot.position.x.toFixed(0)}, ${snapshot.position.y.toFixed(0)}`,
        )
        stage.setTargetMarker(null)
      } else if (snapshot.stopReason === 'blocked') {
        stage.setStatus('移动路径离开可行走地板，角色已停止', 'error')
        stage.setTargetMarker(null)
      }
      previousStopReason = snapshot.stopReason
    }
  }

  animationFrame = requestAnimationFrame(animate)
}

animationFrame = requestAnimationFrame(animate)

window.addEventListener(
  'pagehide',
  () => {
    cancelAnimationFrame(animationFrame)
    movement?.cancel()
    spatialAudio.destroy()
    characterControls.destroy()
    stage.destroy()
  },
  { once: true },
)
