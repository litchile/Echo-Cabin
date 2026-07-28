import type { SurfaceDirection } from './protocol'

const EPSILON = 1e-8

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const isFiniteDirection = (value: unknown): value is SurfaceDirection => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<SurfaceDirection>
  return [candidate.x, candidate.y, candidate.z].every(Number.isFinite)
}

export const normalizeDirection = (
  direction: SurfaceDirection,
): SurfaceDirection | null => {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z)
  if (!Number.isFinite(magnitude) || magnitude < EPSILON) return null
  return {
    x: direction.x / magnitude,
    y: direction.y / magnitude,
    z: direction.z / magnitude,
  }
}

export const angleBetweenDirections = (
  first: SurfaceDirection,
  second: SurfaceDirection,
): number => {
  const a = normalizeDirection(first)
  const b = normalizeDirection(second)
  if (!a || !b) return Number.NaN
  return Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1))
}

export const rotateDirectionToward = (
  current: SurfaceDirection,
  target: SurfaceDirection,
  maxAngleRadians: number,
): SurfaceDirection => {
  const from = normalizeDirection(current)
  const to = normalizeDirection(target)
  if (!from || !to) throw new Error('A surface direction cannot be zero')

  const angle = angleBetweenDirections(from, to)
  if (angle <= maxAngleRadians || angle < EPSILON) return to

  const ratio = clamp(maxAngleRadians / angle, 0, 1)
  const sinAngle = Math.sin(angle)
  if (Math.abs(sinAngle) < 1e-6) {
    const blended = normalizeDirection({
      x: from.x * (1 - ratio) + to.x * ratio,
      y: from.y * (1 - ratio) + to.y * ratio,
      z: from.z * (1 - ratio) + to.z * ratio,
    })
    return blended ?? to
  }

  const fromWeight = Math.sin((1 - ratio) * angle) / sinAngle
  const toWeight = Math.sin(ratio * angle) / sinAngle
  return normalizeDirection({
    x: from.x * fromWeight + to.x * toWeight,
    y: from.y * fromWeight + to.y * toWeight,
    z: from.z * fromWeight + to.z * toWeight,
  }) ?? to
}
