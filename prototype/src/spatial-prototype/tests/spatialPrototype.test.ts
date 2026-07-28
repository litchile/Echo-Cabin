import { describe, expect, it } from 'vitest'
import { distanceBetweenPoints } from '../../audio/spatialAudio'
import type { Point } from '../../core/coordinates'
import { spatialPrototypeConfig as config } from '../config'
import { effectivePlaylistGain, gainAtDistance } from '../spatialMixer'

const audibleFriendsAt = (point: Point): string[] => config.friends
  .filter((friend) => gainAtDistance(distanceBetweenPoints(point, friend.position), config.audio) > 0.01)
  .map((friend) => friend.id)

describe('isolated spatial prototype calibration', () => {
  it('starts in a quiet area', () => {
    expect(audibleFriendsAt(config.player.initialPosition)).toEqual([])
  })

  it.each(config.friends)('has a single-voice area around $name', (friend) => {
    expect(audibleFriendsAt(friend.position)).toEqual([friend.id])
  })

  it('contains representative two-voice overlap points', () => {
    expect(audibleFriendsAt({ x: 960, y: 340 })).toEqual(['lin', 'momo'])
    expect(audibleFriendsAt({ x: 780, y: 575 })).toEqual(['lin', 'kai'])
    expect(audibleFriendsAt({ x: 1140, y: 585 })).toEqual(['momo', 'kai'])
  })

  it('contains a three-voice overlap area', () => {
    expect(audibleFriendsAt({ x: 960, y: 520 })).toEqual(['lin', 'momo', 'kai'])
  })

  it('matches playlist loudness to near-source spatial loudness', () => {
    const spatialNear = gainAtDistance(0, config.audio) * config.audio.masterGain
    expect(effectivePlaylistGain(config.audio)).toBeCloseTo(spatialNear)
  })

  it('keeps the maximum three-voice sum below unity', () => {
    expect(effectivePlaylistGain(config.audio) * config.friends.length).toBeLessThan(1)
  })
})
