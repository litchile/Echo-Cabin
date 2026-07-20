export const WORLD_WIDTH = 1920
export const WORLD_HEIGHT = 1080

export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface StageLayout {
  rect: Rect
  scale: number
}

export function fitWorldToViewport(viewport: Rect): StageLayout {
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('Viewport dimensions must be positive.')
  }

  const scale = Math.min(
    viewport.width / WORLD_WIDTH,
    viewport.height / WORLD_HEIGHT,
  )
  const width = WORLD_WIDTH * scale
  const height = WORLD_HEIGHT * scale

  return {
    scale,
    rect: {
      left: viewport.left + (viewport.width - width) / 2,
      top: viewport.top + (viewport.height - height) / 2,
      width,
      height,
    },
  }
}

export function pageToWorld(point: Point, stageRect: Rect): Point | null {
  if (stageRect.width <= 0 || stageRect.height <= 0) {
    return null
  }

  const localX = point.x - stageRect.left
  const localY = point.y - stageRect.top
  const isInside =
    localX >= 0 &&
    localY >= 0 &&
    localX <= stageRect.width &&
    localY <= stageRect.height

  if (!isInside) {
    return null
  }

  return {
    x: (localX / stageRect.width) * WORLD_WIDTH,
    y: (localY / stageRect.height) * WORLD_HEIGHT,
  }
}

export function worldToPage(point: Point, stageRect: Rect): Point | null {
  const isInsideWorld =
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= WORLD_WIDTH &&
    point.y <= WORLD_HEIGHT

  if (!isInsideWorld || stageRect.width <= 0 || stageRect.height <= 0) {
    return null
  }

  return {
    x: stageRect.left + (point.x / WORLD_WIDTH) * stageRect.width,
    y: stageRect.top + (point.y / WORLD_HEIGHT) * stageRect.height,
  }
}
