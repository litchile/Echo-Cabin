import type { ActiveCharacter, SpawnPoint } from './characterTypes'

export function findAvailableSpawnPoint(
  spawnPoints: readonly SpawnPoint[],
  activeCharacters: readonly ActiveCharacter[],
  isPointLegal: (point: SpawnPoint['position']) => boolean,
): SpawnPoint | null {
  const occupiedSpawnPointIds = new Set(
    activeCharacters.map((character) => character.spawnPointId),
  )

  const available = spawnPoints.find(
    (spawnPoint) =>
      !occupiedSpawnPointIds.has(spawnPoint.id) && isPointLegal(spawnPoint.position),
  )

  return available
    ? { id: available.id, position: { ...available.position } }
    : null
}
