import { describe, expect, it } from 'vitest'
import { tinyPlanetConfig } from '../config'
import { greatCircleDistance } from '../sphereMath'
import { gainAtDistance } from '../../spatial-prototype/spatialMixer'

describe('tiny planet experiment layout', () => {
  it('keeps the initial player position in a quiet region', () => {
    const nearestDistance = Math.min(...tinyPlanetConfig.friends.map((friend) =>
      greatCircleDistance(
        tinyPlanetConfig.playerInitialDirection,
        friend.surfaceDirection,
        tinyPlanetConfig.radius,
      )))
    expect(nearestDistance).toBeGreaterThan(tinyPlanetConfig.audio.maxHearingDistance)
    expect(gainAtDistance(nearestDistance, tinyPlanetConfig.audio)).toBe(0)
  })

  it('places all three friend ranges in a shared overlap region', () => {
    const clusterCenter = { x: 0, y: 0, z: 1 }
    tinyPlanetConfig.friends.forEach((friend) => {
      expect(greatCircleDistance(
        clusterCenter,
        friend.surfaceDirection,
        tinyPlanetConfig.radius,
      )).toBeLessThan(tinyPlanetConfig.audio.maxHearingDistance)
    })
  })

  it('keeps friend identities and audio presets distinct', () => {
    expect(new Set(tinyPlanetConfig.friends.map((friend) => friend.color)).size).toBe(3)
    expect(new Set(tinyPlanetConfig.friends.map((friend) => friend.placeholderShape)).size).toBe(3)
    expect(new Set(tinyPlanetConfig.friends.map((friend) => friend.audioUrl)).size).toBe(3)
  })

  it('takes about 26 seconds to walk around the full circumference', () => {
    const lapSeconds = Math.PI * 2 * tinyPlanetConfig.radius / tinyPlanetConfig.moveSpeed
    expect(lapSeconds).toBeGreaterThanOrEqual(24)
    expect(lapSeconds).toBeLessThanOrEqual(29)
  })

  it('makes the opposite hemisphere fully silent', () => {
    const oppositeDistance = Math.PI * tinyPlanetConfig.radius
    expect(oppositeDistance).toBeGreaterThan(tinyPlanetConfig.audio.maxHearingDistance * 4)
    expect(gainAtDistance(oppositeDistance, tinyPlanetConfig.audio)).toBe(0)
  })
})
