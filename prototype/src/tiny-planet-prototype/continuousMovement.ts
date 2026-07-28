import { normalizeVector, type Vector3Like } from './sphereMath'

const dot = (first: Vector3Like, second: Vector3Like): number =>
  first.x * second.x + first.y * second.y + first.z * second.z

const cross = (first: Vector3Like, second: Vector3Like): Vector3Like => ({
  x: first.y * second.z - first.z * second.y,
  y: first.z * second.x - first.x * second.z,
  z: first.x * second.y - first.y * second.x,
})

export const rotateTangentAroundSurfaceNormal = (
  tangentValue: Vector3Like,
  surfaceDirection: Vector3Like,
  angleRadians: number,
): Vector3Like => {
  const normal = normalizeVector(surfaceDirection)
  const tangent = projectOntoTangent(tangentValue, normal)
  const normalCrossTangent = cross(normal, tangent)
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)
  return normalizeVector({
    x: tangent.x * cosine + normalCrossTangent.x * sine,
    y: tangent.y * cosine + normalCrossTangent.y * sine,
    z: tangent.z * cosine + normalCrossTangent.z * sine,
  })
}

const projectOntoTangent = (
  vector: Vector3Like,
  surfaceDirection: Vector3Like,
): Vector3Like => {
  const normal = normalizeVector(surfaceDirection)
  const projection = dot(vector, normal)
  return normalizeVector({
    x: vector.x - normal.x * projection,
    y: vector.y - normal.y * projection,
    z: vector.z - normal.z * projection,
  })
}

export const createContinuousMoveTarget = (
  surfaceDirection: Vector3Like,
  cameraForward: Vector3Like,
  horizontalAxis: number,
  verticalAxis: number,
  lookAheadRadians: number,
): Vector3Like | null => {
  const axisLength = Math.hypot(horizontalAxis, verticalAxis)
  if (axisLength < 1e-6) return null

  const normal = normalizeVector(surfaceDirection)
  const forward = projectOntoTangent(cameraForward, normal)
  // Camera screen-right is forward × surface-normal for this view basis.
  // The reverse order mirrors both A/D and virtual-joystick horizontal input.
  const right = normalizeVector(cross(forward, normal))
  const horizontal = horizontalAxis / axisLength
  const vertical = verticalAxis / axisLength
  const tangent = normalizeVector({
    x: right.x * horizontal + forward.x * vertical,
    y: right.y * horizontal + forward.y * vertical,
    z: right.z * horizontal + forward.z * vertical,
  })
  const angle = Math.max(0.01, lookAheadRadians)
  return normalizeVector({
    x: normal.x * Math.cos(angle) + tangent.x * Math.sin(angle),
    y: normal.y * Math.cos(angle) + tangent.y * Math.sin(angle),
    z: normal.z * Math.cos(angle) + tangent.z * Math.sin(angle),
  })
}
