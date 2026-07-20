import { describe, expect, it } from 'vitest'
import { createMovementController } from '../scene/movementController'

describe('movement controller', () => {
  const alwaysWalkable = (): boolean => true

  it('eases in and out, then arrives without jitter', () => {
    const controller = createMovementController(
      { x: 0, y: 0 },
      100,
      alwaysWalkable,
      200,
      250,
    )
    expect(controller.setTarget({ x: 100, y: 0 })).toBe(true)

    const startingSpeed = controller.update(0.05).currentSpeed
    const acceleratedSpeed = controller.update(0.05).currentSpeed
    expect(startingSpeed).toBeGreaterThan(0)
    expect(acceleratedSpeed).toBeGreaterThan(startingSpeed)

    let previousSpeed = acceleratedSpeed
    let sawDeceleration = false
    let arrived = controller.getSnapshot()
    for (let index = 0; index < 100 && arrived.isMoving; index += 1) {
      arrived = controller.update(0.05)
      if (arrived.currentSpeed < previousSpeed && arrived.isMoving) {
        sawDeceleration = true
      }
      previousSpeed = arrived.currentSpeed
    }

    expect(sawDeceleration).toBe(true)
    expect(arrived.position).toEqual({ x: 100, y: 0 })
    expect(arrived.isMoving).toBe(false)
    expect(arrived.currentSpeed).toBe(0)
    expect(arrived.stopReason).toBe('arrived')

    expect(controller.update(1).position).toEqual({ x: 100, y: 0 })
  })

  it('updates the target while movement is active', () => {
    const controller = createMovementController({ x: 0, y: 0 }, 100, alwaysWalkable)
    controller.setTarget({ x: 100, y: 0 })
    controller.update(0.05)
    expect(controller.setTarget({ x: 5, y: 100 })).toBe(true)
    expect(controller.getSnapshot().target).toEqual({ x: 5, y: 100 })
  })

  it('can disable easing through configuration', () => {
    const controller = createMovementController(
      { x: 0, y: 0 },
      100,
      alwaysWalkable,
      200,
      250,
      false,
    )
    controller.setTarget({ x: 100, y: 0 })

    const snapshot = controller.update(0.05)
    expect(snapshot.currentSpeed).toBe(100)
    expect(snapshot.position.x).toBe(5)
  })

  it('rejects invalid targets without replacing the current target', () => {
    const controller = createMovementController(
      { x: 0, y: 0 },
      100,
      (point) => point.x <= 100,
    )
    controller.setTarget({ x: 50, y: 0 })

    expect(controller.setTarget({ x: 101, y: 0 })).toBe(false)
    expect(controller.getSnapshot().target).toEqual({ x: 50, y: 0 })
  })

  it('stops when the next path step enters a blocked area', () => {
    const controller = createMovementController(
      { x: 0, y: 0 },
      100,
      (point) => point.x < 10 || point.x > 20,
    )
    controller.setTarget({ x: 30, y: 0 })

    let stopped = controller.getSnapshot()
    for (let index = 0; index < 20 && stopped.isMoving; index += 1) {
      stopped = controller.update(0.05)
    }

    expect(stopped.position.x).toBeGreaterThan(0)
    expect(stopped.position.x).toBeLessThan(10)
    expect(stopped.isMoving).toBe(false)
    expect(stopped.currentSpeed).toBe(0)
    expect(stopped.stopReason).toBe('blocked')
  })
})
