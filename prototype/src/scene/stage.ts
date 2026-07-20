import {
  pageToWorld,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Point,
} from '../core/coordinates'
import { createSceneImage } from './sceneLoader'

const TAP_DISTANCE_THRESHOLD = 12

export interface StageDebugGeometry {
  enabled: boolean
  wallNavigationBandPolygon: readonly Point[]
  rearBoundary: readonly Point[]
}

export interface NavigationDebugState {
  rawPoint: Point
  projectedPoint: Point | null
  resolvedPoint: Point | null
  usedNearestLegalPoint: boolean
}

export interface StageController {
  element: HTMLElement
  worldLayer: HTMLElement
  ready: Promise<void>
  addWorldElement(element: HTMLElement): void
  getWorldPoint(clientPoint: Point): Point | null
  setStatus(message: string, tone?: 'default' | 'error'): void
  setTargetMarker(point: Point | null, valid?: boolean): void
  setNavigationDebug(state: NavigationDebugState | null): void
  onWorldTap(handler: (point: Point) => void): void
  destroy(): void
}

export function createStage(
  sceneImageUrl: string,
  walkablePolygon: readonly Point[],
  itemPlacementPolygon: readonly Point[],
  debugGeometry: StageDebugGeometry,
): StageController {
  const element = document.createElement('section')
  element.className = 'stage'
  element.setAttribute('aria-label', `${WORLD_WIDTH} × ${WORLD_HEIGHT} 虚拟世界舞台`)

  const scene = createSceneImage(sceneImageUrl)

  const walkableOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  walkableOverlay.classList.add('stage__walkable-overlay')
  walkableOverlay.setAttribute('viewBox', `0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`)
  walkableOverlay.setAttribute('aria-hidden', 'true')

  const walkableShape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  walkableShape.classList.add('stage__walkable-shape')
  walkableShape.setAttribute(
    'points',
    walkablePolygon.map((point) => `${point.x},${point.y}`).join(' '),
  )
  walkableOverlay.append(walkableShape)

  const itemPlacementShape = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'polygon',
  )
  itemPlacementShape.classList.add('stage__item-placement-shape')
  itemPlacementShape.setAttribute(
    'points',
    itemPlacementPolygon.map((point) => `${point.x},${point.y}`).join(' '),
  )
  walkableOverlay.append(itemPlacementShape)

  const wallNavigationShape = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'polygon',
  )
  wallNavigationShape.classList.add('stage__wall-navigation-shape')
  wallNavigationShape.setAttribute(
    'points',
    debugGeometry.wallNavigationBandPolygon
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  )
  walkableOverlay.append(wallNavigationShape)

  const wallNavigationTopBoundary = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'polyline',
  )
  wallNavigationTopBoundary.classList.add('stage__wall-navigation-top-boundary')
  wallNavigationTopBoundary.setAttribute(
    'points',
    debugGeometry.wallNavigationBandPolygon
      .slice(0, debugGeometry.rearBoundary.length)
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  )
  walkableOverlay.append(wallNavigationTopBoundary)

  const rearBoundaryShape = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'polyline',
  )
  rearBoundaryShape.classList.add('stage__rear-boundary-shape')
  rearBoundaryShape.setAttribute(
    'points',
    debugGeometry.rearBoundary.map((point) => `${point.x},${point.y}`).join(' '),
  )
  walkableOverlay.append(rearBoundaryShape)

  const navigationDebugGroup = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'g',
  )
  navigationDebugGroup.classList.add('stage__navigation-debug-points')
  navigationDebugGroup.style.display = 'none'

  const createDebugPoint = (className: string): SVGCircleElement => {
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    point.classList.add(className)
    point.setAttribute('r', '11')
    navigationDebugGroup.append(point)
    return point
  }

  const rawDebugPoint = createDebugPoint('stage__navigation-raw-point')
  const projectedDebugPoint = createDebugPoint('stage__navigation-projected-point')
  const resolvedDebugPoint = createDebugPoint('stage__navigation-resolved-point')
  walkableOverlay.append(navigationDebugGroup)
  walkableOverlay.style.display = debugGeometry.enabled ? '' : 'none'

  const worldLayer = document.createElement('div')
  worldLayer.className = 'stage__world-layer'

  const marker = document.createElement('div')
  marker.className = 'stage__target-marker'
  marker.hidden = true
  marker.setAttribute('aria-hidden', 'true')

  const badge = document.createElement('div')
  badge.className = 'stage__badge'
  badge.textContent = '点击地板移动 · 脚底锚点判定'

  const helpButton = document.createElement('button')
  helpButton.className = 'stage__help'
  helpButton.type = 'button'
  helpButton.dataset.interactive = 'true'
  helpButton.textContent = '移动规则'

  const readout = document.createElement('output')
  readout.className = 'stage__readout'
  readout.textContent = '仅地板区域可设置移动目标'

  element.append(
    scene.element,
    walkableOverlay,
    worldLayer,
    marker,
    badge,
    helpButton,
    readout,
  )

  let worldTapHandler: ((point: Point) => void) | null = null
  let pointerStart: { id: number; x: number; y: number } | null = null

  const getWorldPoint = (clientPoint: Point): Point | null =>
    pageToWorld(clientPoint, element.getBoundingClientRect())

  const isInteractiveTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && Boolean(target.closest('[data-interactive="true"]'))

  const handlePointerDown = (event: PointerEvent): void => {
    if (isInteractiveTarget(event.target)) {
      return
    }

    event.preventDefault()
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent): void => {
    if (isInteractiveTarget(event.target) || !pointerStart || pointerStart.id !== event.pointerId) {
      pointerStart = null
      return
    }

    event.preventDefault()
    const movement = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y,
    )
    pointerStart = null

    if (movement > TAP_DISTANCE_THRESHOLD) {
      return
    }

    const worldPoint = getWorldPoint({ x: event.clientX, y: event.clientY })
    if (worldPoint) {
      worldTapHandler?.(worldPoint)
    }
  }

  const clearPointer = (): void => {
    pointerStart = null
  }

  const preventGesture = (event: Event): void => event.preventDefault()

  element.addEventListener('pointerdown', handlePointerDown)
  element.addEventListener('pointerup', handlePointerUp)
  element.addEventListener('pointercancel', clearPointer)
  element.addEventListener('contextmenu', preventGesture)
  element.addEventListener('dragstart', preventGesture)

  const controller: StageController = {
    element,
    worldLayer,
    ready: scene.ready,
    addWorldElement(worldElement) {
      worldLayer.append(worldElement)
    },
    getWorldPoint,
    setStatus(message, tone = 'default') {
      readout.value = message
      readout.dataset.tone = tone
    },
    setTargetMarker(point, valid = true) {
      marker.hidden = point === null
      if (!point) {
        return
      }

      marker.style.left = `${(point.x / WORLD_WIDTH) * 100}%`
      marker.style.top = `${(point.y / WORLD_HEIGHT) * 100}%`
      marker.dataset.valid = String(valid)
    },
    setNavigationDebug(state) {
      navigationDebugGroup.style.display = state ? '' : 'none'
      if (!state) {
        return
      }

      const setDebugPoint = (element: SVGCircleElement, point: Point | null): void => {
        element.style.display = point ? '' : 'none'
        if (!point) {
          return
        }
        element.setAttribute('cx', String(point.x))
        element.setAttribute('cy', String(point.y))
      }

      setDebugPoint(rawDebugPoint, state.rawPoint)
      setDebugPoint(projectedDebugPoint, state.projectedPoint)
      setDebugPoint(resolvedDebugPoint, state.resolvedPoint)
      resolvedDebugPoint.dataset.fallback = String(state.usedNearestLegalPoint)
    },
    onWorldTap(handler) {
      worldTapHandler = handler
    },
    destroy() {
      element.removeEventListener('pointerdown', handlePointerDown)
      element.removeEventListener('pointerup', handlePointerUp)
      element.removeEventListener('pointercancel', clearPointer)
      element.removeEventListener('contextmenu', preventGesture)
      element.removeEventListener('dragstart', preventGesture)
      worldTapHandler = null
    },
  }

  helpButton.addEventListener('click', () => {
    controller.setStatus('地板点击使用原坐标；仅墙下沿窄带会投影到墙前合法地面')
  })

  return controller
}
