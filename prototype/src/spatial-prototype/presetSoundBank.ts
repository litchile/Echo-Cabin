import type { FriendDefinition } from './config'

export interface PresetSoundBank {
  initialize(): Promise<void>
  getContext(): AudioContext
  getBuffer(friendId: FriendDefinition['id']): AudioBuffer
  destroy(): Promise<void>
}

const getAudioContextConstructor = (): typeof AudioContext | undefined => {
  const browserWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? browserWindow.webkitAudioContext
}

export function createPresetSoundBank(friends: readonly FriendDefinition[]): PresetSoundBank {
  let context: AudioContext | null = null
  let loading: Promise<void> | null = null
  const buffers = new Map<FriendDefinition['id'], AudioBuffer>()

  const ensureContext = async (): Promise<AudioContext> => {
    if (!context) {
      const AudioContextConstructor = getAudioContextConstructor()
      if (!AudioContextConstructor) throw new Error('当前浏览器不支持 Web Audio API。')
      context = new AudioContextConstructor()
    }
    if (context.state === 'suspended') await context.resume()
    return context
  }

  return {
    async initialize() {
      if (loading) return loading
      loading = (async () => {
        const audioContext = await ensureContext()
        await Promise.all(friends.map(async (friend) => {
          const response = await fetch(friend.audioUrl)
          if (!response.ok) throw new Error(`无法读取 ${friend.name} 的测试声音。`)
          const buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
          if (buffer.duration < 1.8 || buffer.duration > 4.5) {
            throw new Error(`${friend.name} 的声音长度应接近 2—4 秒。`)
          }
          buffers.set(friend.id, buffer)
        }))
      })().catch((error: unknown) => {
        loading = null
        throw error
      })
      return loading
    },
    getContext() {
      if (!context) throw new Error('声音库尚未初始化。')
      return context
    },
    getBuffer(friendId) {
      const buffer = buffers.get(friendId)
      if (!buffer) throw new Error(`声音 ${friendId} 尚未加载。`)
      return buffer
    },
    async destroy() {
      buffers.clear()
      loading = null
      if (context && context.state !== 'closed') await context.close()
      context = null
    },
  }
}
