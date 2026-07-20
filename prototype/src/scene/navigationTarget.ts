import type { Point } from '../core/coordinates'
import { distanceBetween } from '../core/geometry'

export interface WallNavigationConfig {
  enabled: boolean
  floorTopY: number
  topY: number
  safetyOffset: number
  nearestSearchRadius: number
  nearestSearchStep: number
  debugVisible: boolean
}

export function getWallNavigationBandHeight(
  config: Pick<WallNavigationConfig, 'floorTopY' | 'topY'>,
): number {
  const bandHeight = config.floorTopY - config.topY
  if (bandHeight <= 0) {
    throw new RangeError('Wall navigation topY must be above floorTopY.')
  }
  return bandHeight
}

export type NavigationTargetSource = 'floor' | 'wall-proxy' | 'rejected'
export type NavigationRejectReason =
  | 'outside-navigation-area'
  | 'no-legal-projected-point'
  | null

export interface NavigationTargetResolution {
  rawPoint: Point
  target: Point | null
  projectedPoint: Point | null
  source: NavigationTargetSource
  usedNearestLegalPoint: boolean
  rejectReason: NavigationRejectReason
}

function reject(
  rawPoint: Point,
  rejectReason: Exclude<NavigationRejectReason, null>,
  projectedPoint: Point | null = null,
): NavigationTargetResolution {
  return {
    rawPoint: { ...rawPoint },
    target: null,
    projectedPoint,
    source: 'rejected',
    usedNearestLegalPoint: false,
    rejectReason,
  }
}

export function getRearBoundaryY(
  x: number,
  rearBoundary: readonly Point[],
): number | null {
  for (let index = 0; index < rearBoundary.length - 1; index += 1) {
    const start = rearBoundary[index]
    const end = rearBoundary[index + 1]
    const minimumX = Math.min(start.x, end.x)
    const maximumX = Math.max(start.x, end.x)
    if (x < minimumX || x > maximumX) {
      continue
    }

    if (Math.abs(end.x - start.x) < Number.EPSILON) {
      return Math.min(start.y, end.y)
    }

    const ratio = (x - start.x) / (end.x - start.x)
    return start.y + (end.y - start.y) * ratio
  }

  return null
}

export function buildWallNavigationBandPolygon(
  rearBoundary: readonly Point[],
  bandHeight: number,
): Point[] {
  const topEdge = rearBoundary.map((point) => ({
    x: point.x,
    y: point.y - bandHeight,
  }))
  return [...topEdge, ...[...rearBoundary].reverse().map((point) => ({ ...point }))]
}

function findNearestLegalPoint(
  projectedPoint: Point,
  isPointWalkable: (point: Point) => boolean,
  searchRadius: number,
  searchStep: number,
): Point | null {
  if (isPointWalkable(projectedPoint)) {
    return { ...projectedPoint }
  }
  if (searchRadius <= 0 || searchStep <= 0) {
    return null
  }

  let nearest: Point | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX += searchStep) {
    for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY += searchStep) {
      const candidate = {
        x: projectedPoint.x + offsetX,
        y: projectedPoint.y + offsetY,
      }
      const candidateDistance = distanceBetween(candidate, projectedPoint)
      if (
        candidateDistance > searchRadius ||
        candidateDistance >= nearestDistance ||
        !isPointWalkable(candidate)
      ) {
        continue
      }
      nearest = candidate
      nearestDistance = candidateDistance
    }
  }

  return nearest
}

export function resolveNavigationTarget(
  rawPoint: Point,
  isPointWalkable: (point: Point) => boolean,
  rearBoundary: readonly Point[],
  config: WallNavigationConfig,
): NavigationTargetResolution {
  if (isPointWalkable(rawPoint)) {
    return {
      rawPoint: { ...rawPoint },
      target: { ...rawPoint },
      projectedPoint: null,
      source: 'floor',
      usedNearestLegalPoint: false,
      rejectReason: null,
    }
  }

  if (!config.enabled) {
    return reject(rawPoint, 'outside-navigation-area')
  }

  const rearBoundaryY = getRearBoundaryY(rawPoint.x, rearBoundary)
  const bandHeight = getWallNavigationBandHeight(config)
  if (
    rearBoundaryY === null ||
    rawPoint.y < rearBoundaryY - bandHeight ||
    rawPoint.y >= rearBoundaryY
  ) {
    return reject(rawPoint, 'outside-navigation-area')
  }

  const projectedPoint = {
    x: Math.min(
      Math.max(rawPoint.x, rearBoundary[0].x),
      rearBoundary[rearBoundary.length - 1].x,
    ),
    y: rearBoundaryY + config.safetyOffset,
  }
  const target = findNearestLegalPoint(
    projectedPoint,
    isPointWalkable,
    config.nearestSearchRadius,
    config.nearestSearchStep,
  )

  if (!target) {
    return reject(rawPoint, 'no-legal-projected-point', projectedPoint)
  }

  return {
    rawPoint: { ...rawPoint },
    target,
    projectedPoint,
    source: 'wall-proxy',
    usedNearestLegalPoint: distanceBetween(target, projectedPoint) > 0.001,
    rejectReason: null,
  }
}
