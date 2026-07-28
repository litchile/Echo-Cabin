import { describe, expect, it } from 'vitest'
import type { NetworkPlayerSnapshot } from '../tiny-planet-multiplayer/networkClient'
import {
  createNetworkSourceDirections,
  userIdForVoice,
} from '../tiny-planet-multiplayer/voiceBindings'

const player = (userId: string, x: number): NetworkPlayerSnapshot => ({
  userId,
  direction: { x, y: 1, z: 0 },
  moving: false,
  lastProcessedClientSequence: 0,
})

describe('network voice bindings', () => {
  it('mutes the listener and offline players while preserving online positions', () => {
    const sources = createNetworkSourceDirections('dev-b', [
      player('dev-a', 0.1),
      player('dev-b', 0.2),
    ])
    expect(sources.lin).toEqual({ x: 0.1, y: 1, z: 0 })
    expect(sources.momo).toBeNull()
    expect(sources.kai).toBeNull()
  })

  it('maps each preset clip back to a stable development player', () => {
    expect(userIdForVoice('lin')).toBe('dev-a')
    expect(userIdForVoice('momo')).toBe('dev-b')
    expect(userIdForVoice('kai')).toBe('dev-c')
  })
})
