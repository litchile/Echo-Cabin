import { gainAtDistance, type ExperienceMode } from '../spatial-prototype/spatialMixer'
import type { PresetSoundBank } from '../spatial-prototype/presetSoundBank'
import type { SpatialPrototypeConfig } from '../spatial-prototype/config'
import type { TinyPlanetFriend } from './config'
import { greatCircleDistance, type Vector3Like } from './sphereMath'

export interface SphereAudioState {
  friendId: TinyPlanetFriend['id']
  distance: number
  gain: number
  speaking: boolean
  active: boolean
}

export type SphereSourceDirections = Partial<
  Record<TinyPlanetFriend['id'], Vector3Like | null>
>

export interface SphereMixer {
  start(listenerDirection: Vector3Like, sources?: SphereSourceDirections): void
  update(listenerDirection: Vector3Like, sources?: SphereSourceDirections): SphereAudioState[]
  stop(): void
  destroy(): void
  getMode(): ExperienceMode
}

interface FriendChannel {
  friend: TinyPlanetFriend
  gain: GainNode
  source: AudioBufferSourceNode | null
  timer: ReturnType<typeof setTimeout> | null
  targetGain: number
  speaking: boolean
}

export function createSphereMixer(
  soundBank: PresetSoundBank,
  friends: readonly TinyPlanetFriend[],
  planetRadius: number,
  audioConfig: SpatialPrototypeConfig['audio'],
  onSpeakingChange: (friendId: TinyPlanetFriend['id'], speaking: boolean) => void,
): SphereMixer {
  const context = soundBank.getContext()
  const master = context.createGain()
  master.gain.value = audioConfig.masterGain
  master.connect(context.destination)
  const channels = new Map<TinyPlanetFriend['id'], FriendChannel>()
  let listenerDirection: Vector3Like = { x: 0, y: 1, z: 0 }
  let sourceDirections: SphereSourceDirections | undefined
  let mode: ExperienceMode = 'idle'

  const resolveSourceDirection = (friend: TinyPlanetFriend): Vector3Like | null => {
    if (sourceDirections === undefined) return friend.surfaceDirection
    return sourceDirections[friend.id] ?? null
  }

  const smoothGain = (param: AudioParam, target: number): void => {
    const now = context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(target, now + audioConfig.smoothingMs / 1000)
  }

  const startSource = (channel: FriendChannel): void => {
    if (mode !== 'spatial' || channel.source) return
    const source = context.createBufferSource()
    source.buffer = soundBank.getBuffer(channel.friend.id)
    source.connect(channel.gain)
    source.onended = () => {
      if (channel.source !== source) return
      channel.source = null
      channel.speaking = false
      source.disconnect()
      onSpeakingChange(channel.friend.id, false)
      if (mode === 'spatial') {
        channel.timer = globalThis.setTimeout(() => {
          channel.timer = null
          startSource(channel)
        }, channel.friend.silenceMs)
      }
    }
    channel.source = source
    channel.speaking = true
    onSpeakingChange(channel.friend.id, true)
    source.start()
  }

  const clear = (): void => {
    channels.forEach((channel) => {
      if (channel.timer !== null) globalThis.clearTimeout(channel.timer)
      if (channel.source) {
        channel.source.onended = null
        try { channel.source.stop() } catch { /* It may already have ended. */ }
        channel.source.disconnect()
      }
      channel.gain.disconnect()
      onSpeakingChange(channel.friend.id, false)
    })
    channels.clear()
  }

  const states = (): SphereAudioState[] => friends.map((friend) => {
    const channel = channels.get(friend.id)
    const sourceDirection = resolveSourceDirection(friend)
    const distance = sourceDirection
      ? greatCircleDistance(listenerDirection, sourceDirection, planetRadius)
      : Number.POSITIVE_INFINITY
    return {
      friendId: friend.id,
      distance,
      gain: channel?.targetGain ?? 0,
      speaking: Boolean(sourceDirection && channel?.speaking),
      active: sourceDirection !== null,
    }
  })

  return {
    start(direction, sources) {
      clear()
      mode = 'spatial'
      listenerDirection = { ...direction }
      sourceDirections = sources
      friends.forEach((friend) => {
        const sourceDirection = resolveSourceDirection(friend)
        const targetGain = sourceDirection
          ? gainAtDistance(
            greatCircleDistance(direction, sourceDirection, planetRadius),
            audioConfig,
          )
          : 0
        const gain = context.createGain()
        gain.gain.value = targetGain
        gain.connect(master)
        const channel: FriendChannel = {
          friend,
          gain,
          source: null,
          timer: null,
          targetGain,
          speaking: false,
        }
        channels.set(friend.id, channel)
        channel.timer = globalThis.setTimeout(() => {
          channel.timer = null
          startSource(channel)
        }, friend.initialDelayMs)
      })
    },
    update(direction, sources) {
      listenerDirection = { ...direction }
      if (sources !== undefined) sourceDirections = sources
      if (mode !== 'spatial') return states()
      channels.forEach((channel) => {
        const sourceDirection = resolveSourceDirection(channel.friend)
        const targetGain = sourceDirection
          ? gainAtDistance(
            greatCircleDistance(direction, sourceDirection, planetRadius),
            audioConfig,
          )
          : 0
        if (Math.abs(targetGain - channel.targetGain) < 0.0005) return
        channel.targetGain = targetGain
        smoothGain(channel.gain.gain, targetGain)
      })
      return states()
    },
    stop() {
      clear()
      mode = 'idle'
    },
    destroy() {
      this.stop()
      master.disconnect()
    },
    getMode: () => mode,
  }
}
