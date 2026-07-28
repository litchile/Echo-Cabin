import type { CharacterStateSnapshot } from '../characters/characterTypes'
import type { Point } from '../core/coordinates'
import type { SoundCaptureService } from './soundCapture'

export interface SpatialAudioConfig {
  selfGain: number
  otherCharacterMaxGain: number
  clearDistance: number
  maxHearingDistance: number
  smoothingMs: number
  characterBusGain: number
  masterGain: number
  theoreticalPeakCeiling: number
  playbackIntervalMs: number
}

export interface CharacterMixState {
  characterId: string
  isCurrent: boolean
  distance: number
  targetGain: number
}

export interface SpatialMixSnapshot {
  initialized: boolean
  characterBusGain: number
  theoreticalPeak: number
  characters: CharacterMixState[]
}

export interface SpatialAudioEngine {
  initialize(): Promise<void>
  isInitialized(): boolean
  isRunning(): boolean
  sync(snapshot: CharacterStateSnapshot): SpatialMixSnapshot
  startAll(): Promise<number>
  stopAll(): void
  getMixSnapshot(): SpatialMixSnapshot
  destroy(): void
}

interface CharacterChannel {
  gain: GainNode
  source: AudioBufferSourceNode | null
  restartTimer: ReturnType<typeof setTimeout> | null
  soundId: string
  targetGain: number
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

export const distanceBetweenPoints = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

export const calculateDistanceGain = (
  distance: number,
  config: Pick<SpatialAudioConfig, 'clearDistance' | 'maxHearingDistance' | 'otherCharacterMaxGain'>,
): number => {
  if (distance <= config.clearDistance) return config.otherCharacterMaxGain
  if (distance >= config.maxHearingDistance) return 0

  const t = clamp(
    (distance - config.clearDistance) /
      (config.maxHearingDistance - config.clearDistance),
    0,
    1,
  )
  const smoothstep = t * t * (3 - 2 * t)
  return config.otherCharacterMaxGain * (1 - smoothstep)
}

export const calculateSafeCharacterBusGain = (
  characterCount: number,
  config: Pick<
    SpatialAudioConfig,
    'selfGain' | 'otherCharacterMaxGain' | 'characterBusGain' | 'theoreticalPeakCeiling'
  >,
): number => {
  if (characterCount <= 0) return config.characterBusGain
  const theoreticalInput =
    config.selfGain + Math.max(0, characterCount - 1) * config.otherCharacterMaxGain
  if (theoreticalInput <= 0) return config.characterBusGain
  return Math.min(config.characterBusGain, config.theoreticalPeakCeiling / theoreticalInput)
}

const emptyMixSnapshot = (config: SpatialAudioConfig): SpatialMixSnapshot => ({
  initialized: false,
  characterBusGain: config.characterBusGain,
  theoreticalPeak: 0,
  characters: [],
})

export function createSpatialAudioEngine(
  sounds: SoundCaptureService,
  config: SpatialAudioConfig,
): SpatialAudioEngine {
  let context: AudioContext | null = null
  let characterBus: GainNode | null = null
  let master: GainNode | null = null
  let characterBusTarget = 0
  let latestState: CharacterStateSnapshot | null = null
  let running = false
  let mixSnapshot = emptyMixSnapshot(config)
  const channels = new Map<string, CharacterChannel>()

  const smoothGain = (gain: AudioParam, target: number): void => {
    if (!context) return
    const now = context.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(target, now + config.smoothingMs / 1000)
  }

  const clearChannelTimer = (channel: CharacterChannel): void => {
    if (channel.restartTimer === null) return
    globalThis.clearTimeout(channel.restartTimer)
    channel.restartTimer = null
  }

  const stopChannelSource = (channel: CharacterChannel): void => {
    clearChannelTimer(channel)
    if (!channel.source) return
    const source = channel.source
    channel.source = null
    try {
      source.stop()
    } catch {
      // It may already have ended between the state check and stop call.
    }
    source.disconnect()
  }

  const ensureChannel = (characterId: string, soundId: string): CharacterChannel => {
    const existing = channels.get(characterId)
    if (existing) {
      if (existing.soundId !== soundId) stopChannelSource(existing)
      existing.soundId = soundId
      return existing
    }
    if (!context || !characterBus) {
      throw new Error('Spatial audio must be initialized before channels are created.')
    }
    const gain = context.createGain()
    gain.gain.value = 0
    gain.connect(characterBus)
    const channel: CharacterChannel = {
      gain,
      source: null,
      restartTimer: null,
      soundId,
      targetGain: 0,
    }
    channels.set(characterId, channel)
    return channel
  }

  const startChannel = (channel: CharacterChannel): boolean => {
    if (!context || channel.source) return false
    clearChannelTimer(channel)
    const buffer = sounds.getAudioBuffer(channel.soundId)
    if (!buffer) return false
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = false
    source.connect(channel.gain)
    source.addEventListener('ended', () => {
      if (channel.source !== source) {
        source.disconnect()
        return
      }
      channel.source = null
      source.disconnect()
      if (running) {
        channel.restartTimer = globalThis.setTimeout(() => {
          channel.restartTimer = null
          if (running) startChannel(channel)
        }, config.playbackIntervalMs)
      }
    }, { once: true })
    channel.source = source
    source.start()
    return true
  }

  const syncInitializedGraph = (snapshot: CharacterStateSnapshot): SpatialMixSnapshot => {
    if (!context || !characterBus) return mixSnapshot

    const activeIds = new Set(snapshot.activeCharacters.map((character) => character.id))
    channels.forEach((channel, characterId) => {
      if (activeIds.has(characterId)) return
      stopChannelSource(channel)
      channel.gain.disconnect()
      channels.delete(characterId)
    })

    const current = snapshot.activeCharacters.find(
      (character) => character.id === snapshot.currentCharacterId,
    )
    const characters = snapshot.activeCharacters.map<CharacterMixState>((character) => {
      const isCurrent = character.id === snapshot.currentCharacterId
      const distance = current ? distanceBetweenPoints(current.position, character.position) : 0
      const targetGain = isCurrent
        ? config.selfGain
        : current
          ? calculateDistanceGain(distance, config)
          : 0
      const channel = ensureChannel(character.id, character.soundRef.id)
      if (running && !channel.source && channel.restartTimer === null) startChannel(channel)
      if (Math.abs(channel.targetGain - targetGain) > 0.0005) {
        channel.targetGain = targetGain
        smoothGain(channel.gain.gain, targetGain)
      }
      return { characterId: character.id, isCurrent, distance, targetGain }
    })

    const characterBusGain = calculateSafeCharacterBusGain(characters.length, config)
    if (Math.abs(characterBusTarget - characterBusGain) > 0.0005) {
      characterBusTarget = characterBusGain
      smoothGain(characterBus.gain, characterBusGain)
    }
    const theoreticalInput = characters.reduce((sum, character) => sum + character.targetGain, 0)
    mixSnapshot = {
      initialized: true,
      characterBusGain,
      theoreticalPeak: theoreticalInput * characterBusGain * config.masterGain,
      characters,
    }
    return mixSnapshot
  }

  sounds.setBeforePreview(() => {
    running = false
    channels.forEach(stopChannelSource)
  })

  return {
    async initialize() {
      if (context) {
        if (context.state === 'suspended') await context.resume()
        return
      }
      context = await sounds.ensureAudioReady()
      characterBus = context.createGain()
      master = context.createGain()
      characterBus.gain.value = 0
      characterBusTarget = 0
      master.gain.value = config.masterGain
      characterBus.connect(master)
      master.connect(context.destination)
      if (latestState) syncInitializedGraph(latestState)
    },

    isInitialized: () => context !== null,

    isRunning: () => running,

    sync(snapshot) {
      latestState = snapshot
      if (!context) {
        mixSnapshot = {
          ...emptyMixSnapshot(config),
          characters: snapshot.activeCharacters.map((character) => ({
            characterId: character.id,
            isCurrent: character.id === snapshot.currentCharacterId,
            distance: 0,
            targetGain: 0,
          })),
        }
        return mixSnapshot
      }
      return syncInitializedGraph(snapshot)
    },

    async startAll() {
      await this.initialize()
      if (!context || !latestState) return 0
      sounds.stopPlayback()
      running = false
      channels.forEach(stopChannelSource)
      syncInitializedGraph(latestState)
      running = true
      let played = 0
      for (const channel of channels.values()) {
        if (startChannel(channel)) played += 1
      }
      return played
    },

    stopAll() {
      running = false
      channels.forEach(stopChannelSource)
    },

    getMixSnapshot: () => ({
      ...mixSnapshot,
      characters: mixSnapshot.characters.map((character) => ({ ...character })),
    }),

    destroy() {
      this.stopAll()
      channels.forEach((channel) => channel.gain.disconnect())
      channels.clear()
      characterBus?.disconnect()
      master?.disconnect()
      characterBus = null
      master = null
      context = null
      running = false
      characterBusTarget = 0
      latestState = null
      sounds.setBeforePreview(null)
    },
  }
}
