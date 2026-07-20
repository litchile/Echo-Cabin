import type { SavedCharacterSoundRef } from '../characters/characterTypes'

export type SoundCaptureErrorCode =
  | 'audio-context-unavailable'
  | 'file-too-large'
  | 'file-unsupported'
  | 'microphone-denied'
  | 'microphone-unavailable'
  | 'recording-cancelled'
  | 'recording-failed'
  | 'recording-unsupported'

export class SoundCaptureError extends Error {
  constructor(readonly code: SoundCaptureErrorCode) {
    super(code)
    this.name = 'SoundCaptureError'
  }
}

export interface SoundAsset {
  ref: SavedCharacterSoundRef
  source: 'recording' | 'import'
  mimeType: string
  durationSeconds: number
  fileName: string | null
}

export interface SoundCaptureService {
  isRecordingSupported(): boolean
  startRecording(): Promise<void>
  stopRecording(): Promise<SoundAsset>
  cancelRecording(): void
  importFile(file: File): Promise<SoundAsset>
  play(soundId: string, onEnded?: () => void): Promise<void>
  stopPlayback(): void
  release(soundId: string): void
  destroy(): void
}

interface StoredSoundAsset extends SoundAsset {
  buffer: AudioBuffer
}

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024

const AUDIO_EXTENSIONS = /\.(aac|flac|m4a|mp3|mp4|oga|ogg|wav|webm)$/i

const hasMediaRecorder = (): boolean =>
  typeof (globalThis as unknown as Record<string, unknown>).MediaRecorder === 'function'

const hasUserMedia = (): boolean =>
  typeof (navigator as unknown as { mediaDevices?: { getUserMedia?: unknown } })
    .mediaDevices?.getUserMedia === 'function'

export const isLikelyAudioFile = (file: Pick<File, 'name' | 'type' | 'size'>): boolean =>
  file.size > 0 &&
  file.size <= MAX_IMPORT_BYTES &&
  (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name))

export const chooseRecorderMimeType = (
  isTypeSupported: (mimeType: string) => boolean,
): string | undefined => [
  'audio/webm;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm',
  'audio/mp4',
].find(isTypeSupported)

const getAudioContextConstructor = (): typeof AudioContext | undefined => {
  const windowWithWebkit = window as typeof window & {
    webkitAudioContext?: typeof AudioContext
  }
  return window.AudioContext ?? windowWithWebkit.webkitAudioContext
}

export function createSoundCaptureService(): SoundCaptureService {
  let audioContext: AudioContext | null = null
  let recorder: MediaRecorder | null = null
  let recordingStream: MediaStream | null = null
  let recordedChunks: Blob[] = []
  let stopResolver: ((asset: SoundAsset) => void) | null = null
  let stopRejecter: ((error: unknown) => void) | null = null
  let discardRecording = false
  let playingSource: AudioBufferSourceNode | null = null
  let soundSequence = 0
  const assets = new Map<string, StoredSoundAsset>()

  const ensureContext = async (): Promise<AudioContext> => {
    if (!audioContext) {
      const AudioContextConstructor = getAudioContextConstructor()
      if (!AudioContextConstructor) {
        throw new SoundCaptureError('audio-context-unavailable')
      }
      audioContext = new AudioContextConstructor()
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    return audioContext
  }

  const stopStream = (): void => {
    recordingStream?.getTracks().forEach((track) => track.stop())
    recordingStream = null
  }

  const createAsset = async (
    blob: Blob,
    source: 'recording' | 'import',
    fileName: string | null,
  ): Promise<SoundAsset> => {
    const context = await ensureContext()
    let buffer: AudioBuffer
    try {
      buffer = await context.decodeAudioData(await blob.arrayBuffer())
    } catch {
      throw new SoundCaptureError('file-unsupported')
    }
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
      throw new SoundCaptureError('file-unsupported')
    }

    const id = `sound-${Date.now()}-${++soundSequence}`
    const asset: StoredSoundAsset = {
      ref: { id, source },
      source,
      mimeType: blob.type || 'audio/*',
      durationSeconds: buffer.duration,
      fileName,
      buffer,
    }
    assets.set(id, asset)
    return { ...asset, ref: { ...asset.ref } }
  }

  const finalizeRecording = async (): Promise<void> => {
    const resolve = stopResolver
    const reject = stopRejecter
    const chunks = recordedChunks
    const mimeType = recorder?.mimeType || chunks[0]?.type || 'audio/webm'
    stopResolver = null
    stopRejecter = null
    recorder = null
    recordedChunks = []
    stopStream()

    if (discardRecording) {
      discardRecording = false
      reject?.(new SoundCaptureError('recording-cancelled'))
      return
    }
    try {
      resolve?.(await createAsset(new Blob(chunks, { type: mimeType }), 'recording', null))
    } catch (error) {
      reject?.(error)
    }
  }

  return {
    isRecordingSupported: () => hasUserMedia() && hasMediaRecorder(),

    async startRecording() {
      if (!hasUserMedia() || !hasMediaRecorder()) {
        throw new SoundCaptureError('recording-unsupported')
      }
      await ensureContext()
      try {
        recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (error) {
        const domError = error as DOMException
        if (domError.name === 'NotAllowedError' || domError.name === 'SecurityError') {
          throw new SoundCaptureError('microphone-denied')
        }
        if (domError.name === 'NotFoundError' || domError.name === 'DevicesNotFoundError') {
          throw new SoundCaptureError('microphone-unavailable')
        }
        throw new SoundCaptureError('recording-failed')
      }

      recordedChunks = []
      discardRecording = false
      const mimeType = chooseRecorderMimeType(MediaRecorder.isTypeSupported)
      recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType })
        : new MediaRecorder(recordingStream)
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data)
      })
      recorder.addEventListener('stop', () => void finalizeRecording(), { once: true })
      recorder.start()
    },

    stopRecording() {
      if (!recorder || recorder.state === 'inactive') {
        return Promise.reject(new SoundCaptureError('recording-failed'))
      }
      return new Promise<SoundAsset>((resolve, reject) => {
        stopResolver = resolve
        stopRejecter = reject
        recorder?.stop()
      })
    },

    cancelRecording() {
      discardRecording = true
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      } else {
        stopStream()
      }
    },

    async importFile(file) {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new SoundCaptureError('file-too-large')
      }
      if (!isLikelyAudioFile(file)) {
        throw new SoundCaptureError('file-unsupported')
      }
      return createAsset(file, 'import', file.name)
    },

    async play(soundId, onEnded) {
      const asset = assets.get(soundId)
      if (!asset) throw new SoundCaptureError('file-unsupported')
      const context = await ensureContext()
      this.stopPlayback()
      const source = context.createBufferSource()
      source.buffer = asset.buffer
      source.connect(context.destination)
      source.addEventListener('ended', () => {
        if (playingSource === source) playingSource = null
        onEnded?.()
      }, { once: true })
      playingSource = source
      source.start()
    },

    stopPlayback() {
      if (!playingSource) return
      try {
        playingSource.stop()
      } catch {
        // The source may already have ended between the check and stop call.
      }
      playingSource.disconnect()
      playingSource = null
    },

    release(soundId) {
      assets.delete(soundId)
    },

    destroy() {
      this.cancelRecording()
      this.stopPlayback()
      assets.clear()
      void audioContext?.close()
      audioContext = null
    },
  }
}
