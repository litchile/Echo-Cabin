import { describe, expect, it } from 'vitest'
import { RoomEngine } from '../src/roomEngine'
import { angleBetweenDirections } from '../src/sphereMath'

const createEngine = (): RoomEngine => new RoomEngine({
  sphereRadius: 10,
  movementSpeed: 2,
  arrivalDistance: 0.01,
})

describe('authoritative room engine', () => {
  it('normalizes targets and advances at the configured speed', () => {
    const engine = createEngine()
    const start = engine.connect('dev-a', 'connection-1').direction
    expect(engine.setMoveTarget(
      'dev-a',
      'connection-1',
      1,
      { x: 10, y: 0, z: 0 },
    )).toBeNull()

    engine.tick(1)
    const after = engine.createSnapshot(1000).players[0].direction
    expect(angleBetweenDirections(start, after)).toBeCloseTo(0.2)
  })

  it('rejects invalid directions and repeated client sequences', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'connection-1')
    expect(engine.setMoveTarget('dev-a', 'connection-1', 1, { x: 0, y: 0, z: 0 }))
      .toBe('invalid_direction')
    expect(engine.setMoveTarget('dev-a', 'connection-1', 2, { x: 1, y: 0, z: 0 }))
      .toBeNull()
    expect(engine.setMoveTarget('dev-a', 'connection-1', 2, { x: 0, y: 1, z: 0 }))
      .toBe('stale_sequence')
    expect(engine.createSnapshot(1000).players[0].lastProcessedClientSequence).toBe(2)
  })

  it('prevents an old connection from controlling or removing a reconnected player', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'old-connection')
    engine.connect('dev-a', 'new-connection')

    expect(engine.setMoveTarget(
      'dev-a',
      'old-connection',
      1,
      { x: 1, y: 0, z: 0 },
    )).toBe('stale_connection')
    expect(engine.disconnect('dev-a', 'old-connection')).toBe(false)
    expect(engine.players.has('dev-a')).toBe(true)
  })

  it('stops at the target instead of overshooting it', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'connection-1')
    engine.setMoveTarget('dev-a', 'connection-1', 1, { x: 0.01, y: 1, z: 0 })
    engine.tick(10)

    const player = engine.createSnapshot(1000).players[0]
    expect(player.moving).toBe(false)
    expect(player.direction.x).toBeGreaterThan(0)
  })

  it('restores the last authoritative position without restoring presence', () => {
    const first = createEngine()
    first.connect('dev-a', 'connection-1')
    first.setMoveTarget('dev-a', 'connection-1', 1, { x: 1, y: 0, z: 0 })
    first.tick(1)
    const beforeRestart = first.createSnapshot(1000).players[0].direction

    const restored = createEngine()
    restored.restorePersistentState(first.exportPersistentState())
    expect(restored.createSnapshot(2000).players).toHaveLength(0)
    const afterRestart = restored.connect('dev-a', 'connection-2').direction
    expect(angleBetweenDirections(beforeRestart, afterRestart)).toBeCloseTo(0)
  })

  it('qualifies an encounter only after both active players remain nearby', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'connection-a', 0)
    engine.connect('dev-b', 'connection-b', 0)

    engine.tick(19.9, 19_900)
    expect(engine.createSnapshot(19_900).encounters[0]?.status).toBe('candidate')

    engine.tick(0.2, 20_100)
    const encounter = engine.createSnapshot(20_100).encounters[0]
    expect(encounter?.status).toBe('qualified')
    expect(encounter?.userIds).toEqual(['dev-a', 'dev-b'])
  })

  it('does not qualify inactive players and keeps a short leave grace period', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'connection-a', 0)
    engine.connect('dev-b', 'connection-b', 0)

    engine.tick(61, 61_000)
    expect(engine.createSnapshot(61_000).encounters[0]?.status).toBe('candidate')

    engine.markActivity('dev-a', 'connection-a', 61_000)
    engine.markActivity('dev-b', 'connection-b', 61_000)
    engine.tick(1, 62_000)
    engine.setMoveTarget('dev-b', 'connection-b', 1, { x: 1, y: 0, z: 0 }, 62_000)
    engine.tick(100, 63_000)
    expect(engine.createSnapshot(63_000).encounters).toHaveLength(1)

    engine.tick(0.1, 65_999)
    expect(engine.createSnapshot(65_999).encounters).toHaveLength(1)
    engine.tick(0.1, 66_001)
    expect(engine.createSnapshot(66_001).encounters).toHaveLength(0)
  })

  it('requires the other player to accept and never duplicates resonance on retry', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'connection-a', 0)
    engine.connect('dev-b', 'connection-b', 0)
    engine.tick(20.1, 20_100)
    const encounterId = engine.createSnapshot(20_100).encounters[0].encounterId

    const created = engine.createResponse('dev-a', encounterId, 'create-1')
    expect('response' in created && created.response.status).toBe('pending')
    const repeated = engine.createResponse('dev-a', encounterId, 'create-1')
    expect('response' in repeated && repeated.response.responseId)
      .toBe('response' in created ? created.response.responseId : '')
    expect(engine.acceptResponse('dev-a', `response:${encounterId}`, 'accept-wrong', 20_100))
      .toEqual({ reason: 'not_response_recipient' })

    const accepted = engine.acceptResponse(
      'dev-b',
      `response:${encounterId}`,
      'accept-1',
      20_100,
    )
    expect('relationship' in accepted && accepted.relationship.resonance).toBe(1)
    const retried = engine.acceptResponse(
      'dev-b',
      `response:${encounterId}`,
      'accept-2',
      20_200,
    )
    expect('relationship' in retried && retried.relationship.resonance).toBe(1)
    expect(engine.createSnapshot(20_200, 'dev-a').responses[0].resonanceAdded).toBe(true)
  })

  it('persists accepted responses and relationship resonance', () => {
    const engine = createEngine()
    engine.connect('dev-a', 'connection-a', 0)
    engine.connect('dev-b', 'connection-b', 0)
    engine.tick(20.1, 20_100)
    const encounterId = engine.createSnapshot(20_100).encounters[0].encounterId
    const created = engine.createResponse('dev-a', encounterId, 'create-1')
    if (!('response' in created)) throw new Error(created.reason)
    engine.acceptResponse('dev-b', created.response.responseId, 'accept-1', 20_100)

    const restored = createEngine()
    restored.restorePersistentState(engine.exportPersistentState())
    const snapshot = restored.createSnapshot(30_000, 'dev-b')
    expect(snapshot.responses[0].status).toBe('accepted')
    expect(snapshot.relationships[0].resonance).toBe(1)
  })
})
