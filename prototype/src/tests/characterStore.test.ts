import { describe, expect, it } from 'vitest'
import { createCharacterStore } from '../characters/characterStore'

const spawnPoints = [
  { id: 'one', position: { x: 100, y: 100 } },
  { id: 'two', position: { x: 200, y: 100 } },
  { id: 'three', position: { x: 300, y: 100 } },
  { id: 'four', position: { x: 400, y: 100 } },
]

const createStore = (capacity = 4) => {
  let nextId = 0
  return createCharacterStore({
    capacity,
    spawnPoints,
    avatarIds: ['warm', 'mist'],
    isSpawnPointLegal: (point) => point.y === 100,
    createId: () => `test-character-${++nextId}`,
  })
}

const completeDraft = (
  store: ReturnType<typeof createStore>,
  name: string,
  avatarId = 'warm',
) => {
  store.startDraft()
  store.updateDraftIdentity(name, avatarId)
  store.setDraftSound({ id: `placeholder-${name}`, source: 'stage-3-placeholder' })
  return store.commitDraft()
}

describe('character store draft and active states', () => {
  it('keeps a draft outside active capacity and spawn allocation until commit', () => {
    const store = createStore()

    store.startDraft()
    store.updateDraftIdentity('小木', 'warm')

    const drafting = store.getSnapshot()
    expect(drafting.draft?.name).toBe('小木')
    expect(drafting.activeCharacters).toHaveLength(0)
    expect(drafting.currentCharacterId).toBeNull()

    store.setDraftSound({ id: 'placeholder', source: 'stage-3-placeholder' })
    const created = store.commitDraft()
    expect(created.spawnPointId).toBe('one')
    expect(store.getSnapshot().draft).toBeNull()
    expect(store.getSnapshot().activeCharacters).toHaveLength(1)
    expect(store.getSnapshot().currentCharacterId).toBe(created.id)
  })

  it('does not allow a soundless draft to become active', () => {
    const store = createStore()
    store.startDraft()
    store.updateDraftIdentity('小木', 'warm')

    expect(() => store.commitDraft()).toThrowError('sound-missing')
    expect(store.getSnapshot().activeCharacters).toHaveLength(0)
  })

  it('releases the draft without consuming capacity or a spawn point', () => {
    const store = createStore(1)
    store.startDraft()
    store.updateDraftIdentity('取消角色', 'mist')
    store.cancelDraft()

    const created = completeDraft(store, '正式角色')
    expect(created.spawnPointId).toBe('one')
    expect(store.getSnapshot().activeCharacters).toHaveLength(1)
  })

  it('allocates unique legal spawn points and enforces capacity', () => {
    const store = createStore(2)
    const first = completeDraft(store, '一号')
    const second = completeDraft(store, '二号', 'mist')

    expect(first.spawnPointId).toBe('one')
    expect(second.spawnPointId).toBe('two')
    expect(() => store.startDraft()).toThrowError('capacity-reached')
  })
})

describe('character switching', () => {
  it('keeps exactly one current character through rapid switches', () => {
    const store = createStore()
    const first = completeDraft(store, '一号')
    const second = completeDraft(store, '二号')
    const third = completeDraft(store, '三号')

    store.switchCurrentCharacter(second.id)
    store.switchCurrentCharacter(third.id)
    const current = store.switchCurrentCharacter(first.id)

    expect(current.id).toBe(first.id)
    expect(store.getSnapshot().currentCharacterId).toBe(first.id)
    expect(store.getSnapshot().activeCharacters).toHaveLength(3)
  })

  it('preserves a character position while switching identity', () => {
    const store = createStore()
    const first = completeDraft(store, '一号')
    const second = completeDraft(store, '二号')

    store.updateCharacterPosition(first.id, { x: 150, y: 100 })
    store.switchCurrentCharacter(second.id)
    store.switchCurrentCharacter(first.id)

    const restored = store.getSnapshot().activeCharacters.find(
      (character) => character.id === first.id,
    )
    expect(restored?.position).toEqual({ x: 150, y: 100 })
  })

  it('rejects switching to an unknown character', () => {
    const store = createStore()
    completeDraft(store, '一号')

    expect(() => store.switchCurrentCharacter('missing')).toThrowError('character-not-found')
  })
})
