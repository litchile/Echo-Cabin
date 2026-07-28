import { describe, expect, it } from 'vitest'
import {
  angleBetweenUnitVectors,
  greatCircleDistance,
  rotateSurfaceDirectionToward,
  surfaceCoordinateToUnitVector,
} from '../sphereMath'

describe('tiny planet sphere math', () => {
  it('maps latitude and longitude onto a unit sphere', () => {
    expect(surfaceCoordinateToUnitVector({ latitudeDeg: 0, longitudeDeg: 0 })).toEqual({
      x: 0,
      y: 0,
      z: 1,
    })
    const northPole = surfaceCoordinateToUnitVector({ latitudeDeg: 90, longitudeDeg: 45 })
    expect(northPole.y).toBeCloseTo(1)
    expect(northPole.x).toBeCloseTo(0)
    expect(northPole.z).toBeCloseTo(0)
  })

  it('uses surface arc length rather than distance through the planet', () => {
    const front = { x: 0, y: 0, z: 1 }
    const back = { x: 0, y: 0, z: -1 }
    expect(greatCircleDistance(front, back, 5.5)).toBeCloseTo(Math.PI * 5.5)
  })

  it('moves along the great-circle path without leaving the surface', () => {
    const current = { x: 0, y: 0, z: 1 }
    const target = { x: 1, y: 0, z: 0 }
    const next = rotateSurfaceDirectionToward(current, target, Math.PI / 4)
    expect(Math.hypot(next.x, next.y, next.z)).toBeCloseTo(1)
    expect(angleBetweenUnitVectors(current, next)).toBeCloseTo(Math.PI / 4)
    expect(angleBetweenUnitVectors(next, target)).toBeCloseTo(Math.PI / 4)
  })

  it('stops exactly on targets inside one movement step', () => {
    const current = { x: 0, y: 0, z: 1 }
    const target = surfaceCoordinateToUnitVector({ latitudeDeg: 0, longitudeDeg: 4 })
    const result = rotateSurfaceDirectionToward(current, target, Math.PI / 4)
    expect(result.x).toBeCloseTo(target.x)
    expect(result.y).toBeCloseTo(target.y)
    expect(result.z).toBeCloseTo(target.z)
  })
})
