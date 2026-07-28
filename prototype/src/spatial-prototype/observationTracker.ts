import { distanceBetweenPoints } from '../audio/spatialAudio'
import type { Point } from '../core/coordinates'
import type { FriendDefinition, SpatialPrototypeConfig } from './config'
import { gainAtDistance } from './spatialMixer'

export type ObservationZoneKind = 'quiet' | 'single' | 'double' | 'triple'

export interface ObservationSnapshot {
  running: boolean
  elapsedMs: number
  audibleFriendIds: FriendDefinition['id'][]
  audibleFriendNames: string[]
  nearestFriendName: string
  nearestDistance: number
  currentZone: ObservationZoneKind
  dwellMs: Record<ObservationZoneKind, number>
  reversals: number
  repeatApproaches: number
  approachCounts: Record<FriendDefinition['id'], number>
}

export interface ObservationTracker {
  start(position: Point, nowMs: number): ObservationSnapshot
  update(position: Point, nowMs: number): ObservationSnapshot
  recordMoveTarget(currentPosition: Point, targetPosition: Point): void
  getSnapshot(): ObservationSnapshot
}

const zoneFromCount = (count: number): ObservationZoneKind => {
  if (count <= 0) return 'quiet'
  if (count === 1) return 'single'
  if (count === 2) return 'double'
  return 'triple'
}

const cloneSnapshot = (snapshot: ObservationSnapshot): ObservationSnapshot => ({
  ...snapshot,
  audibleFriendIds: [...snapshot.audibleFriendIds],
  audibleFriendNames: [...snapshot.audibleFriendNames],
  dwellMs: { ...snapshot.dwellMs },
  approachCounts: { ...snapshot.approachCounts },
})

export function createObservationTracker(
  friends: readonly FriendDefinition[],
  audioConfig: SpatialPrototypeConfig['audio'],
  audibleGainThreshold = 0.01,
): ObservationTracker {
  const friendById = new Map(friends.map((friend) => [friend.id, friend]))
  let lastUpdateMs = 0
  let previousDirection: Point | null = null
  let insideClearRange = new Set<FriendDefinition['id']>()
  let snapshot: ObservationSnapshot = {
    running: false,
    elapsedMs: 0,
    audibleFriendIds: [],
    audibleFriendNames: [],
    nearestFriendName: '—',
    nearestDistance: Number.POSITIVE_INFINITY,
    currentZone: 'quiet',
    dwellMs: { quiet: 0, single: 0, double: 0, triple: 0 },
    reversals: 0,
    repeatApproaches: 0,
    approachCounts: { lin: 0, momo: 0, kai: 0 },
  }

  const getSpatialState = (position: Point) => {
    const distances = friends.map((friend) => ({
      friend,
      distance: distanceBetweenPoints(position, friend.position),
    }))
    distances.sort((a, b) => a.distance - b.distance)
    const audible = distances
      .filter(({ distance }) => gainAtDistance(distance, audioConfig) > audibleGainThreshold)
      .map(({ friend }) => friend.id)
    return { distances, audible }
  }

  const updateSpatialState = (position: Point): void => {
    const { distances, audible } = getSpatialState(position)
    const nearest = distances[0]
    const nextInsideClear = new Set<FriendDefinition['id']>()

    distances.forEach(({ friend, distance }) => {
      if (distance > audioConfig.clearDistance) return
      nextInsideClear.add(friend.id)
      if (!insideClearRange.has(friend.id)) {
        snapshot.approachCounts[friend.id] += 1
      }
    })
    insideClearRange = nextInsideClear
    snapshot.repeatApproaches = Object.values(snapshot.approachCounts)
      .reduce((sum, count) => sum + Math.max(0, count - 1), 0)
    snapshot.audibleFriendIds = audible
    snapshot.audibleFriendNames = audible
      .map((friendId) => friendById.get(friendId)?.name ?? friendId)
    snapshot.nearestFriendName = nearest?.friend.name ?? '—'
    snapshot.nearestDistance = nearest?.distance ?? Number.POSITIVE_INFINITY
    snapshot.currentZone = zoneFromCount(audible.length)
  }

  return {
    start(position, nowMs) {
      lastUpdateMs = nowMs
      previousDirection = null
      insideClearRange = new Set()
      snapshot = {
        running: true,
        elapsedMs: 0,
        audibleFriendIds: [],
        audibleFriendNames: [],
        nearestFriendName: '—',
        nearestDistance: Number.POSITIVE_INFINITY,
        currentZone: 'quiet',
        dwellMs: { quiet: 0, single: 0, double: 0, triple: 0 },
        reversals: 0,
        repeatApproaches: 0,
        approachCounts: { lin: 0, momo: 0, kai: 0 },
      }
      updateSpatialState(position)
      return cloneSnapshot(snapshot)
    },
    update(position, nowMs) {
      if (!snapshot.running) return cloneSnapshot(snapshot)
      const deltaMs = Math.max(0, Math.min(nowMs - lastUpdateMs, 1000))
      snapshot.dwellMs[snapshot.currentZone] += deltaMs
      snapshot.elapsedMs += deltaMs
      lastUpdateMs = nowMs
      updateSpatialState(position)
      return cloneSnapshot(snapshot)
    },
    recordMoveTarget(currentPosition, targetPosition) {
      if (!snapshot.running) return
      const direction = {
        x: targetPosition.x - currentPosition.x,
        y: targetPosition.y - currentPosition.y,
      }
      const magnitude = Math.hypot(direction.x, direction.y)
      if (magnitude < 30) return
      const normalized = { x: direction.x / magnitude, y: direction.y / magnitude }
      if (previousDirection) {
        const dot = previousDirection.x * normalized.x + previousDirection.y * normalized.y
        if (dot < -0.35) snapshot.reversals += 1
      }
      previousDirection = normalized
    },
    getSnapshot: () => cloneSnapshot(snapshot),
  }
}
