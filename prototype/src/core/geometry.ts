import type { Point } from './coordinates'

const EPSILON = 1e-8

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y)

  if (Math.abs(cross) > EPSILON) {
    return false
  }

  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y)
  const squaredLength =
    (end.x - start.x) ** 2 + (end.y - start.y) ** 2

  return dot >= -EPSILON && dot <= squaredLength + EPSILON
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) {
    return false
  }

  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]

    if (pointOnSegment(point, previousPoint, currentPoint)) {
      return true
    }

    const crossesHorizontalRay =
      currentPoint.y > point.y !== previousPoint.y > point.y
    const intersectionX =
      ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        (previousPoint.y - currentPoint.y) +
      currentPoint.x

    if (crossesHorizontalRay && point.x < intersectionX) {
      inside = !inside
    }
  }

  return inside
}

export function pointInCircle(point: Point, center: Point, radius: number): boolean {
  return distanceBetween(point, center) <= radius
}
