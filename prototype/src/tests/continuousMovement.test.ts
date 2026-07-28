import { describe, expect, it } from 'vitest'
import {
  createContinuousMoveTarget,
  rotateTangentAroundSurfaceNormal,
} from '../tiny-planet-prototype/continuousMovement'
import { angleBetweenUnitVectors } from '../tiny-planet-prototype/sphereMath'

describe('continuous sphere movement', () => {
  it('does not create a target without input', () => {
    expect(createContinuousMoveTarget(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      0,
      0,
      0.3,
    )).toBeNull()
  })

  it('moves forward along the camera tangent by the configured look-ahead', () => {
    const target = createContinuousMoveTarget(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      0,
      1,
      0.3,
    )
    expect(target).not.toBeNull()
    expect(target?.z).toBeGreaterThan(0)
    expect(angleBetweenUnitVectors({ x: 0, y: 1, z: 0 }, target!)).toBeCloseTo(0.3)
  })

  it('normalizes diagonal input so it is not faster', () => {
    const target = createContinuousMoveTarget(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      1,
      1,
      0.3,
    )
    expect(angleBetweenUnitVectors({ x: 0, y: 1, z: 0 }, target!)).toBeCloseTo(0.3)
  })

  it('maps positive horizontal input to camera screen-right instead of mirroring it', () => {
    const target = createContinuousMoveTarget(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      1,
      0,
      0.3,
    )

    expect(target).not.toBeNull()
    expect(target?.x).toBeLessThan(0)
    expect(Math.abs(target?.z ?? 1)).toBeLessThan(0.001)
  })

  it('turns the camera tangent around the local surface normal without tilting it', () => {
    const turned = rotateTangentAroundSurfaceNormal(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      Math.PI / 2,
    )
    expect(turned.x).toBeCloseTo(1)
    expect(turned.y).toBeCloseTo(0)
    expect(turned.z).toBeCloseTo(0)
  })

  it('uses the dragged camera heading as the new WASD forward direction', () => {
    const surface = { x: 0, y: 1, z: 0 }
    const turnedCamera = rotateTangentAroundSurfaceNormal(
      { x: 0, y: 0, z: 1 },
      surface,
      Math.PI / 2,
    )
    const target = createContinuousMoveTarget(
      surface,
      turnedCamera,
      0,
      1,
      0.3,
    )

    expect(target).not.toBeNull()
    expect(target?.x).toBeGreaterThan(0)
    expect(Math.abs(target?.z ?? 1)).toBeLessThan(0.001)
  })
})
