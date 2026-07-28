import { calculateDistanceGain, distanceBetweenPoints } from '../audio/spatialAudio'
import type { Point } from '../core/coordinates'
import type { FriendDefinition, SpatialPrototypeConfig } from './config'
import type { PresetSoundBank } from './presetSoundBank'

export type ExperienceMode = 'idle' | 'spatial' | 'playlist'

export interface SpatialMixer {
  startSpatial(listenerPosition: Point): void
  updateListener(listenerPosition: Point): void
  playPlaylist(friendId: FriendDefinition['id']): void
  stopAll(): void
  getMode(): ExperienceMode
  destroy(): void
}

interface FriendChannel {
  friend: FriendDefinition
  gain: GainNode
  source: AudioBufferSourceNode | null
  timer: ReturnType<typeof setTimeout> | null
  targetGain: number
}

export const gainAtDistance = (
  distance: number,
  config: SpatialPrototypeConfig['audio'],
): number => calculateDistanceGain(distance, {
  clearDistance: config.clearDistance,
  maxHearingDistance: config.maxHearingDistance,
  otherCharacterMaxGain: config.nearGain,
})

export const effectivePlaylistGain = (
  config: SpatialPrototypeConfig['audio'],
): number => config.nearGain * config.masterGain

export function createSpatialMixer(
  soundBank: PresetSoundBank,
  friends: readonly FriendDefinition[],
  audioConfig: SpatialPrototypeConfig['audio'],
  onSpeakingChange: (friendId: FriendDefinition['id'], speaking: boolean) => void,
): SpatialMixer {
  const context = soundBank.getContext()
  const master = context.createGain()
  master.gain.value = audioConfig.masterGain
  master.connect(context.destination)
  const channels = new Map<FriendDefinition['id'], FriendChannel>()
  let mode: ExperienceMode = 'idle'
  let listenerPosition: Point = { x: 0, y: 0 }
  let playlistSource: AudioBufferSourceNode | null = null
  let playlistGain: GainNode | null = null

  const smoothGain = (param: AudioParam, target: number): void => {
    const now = context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(target, now + audioConfig.smoothingMs / 1000)
  }

  const clearChannel = (channel: FriendChannel): void => {
    if (channel.timer !== null) {
      globalThis.clearTimeout(channel.timer)
      channel.timer = null
    }
    if (channel.source) {
      const source = channel.source
      channel.source = null
      source.onended = null
      try { source.stop() } catch { /* The source may already have ended. */ }
      source.disconnect()
    }
    onSpeakingChange(channel.friend.id, false)
  }

  const startFriendSource = (channel: FriendChannel): void => {
    if (mode !== 'spatial' || channel.source) return
    const source = context.createBufferSource()
    source.buffer = soundBank.getBuffer(channel.friend.id)
    source.connect(channel.gain)
    source.onended = () => {
      if (channel.source !== source) return
      channel.source = null
      source.disconnect()
      onSpeakingChange(channel.friend.id, false)
      if (mode === 'spatial') {
        channel.timer = globalThis.setTimeout(() => {
          channel.timer = null
          startFriendSource(channel)
        }, channel.friend.silenceMs)
      }
    }
    channel.source = source
    onSpeakingChange(channel.friend.id, true)
    source.start()
  }

  const stopPlaylist = (): void => {
    if (playlistSource) {
      const source = playlistSource
      playlistSource = null
      source.onended = null
      try { source.stop() } catch { /* The source may already have ended. */ }
      source.disconnect()
    }
    playlistGain?.disconnect()
    playlistGain = null
    friends.forEach((friend) => onSpeakingChange(friend.id, false))
  }

  const stopSpatial = (): void => {
    channels.forEach(clearChannel)
    channels.forEach((channel) => channel.gain.disconnect())
    channels.clear()
  }

  const syncDistanceGains = (): void => {
    channels.forEach((channel) => {
      const distance = distanceBetweenPoints(listenerPosition, channel.friend.position)
      const target = gainAtDistance(distance, audioConfig)
      if (Math.abs(target - channel.targetGain) < 0.0005) return
      channel.targetGain = target
      smoothGain(channel.gain.gain, target)
    })
  }

  return {
    startSpatial(position) {
      stopPlaylist()
      stopSpatial()
      mode = 'spatial'
      listenerPosition = { ...position }
      friends.forEach((friend) => {
        const gain = context.createGain()
        const targetGain = gainAtDistance(distanceBetweenPoints(position, friend.position), audioConfig)
        gain.gain.value = targetGain
        gain.connect(master)
        const channel: FriendChannel = {
          friend,
          gain,
          source: null,
          timer: null,
          targetGain,
        }
        channels.set(friend.id, channel)
        channel.timer = globalThis.setTimeout(() => {
          channel.timer = null
          startFriendSource(channel)
        }, friend.initialDelayMs)
      })
    },
    updateListener(position) {
      listenerPosition = { ...position }
      if (mode === 'spatial') syncDistanceGains()
    },
    playPlaylist(friendId) {
      stopSpatial()
      stopPlaylist()
      mode = 'playlist'
      const source = context.createBufferSource()
      const gain = context.createGain()
      gain.gain.value = audioConfig.nearGain
      source.buffer = soundBank.getBuffer(friendId)
      source.connect(gain)
      gain.connect(master)
      source.onended = () => {
        if (playlistSource !== source) return
        playlistSource = null
        source.disconnect()
        gain.disconnect()
        playlistGain = null
        onSpeakingChange(friendId, false)
      }
      playlistSource = source
      playlistGain = gain
      onSpeakingChange(friendId, true)
      source.start()
    },
    stopAll() {
      stopSpatial()
      stopPlaylist()
      mode = 'idle'
    },
    getMode: () => mode,
    destroy() {
      this.stopAll()
      master.disconnect()
    },
  }
}
