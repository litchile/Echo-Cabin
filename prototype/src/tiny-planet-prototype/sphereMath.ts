export interface Vector3Like {
  x: number
  y: number
  z: number
}

export interface SurfaceCoordinate {
  latitudeDeg: number
  longitudeDeg: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const length = (vector: Vector3Like): number =>
  Math.hypot(vector.x, vector.y, vector.z)

export const normalizeVector = (vector: Vector3Like): Vector3Like => {
  const magnitude = length(vector)
  if (magnitude < 1e-8) return { x: 0, y: 1, z: 0 }
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  }
}

export const surfaceCoordinateToUnitVector = (
  coordinate: SurfaceCoordinate,
): Vector3Like => {
  const latitude = coordinate.latitudeDeg * Math.PI / 180
  const longitude = coordinate.longitudeDeg * Math.PI / 180
  const cosLatitude = Math.cos(latitude)
  return {
    x: cosLatitude * Math.sin(longitude),
    y: Math.sin(latitude),
    z: cosLatitude * Math.cos(longitude),
  }
}

export const angleBetweenUnitVectors = (
  first: Vector3Like,
  second: Vector3Like,
): number => {
  const a = normalizeVector(first)
  const b = normalizeVector(second)
  return Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1))
}

export const greatCircleDistance = (
  first: Vector3Like,
  second: Vector3Like,
  radius: number,
): number => angleBetweenUnitVectors(first, second) * radius

export const rotateSurfaceDirectionToward = (
  current: Vector3Like,
  target: Vector3Like,
  maxAngleRadians: number,
): Vector3Like => {
  const from = normalizeVector(current)
  const to = normalizeVector(target)
  const angle = angleBetweenUnitVectors(from, to)
  if (angle <= maxAngleRadians || angle < 1e-7) return to

  const t = maxAngleRadians / angle
  const sinAngle = Math.sin(angle)
  if (Math.abs(sinAngle) < 1e-6) {
    return normalizeVector({
      x: from.x * (1 - t) + to.x * t,
      y: from.y * (1 - t) + to.y * t,
      z: from.z * (1 - t) + to.z * t,
    })
  }

  const fromWeight = Math.sin((1 - t) * angle) / sinAngle
  const toWeight = Math.sin(t * angle) / sinAngle
  return normalizeVector({
    x: from.x * fromWeight + to.x * toWeight,
    y: from.y * fromWeight + to.y * toWeight,
    z: from.z * fromWeight + to.z * toWeight,
  })
}
