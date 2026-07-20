import type { Point } from '../core/coordinates'
import { pointInPolygon } from '../core/geometry'

export interface PlacementGrid {
  cellSize: number
  origin: Point
}

export function snapPointToGrid(point: Point, grid: PlacementGrid): Point {
  if (grid.cellSize <= 0) {
    throw new RangeError('Placement grid cellSize must be greater than zero.')
  }

  return {
    x:
      grid.origin.x +
      Math.round((point.x - grid.origin.x) / grid.cellSize) * grid.cellSize,
    y:
      grid.origin.y +
      Math.round((point.y - grid.origin.y) / grid.cellSize) * grid.cellSize,
  }
}

export function resolvePlacementPoint(
  pointerPoint: Point,
  placementPolygon: readonly Point[],
  grid: PlacementGrid,
): Point | null {
  if (!pointInPolygon(pointerPoint, placementPolygon)) {
    return null
  }

  const snappedPoint = snapPointToGrid(pointerPoint, grid)
  return pointInPolygon(snappedPoint, placementPolygon) ? snappedPoint : null
}
