import { describe, expect, it } from 'vitest'
import { spatialPrototypeConfig as config } from '../config'
import { createObservationTracker } from '../observationTracker'

describe('development observation tracker', () => {
  it('classifies quiet, single, double and triple regions', () => {
    const tracker = createObservationTracker(config.friends, config.audio)
    expect(tracker.start(config.player.initialPosition, 0).currentZone).toBe('quiet')
    expect(tracker.update(config.friends[0].position, 1000).currentZone).toBe('single')
    expect(tracker.update({ x: 960, y: 340 }, 2000).currentZone).toBe('double')
    expect(tracker.update({ x: 960, y: 520 }, 3000).currentZone).toBe('triple')
  })

  it('accumulates dwell time without counting long inactive gaps', () => {
    const tracker = createObservationTracker(config.friends, config.audio)
    tracker.start(config.player.initialPosition, 0)
    tracker.update(config.player.initialPosition, 500)
    tracker.update(config.player.initialPosition, 10_000)
    expect(tracker.getSnapshot().dwellMs.quiet).toBe(1500)
  })

  it('counts a repeated clear-range approach after leaving and returning', () => {
    const tracker = createObservationTracker(config.friends, config.audio)
    tracker.start(config.player.initialPosition, 0)
    tracker.update(config.friends[0].position, 1000)
    tracker.update(config.player.initialPosition, 2000)
    tracker.update(config.friends[0].position, 3000)
    const snapshot = tracker.getSnapshot()
    expect(snapshot.approachCounts.lin).toBe(2)
    expect(snapshot.repeatApproaches).toBe(1)
  })

  it('counts only strong opposing target changes as reversals', () => {
    const tracker = createObservationTracker(config.friends, config.audio)
    tracker.start(config.player.initialPosition, 0)
    tracker.recordMoveTarget({ x: 200, y: 500 }, { x: 700, y: 500 })
    tracker.recordMoveTarget({ x: 300, y: 500 }, { x: 800, y: 650 })
    tracker.recordMoveTarget({ x: 500, y: 500 }, { x: 100, y: 500 })
    expect(tracker.getSnapshot().reversals).toBe(1)
  })
})
