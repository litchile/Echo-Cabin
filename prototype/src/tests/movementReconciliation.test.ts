import { describe, expect, it } from 'vitest'
import { decideMovementReconciliation } from '../tiny-planet-multiplayer/movementReconciliation'

describe('multiplayer movement reconciliation', () => {
  it('ignores a snapshot created before the latest local click', () => {
    expect(decideMovementReconciliation(4, 5, false)).toEqual({
      applySnapshot: false,
      preserveLocalPrediction: true,
    })
  })

  it('keeps the continuous local trajectory while the acknowledged move is active', () => {
    expect(decideMovementReconciliation(5, 5, true)).toEqual({
      applySnapshot: true,
      preserveLocalPrediction: true,
    })
  })

  it('allows the server to settle the final position after arrival', () => {
    expect(decideMovementReconciliation(5, 5, false)).toEqual({
      applySnapshot: true,
      preserveLocalPrediction: false,
    })
  })
})
