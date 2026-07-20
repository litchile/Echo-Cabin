import { describe, expect, it } from 'vitest'
import {
  resolvePlacementPoint,
  snapPointToGrid,
  type PlacementGrid,
} from '../scene/placementGrid'

const grid: PlacementGrid = {
  cellSize: 60,
  origin: { x: 0, y: 0 },
}

const placementPolygon = [
  { x: 300, y: 780 },
  { x: 1620, y: 780 },
  { x: 1800, y: 1020 },
  { x: 120, y: 1020 },
]

describe('hidden item placement grid', () => {
  it('snaps a pointer position to the nearest logical grid point', () => {
    expect(snapPointToGrid({ x: 947, y: 913 }, grid)).toEqual({ x: 960, y: 900 })
  })

  it('supports a configurable grid origin', () => {
    expect(
      snapPointToGrid(
        { x: 947, y: 913 },
        { cellSize: 60, origin: { x: 30, y: 30 } },
      ),
    ).toEqual({ x: 930, y: 930 })
  })

  it('returns the snapped point only inside the permitted placement region', () => {
    expect(resolvePlacementPoint({ x: 947, y: 913 }, placementPolygon, grid)).toEqual({
      x: 960,
      y: 900,
    })
    expect(resolvePlacementPoint({ x: 960, y: 600 }, placementPolygon, grid)).toBeNull()
  })

  it('rejects invalid grid sizes', () => {
    expect(() =>
      snapPointToGrid({ x: 10, y: 10 }, { cellSize: 0, origin: { x: 0, y: 0 } }),
    ).toThrow(RangeError)
  })
})
