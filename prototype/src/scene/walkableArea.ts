import type { Point } from '../core/coordinates'
import { pointInCircle, pointInPolygon } from '../core/geometry'

export interface CircleZone {
  center: Point
  radius: number
  clearance?: number
  label?: string
}

export interface WalkableArea {
  polygon: readonly Point[]
  blockedZones: readonly CircleZone[]
  isPointWalkable(point: Point): boolean
}

export function createWalkableArea(
  polygon: readonly Point[],
  blockedZones: readonly CircleZone[] = [],
): WalkableArea {
  return {
    polygon,
    blockedZones,
    isPointWalkable(point) {
      if (!pointInPolygon(point, polygon)) {
        return false
      }

      return !blockedZones.some((zone) =>
        pointInCircle(
          point,
          zone.center,
          zone.radius + (zone.clearance ?? 0),
        ),
      )
    },
  }
}
