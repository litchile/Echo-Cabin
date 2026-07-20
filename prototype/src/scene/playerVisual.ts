import type { Point } from '../core/coordinates'

export type PlayerFacing =
  | 'front'
  | 'front-left'
  | 'front-right'
  | 'left'
  | 'right'
  | 'back-left'
  | 'back-right'
  | 'back'

export interface PlayerFacingSprites {
  front: string
  frontThreeQuarterRight: string
  profileLeft: string
  rearThreeQuarterLeft: string
  back: string
}

export interface PlayerMotionFeedbackConfig {
  enabled: boolean
  directionHoldMs: number
  horizontalFacingHalfAngleDegrees: number
  verticalFacingHalfAngleDegrees: number
  bobAmplitudePercent: number
  bobCycleMs: number
  shadowMovingScale: number
}

export interface FacingPresentation {
  imageUrl: string
  mirrored: boolean
}

export interface FacingController {
  update(direction: Point, nowMs: number): PlayerFacing
  getFacing(): PlayerFacing
}

export interface FacingThresholds {
  horizontalHalfAngleDegrees: number
  verticalHalfAngleDegrees: number
}

const defaultFacingThresholds: FacingThresholds = {
  horizontalHalfAngleDegrees: 14,
  verticalHalfAngleDegrees: 26,
}

export function classifyFacing(
  direction: Point,
  thresholds: FacingThresholds = defaultFacingThresholds,
): PlayerFacing {
  const magnitude = Math.hypot(direction.x, direction.y)
  if (magnitude < 0.001) {
    return 'front'
  }

  const normalizedX = direction.x / magnitude
  const normalizedY = direction.y / magnitude
  const horizontalSlope = Math.tan(
    (thresholds.horizontalHalfAngleDegrees * Math.PI) / 180,
  )
  const verticalSlope = Math.tan(
    (thresholds.verticalHalfAngleDegrees * Math.PI) / 180,
  )
  const absoluteX = Math.abs(normalizedX)
  const absoluteY = Math.abs(normalizedY)

  if (absoluteX <= absoluteY * verticalSlope) {
    return normalizedY >= 0 ? 'front' : 'back'
  }
  if (absoluteY <= absoluteX * horizontalSlope) {
    return normalizedX >= 0 ? 'right' : 'left'
  }
  if (normalizedY >= 0) return normalizedX >= 0 ? 'front-right' : 'front-left'
  return normalizedX >= 0 ? 'back-right' : 'back-left'
}

export function createFacingController(
  initialFacing: PlayerFacing,
  directionHoldMs: number,
  thresholds: FacingThresholds = defaultFacingThresholds,
): FacingController {
  let currentFacing = initialFacing
  let pendingFacing: PlayerFacing | null = null
  let pendingSinceMs = 0

  return {
    update(direction, nowMs) {
      const candidate = classifyFacing(direction, thresholds)
      if (candidate === currentFacing) {
        pendingFacing = null
        return currentFacing
      }

      if (candidate !== pendingFacing) {
        pendingFacing = candidate
        pendingSinceMs = nowMs
        return currentFacing
      }

      if (nowMs - pendingSinceMs >= Math.max(0, directionHoldMs)) {
        currentFacing = candidate
        pendingFacing = null
      }

      return currentFacing
    },
    getFacing() {
      return currentFacing
    },
  }
}

export function getFacingPresentation(
  facing: PlayerFacing,
  sprites: PlayerFacingSprites,
): FacingPresentation {
  switch (facing) {
    case 'front':
      return { imageUrl: sprites.front, mirrored: false }
    case 'front-right':
      return { imageUrl: sprites.frontThreeQuarterRight, mirrored: false }
    case 'front-left':
      return { imageUrl: sprites.frontThreeQuarterRight, mirrored: true }
    case 'left':
      return { imageUrl: sprites.profileLeft, mirrored: false }
    case 'right':
      return { imageUrl: sprites.profileLeft, mirrored: true }
    case 'back-left':
      return { imageUrl: sprites.rearThreeQuarterLeft, mirrored: false }
    case 'back-right':
      return { imageUrl: sprites.rearThreeQuarterLeft, mirrored: true }
    case 'back':
      return { imageUrl: sprites.back, mirrored: false }
  }
}
