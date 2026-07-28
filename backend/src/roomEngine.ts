import type { PlayerSnapshot, RoomSnapshot, SurfaceDirection } from './protocol'
import {
  angleBetweenDirections,
  isFiniteDirection,
  normalizeDirection,
  rotateDirectionToward,
} from './sphereMath'

interface PlayerRuntime {
  userId: string
  connectionId: string
  direction: SurfaceDirection
  targetDirection: SurfaceDirection | null
  lastClientSequence: number
  lastActiveAtMs: number
}

interface EncounterRuntime {
  encounterId: string
  userIds: [string, string]
  status: 'candidate' | 'qualified'
  accumulatedMs: number
  outsideSinceMs: number | null
}

interface ResponseOfferRuntime {
  responseId: string
  encounterId: string
  fromUserId: string
  toUserId: string
  status: 'pending' | 'accepted'
  resonanceAdded: boolean
  createIdempotencyKey: string
  acceptIdempotencyKey: string | null
}

interface RelationshipRuntime {
  userIds: [string, string]
  resonance: number
  lastResonanceAtMs: number | null
}

export interface PersistedRoomState {
  version: 1 | 2
  playerDirections: Record<string, SurfaceDirection>
  responses?: ResponseOfferRuntime[]
  relationships?: RelationshipRuntime[]
}

export interface RoomEngineOptions {
  sphereRadius: number
  movementSpeed: number
  arrivalDistance: number
  encounterDistance?: number
  encounterDwellMs?: number
  encounterLeaveGraceMs?: number
  recentActivityMs?: number
}

const DEFAULT_STARTS: SurfaceDirection[] = [
  { x: 0, y: 1, z: 0 },
  { x: 0.1, y: 0.99, z: 0 },
  { x: -0.1, y: 0.99, z: 0 },
  { x: 0, y: 0.99, z: 0.1 },
]

export class RoomEngine {
  readonly players = new Map<string, PlayerRuntime>()
  readonly encounters = new Map<string, EncounterRuntime>()
  readonly responses = new Map<string, ResponseOfferRuntime>()
  readonly relationships = new Map<string, RelationshipRuntime>()
  private readonly lastKnownDirections = new Map<string, SurfaceDirection>()
  private snapshotSequence = 0

  constructor(private readonly options: RoomEngineOptions) {}

  connect(userId: string, connectionId: string, nowMs = Date.now()): PlayerSnapshot {
    const existing = this.players.get(userId)
    if (existing) {
      existing.connectionId = connectionId
      existing.targetDirection = null
      existing.lastActiveAtMs = nowMs
      return this.toSnapshot(existing)
    }

    const start = this.lastKnownDirections.get(userId) ?? normalizeDirection(
      DEFAULT_STARTS[this.players.size % DEFAULT_STARTS.length],
    ) ?? { x: 0, y: 1, z: 0 }
    const player: PlayerRuntime = {
      userId,
      connectionId,
      direction: start,
      targetDirection: null,
      lastClientSequence: -1,
      lastActiveAtMs: nowMs,
    }
    this.players.set(userId, player)
    return this.toSnapshot(player)
  }

  disconnect(userId: string, connectionId: string): boolean {
    const player = this.players.get(userId)
    if (!player || player.connectionId !== connectionId) return false
    this.lastKnownDirections.set(userId, player.direction)
    this.players.delete(userId)
    for (const [pairKey, encounter] of this.encounters) {
      if (encounter.userIds.includes(userId)) this.encounters.delete(pairKey)
    }
    return true
  }

  exportPersistentState(): PersistedRoomState {
    const directions = new Map(this.lastKnownDirections)
    for (const player of this.players.values()) {
      directions.set(player.userId, player.direction)
    }
    return {
      version: 2,
      playerDirections: Object.fromEntries(directions),
      responses: [...this.responses.values()],
      relationships: [...this.relationships.values()],
    }
  }

  restorePersistentState(value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    const state = value as Partial<PersistedRoomState>
    if (state.version !== 1 && state.version !== 2 || typeof state.playerDirections !== 'object' ||
      state.playerDirections === null) return

    for (const [userId, rawDirection] of Object.entries(state.playerDirections)) {
      if (!isFiniteDirection(rawDirection)) continue
      const direction = normalizeDirection(rawDirection)
      if (direction) this.lastKnownDirections.set(userId, direction)
    }
    if (state.version === 2 && Array.isArray(state.responses)) {
      for (const response of state.responses) {
        if (!response || typeof response.responseId !== 'string') continue
        this.responses.set(response.responseId, response)
      }
    }
    if (state.version === 2 && Array.isArray(state.relationships)) {
      for (const relationship of state.relationships) {
        if (!relationship || !Array.isArray(relationship.userIds)) continue
        this.relationships.set(relationship.userIds.join(':'), relationship)
      }
    }
  }

  setMoveTarget(
    userId: string,
    connectionId: string,
    clientSequence: number,
    rawTarget: unknown,
    nowMs = Date.now(),
  ): string | null {
    const player = this.players.get(userId)
    if (!player || player.connectionId !== connectionId) return 'stale_connection'
    if (!Number.isSafeInteger(clientSequence) || clientSequence <= player.lastClientSequence) {
      return 'stale_sequence'
    }
    if (!isFiniteDirection(rawTarget)) return 'invalid_direction'
    const target = normalizeDirection(rawTarget)
    if (!target) return 'invalid_direction'

    player.lastClientSequence = clientSequence
    player.targetDirection = target
    player.lastActiveAtMs = nowMs
    return null
  }

  cancelMove(
    userId: string,
    connectionId: string,
    clientSequence: number,
    nowMs = Date.now(),
  ): string | null {
    const player = this.players.get(userId)
    if (!player || player.connectionId !== connectionId) return 'stale_connection'
    if (!Number.isSafeInteger(clientSequence) || clientSequence <= player.lastClientSequence) {
      return 'stale_sequence'
    }
    player.lastClientSequence = clientSequence
    player.targetDirection = null
    player.lastActiveAtMs = nowMs
    return null
  }

  markActivity(userId: string, connectionId: string, nowMs = Date.now()): boolean {
    const player = this.players.get(userId)
    if (!player || player.connectionId !== connectionId) return false
    player.lastActiveAtMs = nowMs
    return true
  }

  createResponse(
    userId: string,
    encounterId: string,
    idempotencyKey: string,
  ): { response: ResponseOfferRuntime } | { reason: string } {
    if (!idempotencyKey) return { reason: 'missing_idempotency_key' }
    const encounter = [...this.encounters.values()].find((value) =>
      value.encounterId === encounterId)
    if (!encounter || encounter.status !== 'qualified') return { reason: 'encounter_not_qualified' }
    if (!encounter.userIds.includes(userId)) return { reason: 'not_encounter_member' }
    const existing = [...this.responses.values()].find((response) =>
      response.encounterId === encounterId)
    if (existing) return { response: existing }

    const toUserId = encounter.userIds.find((value) => value !== userId)
    if (!toUserId) return { reason: 'invalid_encounter' }
    const response: ResponseOfferRuntime = {
      responseId: `response:${encounterId}`,
      encounterId,
      fromUserId: userId,
      toUserId,
      status: 'pending',
      resonanceAdded: false,
      createIdempotencyKey: idempotencyKey,
      acceptIdempotencyKey: null,
    }
    this.responses.set(response.responseId, response)
    return { response }
  }

  acceptResponse(
    userId: string,
    responseId: string,
    idempotencyKey: string,
    nowMs = Date.now(),
  ): { response: ResponseOfferRuntime; relationship: RelationshipRuntime } | { reason: string } {
    if (!idempotencyKey) return { reason: 'missing_idempotency_key' }
    const response = this.responses.get(responseId)
    if (!response) return { reason: 'response_not_found' }
    if (response.toUserId !== userId) return { reason: 'not_response_recipient' }
    const userIds = [response.fromUserId, response.toUserId].sort() as [string, string]
    const pairKey = userIds.join(':')
    const relationship = this.relationships.get(pairKey) ?? {
      userIds,
      resonance: 0,
      lastResonanceAtMs: null,
    }
    if (response.status === 'accepted') return { response, relationship }

    response.status = 'accepted'
    response.acceptIdempotencyKey = idempotencyKey
    const dailyLimitPassed = relationship.lastResonanceAtMs === null ||
      nowMs - relationship.lastResonanceAtMs >= 24 * 60 * 60 * 1000
    if (dailyLimitPassed) {
      relationship.resonance += 1
      relationship.lastResonanceAtMs = nowMs
      response.resonanceAdded = true
    }
    this.relationships.set(pairKey, relationship)
    return { response, relationship }
  }

  tick(deltaSeconds: number, nowMs = Date.now()): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
    const maxAngle = this.options.movementSpeed * deltaSeconds / this.options.sphereRadius
    const arrivalAngle = this.options.arrivalDistance / this.options.sphereRadius

    for (const player of this.players.values()) {
      if (!player.targetDirection) continue
      const remaining = angleBetweenDirections(player.direction, player.targetDirection)
      if (remaining <= arrivalAngle || remaining <= maxAngle) {
        player.direction = player.targetDirection
        player.targetDirection = null
        continue
      }
      player.direction = rotateDirectionToward(
        player.direction,
        player.targetDirection,
        maxAngle,
      )
    }
    this.updateEncounters(deltaSeconds * 1000, nowMs)
  }

  createSnapshot(serverTimeMs: number, viewerUserId?: string): RoomSnapshot {
    this.snapshotSequence += 1
    return {
      type: 'room.snapshot',
      serverTimeMs,
      sequence: this.snapshotSequence,
      players: [...this.players.values()].map((player) => this.toSnapshot(player)),
      encounters: [...this.encounters.values()].map((encounter) => ({
        encounterId: encounter.encounterId,
        userIds: encounter.userIds,
        status: encounter.status,
      })),
      responses: [...this.responses.values()]
        .filter((response) => !viewerUserId ||
          response.fromUserId === viewerUserId || response.toUserId === viewerUserId)
        .map(({ createIdempotencyKey: _createKey, acceptIdempotencyKey: _acceptKey, ...response }) => response),
      relationships: [...this.relationships.values()]
        .filter((relationship) => !viewerUserId || relationship.userIds.includes(viewerUserId))
        .map(({ lastResonanceAtMs: _lastResonanceAtMs, ...relationship }) => relationship),
    }
  }

  private updateEncounters(deltaMs: number, nowMs: number): void {
    const players = [...this.players.values()]
    const encounterDistance = this.options.encounterDistance ?? 2.2
    const dwellMs = this.options.encounterDwellMs ?? 20_000
    const leaveGraceMs = this.options.encounterLeaveGraceMs ?? 3_000
    const recentActivityMs = this.options.recentActivityMs ?? 60_000
    const activePairKeys = new Set<string>()

    for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < players.length; secondIndex += 1) {
        const first = players[firstIndex]
        const second = players[secondIndex]
        const userIds = [first.userId, second.userId].sort() as [string, string]
        const pairKey = userIds.join(':')
        activePairKeys.add(pairKey)
        const distance = angleBetweenDirections(first.direction, second.direction) *
          this.options.sphereRadius
        const existing = this.encounters.get(pairKey)

        if (distance <= encounterDistance) {
          const encounter = existing ?? {
            encounterId: `${pairKey}:${Math.floor(nowMs)}`,
            userIds,
            status: 'candidate' as const,
            accumulatedMs: 0,
            outsideSinceMs: null,
          }
          encounter.outsideSinceMs = null
          const recentlyActive = nowMs - first.lastActiveAtMs <= recentActivityMs &&
            nowMs - second.lastActiveAtMs <= recentActivityMs
          if (recentlyActive && encounter.status === 'candidate') {
            encounter.accumulatedMs += deltaMs
            if (encounter.accumulatedMs >= dwellMs) encounter.status = 'qualified'
          }
          this.encounters.set(pairKey, encounter)
          continue
        }

        if (!existing) continue
        existing.outsideSinceMs ??= nowMs
        if (nowMs - existing.outsideSinceMs > leaveGraceMs) {
          this.encounters.delete(pairKey)
          for (const [responseId, response] of this.responses) {
            if (response.encounterId === existing.encounterId && response.status === 'pending') {
              this.responses.delete(responseId)
            }
          }
        }
      }
    }

    for (const pairKey of this.encounters.keys()) {
      if (!activePairKeys.has(pairKey)) this.encounters.delete(pairKey)
    }
  }

  private toSnapshot(player: PlayerRuntime): PlayerSnapshot {
    return {
      userId: player.userId,
      direction: player.direction,
      moving: player.targetDirection !== null,
      lastProcessedClientSequence: player.lastClientSequence,
    }
  }
}
