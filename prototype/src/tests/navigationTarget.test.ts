import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../core/geometry'
import {
  buildWallNavigationBandPolygon,
  getWallNavigationBandHeight,
  getRearBoundaryY,
  resolveNavigationTarget,
  type WallNavigationConfig,
} from '../scene/navigationTarget'
import { createWalkableArea } from '../scene/walkableArea'

const rearBoundary = [
  { x: 45, y: 940 },
  { x: 330, y: 800 },
  { x: 1590, y: 800 },
  { x: 1875, y: 940 },
]
const floorPolygon = [
  ...rearBoundary,
  { x: 1875, y: 1035 },
  { x: 45, y: 1035 },
]
const config: WallNavigationConfig = {
  enabled: true,
  floorTopY: 800,
  topY: 570,
  safetyOffset: 60,
  nearestSearchRadius: 180,
  nearestSearchStep: 20,
  debugVisible: true,
}

describe('wall-front navigation proxy', () => {
  const walkableArea = createWalkableArea(floorPolygon)

  it('keeps legal floor clicks unchanged', () => {
    const result = resolveNavigationTarget(
      { x: 960, y: 920 },
      walkableArea.isPointWalkable,
      rearBoundary,
      config,
    )
    expect(result.source).toBe('floor')
    expect(result.target).toEqual({ x: 960, y: 920 })
  })

  it('projects a lower-wall click onto legal floor without expanding it', () => {
    const rawPoint = { x: 960, y: 700 }
    const result = resolveNavigationTarget(
      rawPoint,
      walkableArea.isPointWalkable,
      rearBoundary,
      config,
    )
    expect(pointInPolygon(rawPoint, floorPolygon)).toBe(false)
    expect(result.source).toBe('wall-proxy')
    expect(result.projectedPoint).toEqual({ x: 960, y: 860 })
    expect(result.target).toEqual({ x: 960, y: 860 })
    expect(walkableArea.isPointWalkable(result.target!)).toBe(true)
  })

  it('follows the existing sloped rear boundary', () => {
    const boundaryY = getRearBoundaryY(100, rearBoundary)
    expect(boundaryY).toBeCloseTo(912.98, 1)
    const result = resolveNavigationTarget(
      { x: 100, y: 800 },
      walkableArea.isPointWalkable,
      rearBoundary,
      config,
    )
    expect(result.target?.y).toBeCloseTo(972.98, 1)
  })

  it('accepts the expanded lower-wall band and rejects above its top edge', () => {
    const expandedBandResult = resolveNavigationTarget(
      { x: 1300, y: 600 },
      walkableArea.isPointWalkable,
      rearBoundary,
      config,
    )
    expect(expandedBandResult.source).toBe('wall-proxy')

    const result = resolveNavigationTarget(
      { x: 1300, y: 550 },
      walkableArea.isPointWalkable,
      rearBoundary,
      config,
    )
    expect(result.source).toBe('rejected')
    expect(result.target).toBeNull()
  })

  it('treats current wall visuals as background and allows proxy movement', () => {
    const visualElementPoints = [
      { x: 200, y: 800 },
      { x: 900, y: 650 },
      { x: 1450, y: 600 },
      { x: 1750, y: 700 },
    ]
    for (const point of visualElementPoints) {
      const result = resolveNavigationTarget(
        point,
        walkableArea.isPointWalkable,
        rearBoundary,
        config,
      )
      expect(result.source).toBe('wall-proxy')
      expect(result.target).not.toBeNull()
      expect(walkableArea.isPointWalkable(result.target!)).toBe(true)
    }
  })

  it('uses the nearest locally searched legal point when projection is blocked', () => {
    const occupiedArea = createWalkableArea(floorPolygon, [
      { center: { x: 960, y: 860 }, radius: 35 },
    ])
    const result = resolveNavigationTarget(
      { x: 960, y: 700 },
      occupiedArea.isPointWalkable,
      rearBoundary,
      config,
    )
    expect(result.usedNearestLegalPoint).toBe(true)
    expect(result.target).not.toBeNull()
    expect(occupiedArea.isPointWalkable(result.target!)).toBe(true)
  })

  it('rejects the click if no legal point exists in the local search radius', () => {
    const result = resolveNavigationTarget(
      { x: 960, y: 700 },
      () => false,
      rearBoundary,
      config,
    )
    expect(result.rejectReason).toBe('no-legal-projected-point')
    expect(result.target).toBeNull()
  })

  it('builds the expanded debug band directly from the same rear boundary', () => {
    const bandHeight = getWallNavigationBandHeight(config)
    expect(bandHeight).toBe(230)
    const band = buildWallNavigationBandPolygon(rearBoundary, bandHeight)
    expect(band[0]).toEqual({ x: 45, y: 710 })
    expect(band[1]).toEqual({ x: 330, y: 570 })
    expect(band[2]).toEqual({ x: 1590, y: 570 })
    expect(band[3]).toEqual({ x: 1875, y: 710 })
    expect(band[4]).toEqual({ x: 1875, y: 940 })
  })

  it('rejects an invalid measured top boundary', () => {
    expect(() =>
      getWallNavigationBandHeight({ floorTopY: 800, topY: 800 }),
    ).toThrow(RangeError)
  })
})
