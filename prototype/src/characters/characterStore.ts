import type { Point } from '../core/coordinates'
import {
  type ActiveCharacter,
  type CharacterStateSnapshot,
  type DraftCharacter,
  type SavedCharacterSoundRef,
  type SpawnPoint,
} from './characterTypes'
import { findAvailableSpawnPoint } from './spawnAllocator'

export type CharacterStoreErrorCode =
  | 'capacity-reached'
  | 'draft-already-exists'
  | 'draft-missing'
  | 'identity-incomplete'
  | 'sound-missing'
  | 'spawn-unavailable'
  | 'character-not-found'

export class CharacterStoreError extends Error {
  constructor(readonly code: CharacterStoreErrorCode) {
    super(code)
    this.name = 'CharacterStoreError'
  }
}

export interface CharacterStoreOptions {
  capacity: number
  spawnPoints: readonly SpawnPoint[]
  avatarIds: readonly string[]
  isSpawnPointLegal(point: Point): boolean
  createId?: () => string
}

export interface CharacterStore {
  getSnapshot(): CharacterStateSnapshot
  startDraft(): DraftCharacter
  updateDraftIdentity(name: string, avatarId: string): DraftCharacter
  setDraftSound(soundRef: SavedCharacterSoundRef): DraftCharacter
  commitDraft(): ActiveCharacter
  cancelDraft(): void
  switchCurrentCharacter(characterId: string): ActiveCharacter
  updateCharacterPosition(characterId: string, position: Point): void
}

const cloneSoundRef = (soundRef: SavedCharacterSoundRef): SavedCharacterSoundRef => ({
  ...soundRef,
})

const cloneDraft = (draft: DraftCharacter): DraftCharacter => ({
  ...draft,
  temporarySoundRef: draft.temporarySoundRef
    ? cloneSoundRef(draft.temporarySoundRef)
    : null,
})

const cloneActiveCharacter = (character: ActiveCharacter): ActiveCharacter => ({
  ...character,
  soundRef: cloneSoundRef(character.soundRef),
  position: { ...character.position },
})

export function createCharacterStore(options: CharacterStoreOptions): CharacterStore {
  if (options.capacity <= 0) {
    throw new RangeError('Character capacity must be greater than zero.')
  }

  const knownAvatarIds = new Set(options.avatarIds)
  let draft: DraftCharacter | null = null
  let activeCharacters: ActiveCharacter[] = []
  let currentCharacterId: string | null = null
  let fallbackId = 0

  const createId = options.createId ?? (() => `character-${++fallbackId}`)

  const getSnapshot = (): CharacterStateSnapshot => ({
    draft: draft ? cloneDraft(draft) : null,
    activeCharacters: activeCharacters.map(cloneActiveCharacter),
    currentCharacterId,
    capacity: options.capacity,
  })

  const requireDraft = (): DraftCharacter => {
    if (!draft) {
      throw new CharacterStoreError('draft-missing')
    }
    return draft
  }

  return {
    getSnapshot,
    startDraft() {
      if (draft) {
        throw new CharacterStoreError('draft-already-exists')
      }
      if (activeCharacters.length >= options.capacity) {
        throw new CharacterStoreError('capacity-reached')
      }

      draft = {
        name: '',
        avatarId: options.avatarIds[0] ?? '',
        temporarySoundRef: null,
      }
      return cloneDraft(draft)
    },
    updateDraftIdentity(name, avatarId) {
      const currentDraft = requireDraft()
      const normalizedName = name.trim()
      if (!normalizedName || !knownAvatarIds.has(avatarId)) {
        throw new CharacterStoreError('identity-incomplete')
      }

      draft = {
        ...currentDraft,
        name: normalizedName,
        avatarId,
      }
      return cloneDraft(draft)
    },
    setDraftSound(soundRef) {
      const currentDraft = requireDraft()
      if (!soundRef.id.trim()) {
        throw new CharacterStoreError('sound-missing')
      }

      draft = {
        ...currentDraft,
        temporarySoundRef: cloneSoundRef(soundRef),
      }
      return cloneDraft(draft)
    },
    commitDraft() {
      const currentDraft = requireDraft()
      if (!currentDraft.name.trim() || !knownAvatarIds.has(currentDraft.avatarId)) {
        throw new CharacterStoreError('identity-incomplete')
      }
      if (!currentDraft.temporarySoundRef) {
        throw new CharacterStoreError('sound-missing')
      }
      if (activeCharacters.length >= options.capacity) {
        throw new CharacterStoreError('capacity-reached')
      }

      const spawnPoint = findAvailableSpawnPoint(
        options.spawnPoints,
        activeCharacters,
        options.isSpawnPointLegal,
      )
      if (!spawnPoint) {
        throw new CharacterStoreError('spawn-unavailable')
      }

      const character: ActiveCharacter = {
        id: createId(),
        name: currentDraft.name,
        avatarId: currentDraft.avatarId,
        soundRef: cloneSoundRef(currentDraft.temporarySoundRef),
        spawnPointId: spawnPoint.id,
        position: { ...spawnPoint.position },
      }

      activeCharacters = [...activeCharacters, character]
      currentCharacterId ??= character.id
      draft = null
      return cloneActiveCharacter(character)
    },
    cancelDraft() {
      draft = null
    },
    switchCurrentCharacter(characterId) {
      const character = activeCharacters.find((candidate) => candidate.id === characterId)
      if (!character) {
        throw new CharacterStoreError('character-not-found')
      }
      currentCharacterId = character.id
      return cloneActiveCharacter(character)
    },
    updateCharacterPosition(characterId, position) {
      const index = activeCharacters.findIndex((character) => character.id === characterId)
      if (index < 0) {
        throw new CharacterStoreError('character-not-found')
      }
      activeCharacters = activeCharacters.map((character, characterIndex) =>
        characterIndex === index
          ? { ...character, position: { ...position } }
          : character,
      )
    },
  }
}
