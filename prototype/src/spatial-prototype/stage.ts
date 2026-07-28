import { pageToWorld, WORLD_HEIGHT, WORLD_WIDTH, type Point } from '../core/coordinates'
import type { FriendDefinition, SpatialPrototypeConfig } from './config'

export interface PrototypeStage {
  element: HTMLElement
  setPlayerPosition(position: Point): void
  setPlayerFacing(imageUrl: string, mirrored: boolean): void
  setTarget(position: Point | null): void
  setFriendSpeaking(friendId: FriendDefinition['id'], speaking: boolean): void
  onGroundTap(handler: (position: Point) => void): void
  destroy(): void
}

const setWorldPosition = (element: HTMLElement, point: Point): void => {
  element.style.left = `${(point.x / WORLD_WIDTH) * 100}%`
  element.style.top = `${(point.y / WORLD_HEIGHT) * 100}%`
  element.style.zIndex = String(Math.round(point.y))
}

const createFriendActor = (friend: FriendDefinition): HTMLDivElement => {
  const actor = document.createElement('div')
  actor.className = 'sound-friend'
  actor.dataset.friendId = friend.id
  actor.dataset.accessory = friend.accessory
  actor.style.setProperty('--friend-color', friend.color)
  actor.style.setProperty('--friend-color-soft', friend.colorSoft)
  actor.innerHTML = `
    <span class="sound-friend__pulse" aria-hidden="true"></span>
    <span class="sound-friend__body"><span class="sound-friend__face">${friend.monogram}</span></span>
    <span class="sound-friend__accessory" aria-hidden="true"></span>
    <strong class="sound-friend__name">${friend.name}</strong>
  `
  actor.setAttribute('aria-label', `固定声音角色：${friend.name}`)
  setWorldPosition(actor, friend.position)
  return actor
}

export function createPrototypeStage(
  config: SpatialPrototypeConfig,
  debugSoundRanges: boolean,
): PrototypeStage {
  const element = document.createElement('section')
  element.className = 'sound-stage'
  element.setAttribute('aria-label', '空间声音移动测试场景')

  const atmosphere = document.createElement('div')
  atmosphere.className = 'sound-stage__atmosphere'
  const ground = document.createElement('div')
  ground.className = 'sound-stage__ground'
  const world = document.createElement('div')
  world.className = 'sound-stage__world'

  const quietHint = document.createElement('span')
  quietHint.className = 'sound-stage__quiet-hint'
  quietHint.textContent = '从这里出发'
  quietHint.setAttribute('aria-hidden', 'true')

  const friendElements = new Map<FriendDefinition['id'], HTMLDivElement>()
  config.friends.forEach((friend) => {
    if (debugSoundRanges) {
      const range = document.createElement('span')
      range.className = 'sound-stage__debug-range'
      range.style.width = `${(config.audio.maxHearingDistance * 2 / WORLD_WIDTH) * 100}%`
      range.style.aspectRatio = '1'
      range.style.setProperty('--range-color', friend.color)
      setWorldPosition(range, friend.position)
      world.append(range)
    }
    const actor = createFriendActor(friend)
    friendElements.set(friend.id, actor)
    world.append(actor)
  })

  const player = document.createElement('div')
  player.className = 'sound-player'
  player.innerHTML = `
    <span class="sound-player__you">你</span>
    <span class="sound-player__shadow" aria-hidden="true"></span>
    <img class="sound-player__image" alt="你的可控角色" draggable="false" />
  `
  const playerImage = player.querySelector<HTMLImageElement>('.sound-player__image')!
  playerImage.src = config.player.facingSprites.front
  setWorldPosition(player, config.player.initialPosition)

  const target = document.createElement('span')
  target.className = 'sound-stage__target'
  target.hidden = true
  target.setAttribute('aria-hidden', 'true')

  world.append(quietHint, player, target)
  element.append(atmosphere, ground, world)

  let tapHandler: ((position: Point) => void) | null = null
  let pointerStart: { id: number; x: number; y: number } | null = null

  const handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }
  const handlePointerUp = (event: PointerEvent): void => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
    pointerStart = null
    if (distance > 12) return
    const point = pageToWorld(
      { x: event.clientX, y: event.clientY },
      element.getBoundingClientRect(),
    )
    if (point) tapHandler?.(point)
  }
  const clearPointer = (): void => { pointerStart = null }
  const preventContextMenu = (event: Event): void => event.preventDefault()

  element.addEventListener('pointerdown', handlePointerDown)
  element.addEventListener('pointerup', handlePointerUp)
  element.addEventListener('pointercancel', clearPointer)
  element.addEventListener('contextmenu', preventContextMenu)

  return {
    element,
    setPlayerPosition(position) {
      setWorldPosition(player, position)
      player.dataset.moving = 'true'
    },
    setPlayerFacing(imageUrl, mirrored) {
      playerImage.src = imageUrl
      playerImage.dataset.mirrored = String(mirrored)
    },
    setTarget(position) {
      target.hidden = position === null
      if (position) setWorldPosition(target, position)
      if (!position) player.dataset.moving = 'false'
    },
    setFriendSpeaking(friendId, speaking) {
      const actor = friendElements.get(friendId)
      if (actor) actor.dataset.speaking = String(speaking)
    },
    onGroundTap(handler) { tapHandler = handler },
    destroy() {
      tapHandler = null
      element.removeEventListener('pointerdown', handlePointerDown)
      element.removeEventListener('pointerup', handlePointerUp)
      element.removeEventListener('pointercancel', clearPointer)
      element.removeEventListener('contextmenu', preventContextMenu)
    },
  }
}
