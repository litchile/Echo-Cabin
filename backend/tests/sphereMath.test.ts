import { describe, expect, it } from 'vitest'
import {
  angleBetweenDirections,
  normalizeDirection,
  rotateDirectionToward,
} from '../src/sphereMath'

describe('sphere math', () => {
  it('normalizes valid directions and rejects zero', () => {
    expect(normalizeDirection({ x: 0, y: 2, z: 0 })).toEqual({ x: 0, y: 1, z: 0 })
    expect(normalizeDirection({ x: 0, y: 0, z: 0 })).toBeNull()
  })

  it('computes a quarter-circle angle', () => {
    expect(angleBetweenDirections(
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    )).toBeCloseTo(Math.PI / 2)
  })

  it('moves along the sphere without leaving its surface', () => {
    const next = rotateDirectionToward(
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      Math.PI / 4,
    )
    expect(Math.hypot(next.x, next.y, next.z)).toBeCloseTo(1)
    expect(angleBetweenDirections(next, { x: 1, y: 0, z: 0 })).toBeCloseTo(Math.PI / 4)
  })
})
