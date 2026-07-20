import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../core/geometry'
import { createWalkableArea } from '../scene/walkableArea'

const floorPolygon = [
  { x: 300, y: 800 },
  { x: 1600, y: 800 },
  { x: 1900, y: 1040 },
  { x: 20, y: 1040 },
]

describe('pointInPolygon', () => {
  it('accepts interior and boundary points', () => {
    expect(pointInPolygon({ x: 960, y: 900 }, floorPolygon)).toBe(true)
    expect(pointInPolygon({ x: 300, y: 800 }, floorPolygon)).toBe(true)
  })

  it('rejects wall and outside points', () => {
    expect(pointInPolygon({ x: 960, y: 600 }, floorPolygon)).toBe(false)
    expect(pointInPolygon({ x: 1910, y: 1040 }, floorPolygon)).toBe(false)
  })
})

describe('createWalkableArea', () => {
  it('accepts free floor points', () => {
    const area = createWalkableArea(floorPolygon)
    expect(area.isPointWalkable({ x: 960, y: 900 })).toBe(true)
  })

  it('supports dynamic occupied zones after an item is placed', () => {
    const area = createWalkableArea(floorPolygon, [
      { center: { x: 1400, y: 920 }, radius: 60, clearance: 20 },
    ])
    expect(area.isPointWalkable({ x: 1400, y: 920 })).toBe(false)
    expect(area.isPointWalkable({ x: 1475, y: 920 })).toBe(false)
    expect(area.isPointWalkable({ x: 1485, y: 920 })).toBe(true)
  })
})
