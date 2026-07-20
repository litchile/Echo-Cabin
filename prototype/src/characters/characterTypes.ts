import type { Point } from '../core/coordinates'

export interface CharacterAvatarPreset {
  id: string
  label: string
}

export interface SavedCharacterSoundRef {
  id: string
  source: 'stage-3-placeholder' | 'recording' | 'import'
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
