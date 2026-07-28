import type { TinyPlanetFriend } from '../tiny-planet-prototype/config'
import type { SphereSourceDirections } from '../tiny-planet-prototype/sphereMixer'
import type { NetworkPlayerSnapshot } from './networkClient'

export interface NetworkVoiceBinding {
  userId: 'dev-a' | 'dev-b' | 'dev-c'
  friendId: TinyPlanetFriend['id']
}

export const networkVoiceBindings: readonly NetworkVoiceBinding[] = [
  { userId: 'dev-a', friendId: 'lin' },
  { userId: 'dev-b', friendId: 'momo' },
  { userId: 'dev-c', friendId: 'kai' },
]

export const createNetworkSourceDirections = (
  listenerUserId: string,
  players: readonly NetworkPlayerSnapshot[],
): SphereSourceDirections => {
  const playersById = new Map(players.map((player) => [player.userId, player]))
  return Object.fromEntries(networkVoiceBindings.map((binding) => {
    const player = playersById.get(binding.userId)
    const direction = binding.userId === listenerUserId || !player
      ? null
      : player.direction
    return [binding.friendId, direction]
  })) as SphereSourceDirections
}

export const userIdForVoice = (
  friendId: TinyPlanetFriend['id'],
): NetworkVoiceBinding['userId'] | null =>
  networkVoiceBindings.find((binding) => binding.friendId === friendId)?.userId ?? null
