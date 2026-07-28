import { describe, expect, it, vi } from 'vitest'
import type { SoundCaptureService } from '../audio/soundCapture'
import {
  calculateDistanceGain,
  calculateSafeCharacterBusGain,
  createSpatialAudioEngine,
  type SpatialAudioConfig,
} from '../audio/spatialAudio'
import type { CharacterStateSnapshot } from '../characters/characterTypes'

const config: SpatialAudioConfig = {
  selfGain: 0.20,
  otherCharacterMaxGain: 0.45,
  clearDistance: 80,
  maxHearingDistance: 420,
  smoothingMs: 320,
  characterBusGain: 0.45,
  masterGain: 1,
  theoreticalPeakCeiling: 0.5,
  playbackIntervalMs: 3000,
}

describe('spatial distance gain', () => {
  it('holds full gain through the clear distance and reaches zero at the hearing limit', () => {
    expect(calculateDistanceGain(0, config)).toBe(0.45)
    expect(calculateDistanceGain(80, config)).toBe(0.45)
    expect(calculateDistanceGain(420, config)).toBe(0)
    expect(calculateDistanceGain(800, config)).toBe(0)
  })

  it('uses the frozen smoothstep curve between 80 and 420 world units', () => {
    expect(calculateDistanceGain(250, config)).toBeCloseTo(0.225, 6)
    expect(calculateDistanceGain(165, config)).toBeGreaterThan(calculateDistanceGain(250, config))
    expect(calculateDistanceGain(335, config)).toBeLessThan(calculateDistanceGain(250, config))
  })

  it('keeps three-character output near the configured bus gain and caps four-character peak', () => {
    const threeCharacterGain = calculateSafeCharacterBusGain(3, config)
    const fourCharacterGain = calculateSafeCharacterBusGain(4, config)
    expect(threeCharacterGain).toBe(0.45)
    expect((0.20 + 2 * 0.45) * threeCharacterGain).toBeLessThanOrEqual(0.5)
    expect(fourCharacterGain).toBeCloseTo(0.5 / 1.55, 6)
    expect((0.20 + 3 * 0.45) * fourCharacterGain).toBeCloseTo(0.5, 6)
  })
})

class FakeAudioParam {
  value = 0
  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void { this.value = value }
  linearRampToValueAtTime(value: number): void { this.value = value }
}

class FakeGainNode {
  gain = new FakeAudioParam()
  connect(): void {}
  disconnect(): void {}
}

class FakeSource {
  buffer: AudioBuffer | null = null
  loop = false
  started = false
  stopped = false
  private endedListener: (() => void) | null = null
  connect(): void {}
  disconnect(): void {}
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'ended') return
    this.endedListener = typeof listener === 'function'
      ? () => listener({ type: 'ended' } as Event)
      : () => listener.handleEvent({ type: 'ended' } as Event)
  }
  start(): void { this.started = true }
  stop(): void { this.stopped = true }
  end(): void { this.endedListener?.() }
}

class FakeAudioContext {
  currentTime = 1
  state: AudioContextState = 'running'
  destination = {} as AudioDestinationNode
  gains: FakeGainNode[] = []
  sources: FakeSource[] = []
  createGain(): GainNode {
    const gain = new FakeGainNode()
    this.gains.push(gain)
    return gain as unknown as GainNode
  }
  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource()
    this.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }
  async resume(): Promise<void> {}
}

const makeSnapshot = (): CharacterStateSnapshot => ({
  draft: null,
  capacity: 4,
  currentCharacterId: 'one',
  activeCharacters: [
    {
      id: 'one', name: 'One', avatarId: 'default', soundRef: { id: 'sound-one', source: 'recording' },
      spawnPointId: 'one', position: { x: 100, y: 100 },
    },
    {
      id: 'two', name: 'Two', avatarId: 'default', soundRef: { id: 'sound-two', source: 'import' },
      spawnPointId: 'two', position: { x: 300, y: 100 },
    },
  ],
})

describe('spatial audio channel lifecycle', () => {
  it('keeps one gain channel per character while creating a fresh source for every playback', async () => {
    const context = new FakeAudioContext()
    const buffers = new Map<string, AudioBuffer>([
      ['sound-one', { duration: 1 } as AudioBuffer],
      ['sound-two', { duration: 1 } as AudioBuffer],
    ])
    let beforePreview: (() => void) | null = null
    const sounds: SoundCaptureService = {
      isRecordingSupported: () => true,
      ensureAudioReady: async () => context as unknown as AudioContext,
      getAudioBuffer: (soundId) => buffers.get(soundId) ?? null,
      setBeforePreview: (callback) => { beforePreview = callback },
      startRecording: async () => {},
      stopRecording: async () => { throw new Error('not used') },
      cancelRecording: () => {},
      importFile: async () => { throw new Error('not used') },
      play: async () => { beforePreview?.() },
      stopPlayback: () => {},
      release: () => {},
      destroy: () => {},
    }
    const engine = createSpatialAudioEngine(sounds, config)
    engine.sync(makeSnapshot())
    await engine.initialize()

    expect(await engine.startAll()).toBe(2)
    const gainCountAfterFirstPlay = context.gains.length
    expect(await engine.startAll()).toBe(2)

    expect(context.gains.length).toBe(gainCountAfterFirstPlay)
    expect(context.sources).toHaveLength(4)
    expect(new Set(context.sources).size).toBe(4)
    expect(context.sources.every((source) => source.loop)).toBe(false)
    expect(engine.isRunning()).toBe(true)
    expect(engine.getMixSnapshot().characters.find((item) => item.isCurrent)?.targetGain).toBe(0.20)
    expect(engine.getMixSnapshot().characters.find((item) => !item.isCurrent)?.targetGain)
      .toBeCloseTo(calculateDistanceGain(200, config), 6)
  })

  it('waits exactly three seconds after a clip ends before creating the next source', async () => {
    vi.useFakeTimers()
    try {
      const context = new FakeAudioContext()
      const buffer = { duration: 1 } as AudioBuffer
      const sounds = {
        isRecordingSupported: () => true,
        ensureAudioReady: async () => context as unknown as AudioContext,
        getAudioBuffer: () => buffer,
        setBeforePreview: () => {},
        startRecording: async () => {},
        stopRecording: async () => { throw new Error('not used') },
        cancelRecording: () => {},
        importFile: async () => { throw new Error('not used') },
        play: async () => {},
        stopPlayback: () => {},
        release: () => {},
        destroy: () => {},
      } as SoundCaptureService
      const snapshot = makeSnapshot()
      snapshot.activeCharacters = [snapshot.activeCharacters[0]]
      const engine = createSpatialAudioEngine(sounds, config)
      engine.sync(snapshot)
      await engine.initialize()
      await engine.startAll()

      expect(context.sources).toHaveLength(1)
      context.sources[0].end()
      await vi.advanceTimersByTimeAsync(2999)
      expect(context.sources).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(context.sources).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the same source and three-second timer while positions are updated', async () => {
    vi.useFakeTimers()
    try {
      const context = new FakeAudioContext()
      const buffers = new Map<string, AudioBuffer>([
        ['sound-one', { duration: 1 } as AudioBuffer],
        ['sound-two', { duration: 1 } as AudioBuffer],
      ])
      const sounds = {
        isRecordingSupported: () => true,
        ensureAudioReady: async () => context as unknown as AudioContext,
        getAudioBuffer: (soundId: string) => buffers.get(soundId) ?? null,
        setBeforePreview: () => {},
        startRecording: async () => {},
        stopRecording: async () => { throw new Error('not used') },
        cancelRecording: () => {},
        importFile: async () => { throw new Error('not used') },
        play: async () => {},
        stopPlayback: () => {},
        release: () => {},
        destroy: () => {},
      } as SoundCaptureService
      const snapshot = makeSnapshot()
      const engine = createSpatialAudioEngine(sounds, config)
      engine.sync(snapshot)
      await engine.initialize()
      await engine.startAll()
      const firstSource = context.sources[0]

      firstSource.end()
      snapshot.activeCharacters[0].position = { x: 180, y: 100 }
      engine.sync(snapshot)
      expect(context.sources).toHaveLength(2)
      expect(firstSource.stopped).toBe(false)

      await vi.advanceTimersByTimeAsync(2999)
      expect(context.sources).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(context.sources).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts inaudible distant channels so movement can fade them in later', async () => {
    const context = new FakeAudioContext()
    const buffers = new Map<string, AudioBuffer>([
      ['sound-one', { duration: 1 } as AudioBuffer],
      ['sound-two', { duration: 1 } as AudioBuffer],
    ])
    const sounds = {
      isRecordingSupported: () => true,
      ensureAudioReady: async () => context as unknown as AudioContext,
      getAudioBuffer: (soundId: string) => buffers.get(soundId) ?? null,
      setBeforePreview: () => {},
      startRecording: async () => {},
      stopRecording: async () => { throw new Error('not used') },
      cancelRecording: () => {},
      importFile: async () => { throw new Error('not used') },
      play: async () => {},
      stopPlayback: () => {},
      release: () => {},
      destroy: () => {},
    } as SoundCaptureService
    const snapshot = makeSnapshot()
    snapshot.activeCharacters[1].position = { x: 900, y: 100 }
    const engine = createSpatialAudioEngine(sounds, config)
    engine.sync(snapshot)
    await engine.initialize()

    expect(await engine.startAll()).toBe(2)
    expect(engine.getMixSnapshot().characters[1].targetGain).toBe(0)
  })
})
