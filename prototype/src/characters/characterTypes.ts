import type { Point } from '../core/coordinates'

export interface CharacterAvatarPreset {
  id: string
  label: string
  imageUrl: string
}

export interface SavedCharacterSoundRef {
  id: string
  source: 'recording' | 'import'
}

export interface DraftCharacter {
  name: string
  avatarId: string
  temporarySoundRef: SavedCharacterSoundRef | null
}

export interface SpawnPoint {
  id: string
  position: Point
}

export interface ActiveCharacter {
  id: string
  name: string
  avatarId: string
  soundRef: SavedCharacterSoundRef
  spawnPointId: string
  position: Point
}

export interface CharacterStateSnapshot {
  draft: DraftCharacter | null
  activeCharacters: ActiveCharacter[]
  currentCharacterId: string | null
  capacity: number
}
