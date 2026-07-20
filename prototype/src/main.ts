import './styles.css'
import { prototypeConfig } from './config/prototypeConfig'
import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './core/coordinates'
import { createMovementController } from './scene/movementController'
import {
  buildWallNavigationBandPolygon,
  getWallNavigationBandHeight,
  resolveNavigationTarget,
} from './scene/navigationTarget'
import {
  createFacingController,
  getFacingPresentation,
  type PlayerFacing,
} from './scene/playerVisual'
import { createStage } from './scene/stage'
import { createWalkableArea } from './scene/walkableArea'
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
const movement = createMovementController(
  prototypeConfig.player.initialPosition,
  prototypeConfig.player.movementSpeed,
  walkableArea.isPointWalkable,
  prototypeConfig.player.acceleration,
  prototypeConfig.player.deceleration,
  prototypeConfig.player.motionFeedback.enabled,
)

const playerActor = document.createElement('div')
playerActor.className = 'temporary-player'
playerActor.dataset.interactive = 'true'
playerActor.style.width = `${(prototypeConfig.player.visualWidth / WORLD_WIDTH) * 100}%`

const playerShadow = document.createElement('div')
playerShadow.className = 'temporary-player__shadow'
playerShadow.setAttribute('aria-hidden', 'true')

const player = document.createElement('img')
player.className = 'temporary-player__visual'
player.src = prototypeConfig.player.facingSprites.front
player.alt = '临时当前控制角色'
player.draggable = false
playerActor.append(playerShadow, player)

const motionFeedback = prototypeConfig.player.motionFeedback
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const motionFeedbackEnabled = motionFeedback.enabled && !reducedMotion
playerActor.dataset.motionEnabled = String(motionFeedbackEnabled)
playerActor.style.setProperty('--player-bob-amplitude', String(motionFeedback.bobAmplitudePercent))
playerActor.style.setProperty('--player-bob-cycle', `${motionFeedback.bobCycleMs}ms`)
playerActor.style.setProperty('--player-shadow-moving-scale', String(motionFeedback.shadowMovingScale))

const facingController = createFacingController('front', motionFeedback.directionHoldMs, {
  horizontalHalfAngleDegrees: motionFeedback.horizontalFacingHalfAngleDegrees,
  verticalHalfAngleDegrees: motionFeedback.verticalFacingHalfAngleDegrees,
})
let renderedFacing: PlayerFacing = 'front'

Object.values(prototypeConfig.player.facingSprites).forEach((imageUrl) => {
  const image = new Image()
  image.src = imageUrl
})

const positionWorldElement = (element: HTMLElement, point: Point): void => {
  element.style.left = `${(point.x / WORLD_WIDTH) * 100}%`
  element.style.top = `${(point.y / WORLD_HEIGHT) * 100}%`
}

positionWorldElement(playerActor, prototypeConfig.player.initialPosition)

playerActor.addEventListener('click', () => {
  stage.setStatus('当前角色：点击角色不会同时设置移动目标')
})

stage.addWorldElement(playerActor)
stage.onWorldTap((worldPoint) => {
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
  .then(() => stage.setStatus('场景已加载：点击地板，或点击紧贴踢脚线的墙面窄带'))
  .catch(() => stage.setStatus('场景资源加载失败，请刷新页面重试', 'error'))

app.replaceChildren(stage.element, orientationHint)

let animationFrame = 0
let previousTime = 0
let previousStopReason = movement.getSnapshot().stopReason

const animate = (time: number): void => {
  const deltaSeconds = previousTime === 0 ? 0 : (time - previousTime) / 1000
  previousTime = time

  const snapshot = movement.update(deltaSeconds)
  positionWorldElement(playerActor, snapshot.position)
  playerActor.dataset.moving = String(snapshot.isMoving && motionFeedbackEnabled)

  if (snapshot.isMoving && snapshot.target && motionFeedbackEnabled) {
    const facing = facingController.update(
      {
        x: snapshot.target.x - snapshot.position.x,
        y: snapshot.target.y - snapshot.position.y,
      },
      time,
    )

    if (facing !== renderedFacing) {
      const presentation = getFacingPresentation(
        facing,
        prototypeConfig.player.facingSprites,
      )
      player.src = presentation.imageUrl
      player.dataset.mirrored = String(presentation.mirrored)
      renderedFacing = facing
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

  animationFrame = requestAnimationFrame(animate)
}

animationFrame = requestAnimationFrame(animate)

window.addEventListener(
  'pagehide',
  () => {
    cancelAnimationFrame(animationFrame)
    movement.cancel()
    stage.destroy()
  },
  { once: true },
)
