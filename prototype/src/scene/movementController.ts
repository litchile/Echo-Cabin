import type { Point } from '../core/coordinates'
import { distanceBetween } from '../core/geometry'

export type MovementStopReason = 'arrived' | 'blocked' | 'cancelled' | null

export interface MovementSnapshot {
  position: Point
  target: Point | null
  isMoving: boolean
  currentSpeed: number
  stopReason: MovementStopReason
}

export interface MovementController {
  getSnapshot(): MovementSnapshot
  setTarget(target: Point): boolean
  update(deltaSeconds: number): MovementSnapshot
  cancel(): void
}

export function createMovementController(
  initialPosition: Point,
  maxSpeed: number,
  isPointWalkable: (point: Point) => boolean,
  acceleration = maxSpeed * 3,
  deceleration = maxSpeed * 4,
  easingEnabled = true,
): MovementController {
  if (maxSpeed <= 0 || acceleration <= 0 || deceleration <= 0) {
    throw new RangeError('Movement speed, acceleration and deceleration must be positive.')
  }

  let position = { ...initialPosition }
  let target: Point | null = null
  let currentSpeed = 0
  let stopReason: MovementStopReason = null

  const getSnapshot = (): MovementSnapshot => ({
    position: { ...position },
    target: target ? { ...target } : null,
    isMoving: target !== null,
    currentSpeed,
    stopReason,
  })

  return {
    getSnapshot,
    setTarget(nextTarget) {
      if (!isPointWalkable(nextTarget)) {
        return false
      }

      target = { ...nextTarget }
      stopReason = null
      return true
    },
    update(deltaSeconds) {
      if (!target || deltaSeconds <= 0) {
        return getSnapshot()
      }

      const distance = distanceBetween(position, target)
      const safeDelta = Math.min(deltaSeconds, 0.05)
      if (easingEnabled) {
        const brakingSpeed = Math.sqrt(2 * deceleration * distance)
        const desiredSpeed = Math.min(maxSpeed, brakingSpeed)
        const speedChange =
          desiredSpeed >= currentSpeed ? acceleration * safeDelta : deceleration * safeDelta
        currentSpeed += Math.sign(desiredSpeed - currentSpeed) *
          Math.min(Math.abs(desiredSpeed - currentSpeed), speedChange)
      } else {
        currentSpeed = maxSpeed
      }
      const travelDistance = currentSpeed * safeDelta

      if (distance <= Math.max(travelDistance, 0.5)) {
        position = { ...target }
        target = null
        currentSpeed = 0
        stopReason = 'arrived'
        return getSnapshot()
      }

      const ratio = travelDistance / distance
      const nextPosition = {
        x: position.x + (target.x - position.x) * ratio,
        y: position.y + (target.y - position.y) * ratio,
      }

      if (!isPointWalkable(nextPosition)) {
        target = null
        currentSpeed = 0
        stopReason = 'blocked'
        return getSnapshot()
      }

      position = nextPosition
      return getSnapshot()
    },
    cancel() {
      target = null
      currentSpeed = 0
      stopReason = 'cancelled'
    },
  }
}
