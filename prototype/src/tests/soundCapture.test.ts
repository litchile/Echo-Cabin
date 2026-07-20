import { describe, expect, it } from 'vitest'
import {
  MAX_IMPORT_BYTES,
  chooseRecorderMimeType,
  isLikelyAudioFile,
} from '../audio/soundCapture'

describe('sound capture capability helpers', () => {
  it('chooses the first supported recorder format', () => {
    expect(chooseRecorderMimeType((type) => type === 'audio/mp4;codecs=mp4a.40.2'))
      .toBe('audio/mp4;codecs=mp4a.40.2')
    expect(chooseRecorderMimeType(() => false)).toBeUndefined()
  })

  it('accepts common audio MIME types and extension fallbacks', () => {
    expect(isLikelyAudioFile({ name: 'voice.bin', type: 'audio/mpeg', size: 1024 })).toBe(true)
    expect(isLikelyAudioFile({ name: 'voice.m4a', type: '', size: 1024 })).toBe(true)
  })

  it('rejects empty, oversized, and unrelated files', () => {
    expect(isLikelyAudioFile({ name: 'empty.mp3', type: 'audio/mpeg', size: 0 })).toBe(false)
    expect(isLikelyAudioFile({ name: 'huge.mp3', type: 'audio/mpeg', size: MAX_IMPORT_BYTES + 1 })).toBe(false)
    expect(isLikelyAudioFile({ name: 'notes.txt', type: 'text/plain', size: 1024 })).toBe(false)
  })
})
