import * as THREE from 'three'
import type { TinyPlanetConfig, TinyPlanetFriend } from './config'
import {
  createContinuousMoveTarget,
  rotateTangentAroundSurfaceNormal,
} from './continuousMovement'
import {
  angleBetweenUnitVectors,
  normalizeVector,
  rotateSurfaceDirectionToward,
  type Vector3Like,
} from './sphereMath'

export interface TinyPlanetStage {
  start(): void
  setSpeaking(friendId: TinyPlanetFriend['id'], speaking: boolean): void
  setDebugVisible(visible: boolean): void
  setAuthoritativePlayerDirection(
    direction: Vector3Like,
    moving: boolean,
    preserveLocalPrediction?: boolean,
  ): void
  upsertRemotePlayer(userId: string, direction: Vector3Like): void
  removeRemotePlayer(userId: string): void
  setRemotePlayerSpeaking(userId: string, speaking: boolean): void
  setContinuousInput(horizontalAxis: number, verticalAxis: number): void
  getPlayerDirection(): Vector3Like
  destroy(): void
}

export interface TinyPlanetStageOptions {
  onMoveTarget?: (direction: Vector3Like) => void
  onMoveCancel?: () => void
  inputMode?: 'click' | 'wasd' | 'joystick'
  showFixedFriends?: boolean
}

interface FriendVisual {
  group: THREE.Group
  pulse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  speaking: boolean
}

interface RemotePlayerVisual {
  group: THREE.Group
  pulse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  direction: Vector3Like
  targetDirection: Vector3Like
  forward: Vector3Like
  speaking: boolean
}

const toThreeVector = (value: Vector3Like): THREE.Vector3 =>
  new THREE.Vector3(value.x, value.y, value.z).normalize()

const createTextSprite = (text: string, color: string): THREE.Sprite => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(13, 20, 30, 0.78)'
    context.beginPath()
    context.roundRect(16, 12, 224, 68, 24)
    context.fill()
    context.font = '600 34px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = color
    context.fillText(text, 128, 47)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  }))
  sprite.scale.set(1.6, 0.6, 1)
  sprite.position.y = 1.72
  return sprite
}

const placeOnSphere = (
  object: THREE.Object3D,
  directionValue: Vector3Like,
  radius: number,
): void => {
  const direction = toThreeVector(directionValue)
  object.position.copy(direction.multiplyScalar(radius))
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    toThreeVector(directionValue),
  )
}

const tangentToward = (
  fromValue: Vector3Like,
  toValue: Vector3Like,
  fallbackValue: Vector3Like,
): Vector3Like => {
  const from = toThreeVector(fromValue)
  const to = toThreeVector(toValue)
  const tangent = to.addScaledVector(from, -to.dot(from))
  if (tangent.lengthSq() < 1e-6) {
    const fallback = toThreeVector(fallbackValue)
      .addScaledVector(from, -toThreeVector(fallbackValue).dot(from))
    if (fallback.lengthSq() >= 1e-6) return normalizeVector(fallback)
    const helper = Math.abs(from.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1)
    return normalizeVector(new THREE.Vector3().crossVectors(helper, from))
  }
  return normalizeVector(tangent)
}

const orientActorOnSphere = (
  object: THREE.Object3D,
  directionValue: Vector3Like,
  forwardValue: Vector3Like,
  radius: number,
): void => {
  const up = toThreeVector(directionValue)
  const forward = toThreeVector(forwardValue)
    .addScaledVector(up, -toThreeVector(forwardValue).dot(up))
  if (forward.lengthSq() < 1e-6) {
    placeOnSphere(object, directionValue, radius)
    return
  }
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(up, forward).normalize()
  const rotation = new THREE.Matrix4().makeBasis(right, up, forward)
  object.position.copy(up).multiplyScalar(radius)
  object.quaternion.setFromRotationMatrix(rotation)
}

const createSurfaceRing = (
  centerValue: Vector3Like,
  angularRadius: number,
  planetRadius: number,
  color: string,
  opacity: number,
): THREE.LineLoop => {
  const center = toThreeVector(centerValue)
  const helper = Math.abs(center.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const firstTangent = new THREE.Vector3().crossVectors(center, helper).normalize()
  const secondTangent = new THREE.Vector3().crossVectors(center, firstTangent).normalize()
  const points: THREE.Vector3[] = []
  for (let index = 0; index < 96; index += 1) {
    const angle = index / 96 * Math.PI * 2
    points.push(new THREE.Vector3()
      .copy(center)
      .multiplyScalar(Math.cos(angularRadius))
      .addScaledVector(firstTangent, Math.sin(angularRadius) * Math.cos(angle))
      .addScaledVector(secondTangent, Math.sin(angularRadius) * Math.sin(angle))
      .multiplyScalar(planetRadius + 0.025))
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
}

export function createTinyPlanetStage(
  container: HTMLElement,
  config: TinyPlanetConfig,
  onPlayerMove: (direction: Vector3Like, moving: boolean) => void,
  options: TinyPlanetStageOptions = {},
): TinyPlanetStage {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#091522')
  scene.fog = new THREE.FogExp2('#091522', 0.022)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.append(renderer.domElement)

  scene.add(new THREE.HemisphereLight('#bfdcff', '#172416', 2.2))
  const sun = new THREE.DirectionalLight('#fff3dc', 2.8)
  sun.position.set(8, 12, 10)
  scene.add(sun)

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(config.radius, 64, 40),
    new THREE.MeshStandardMaterial({
      color: '#47665b',
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    }),
  )
  planet.name = 'walkable-planet'
  scene.add(planet)

  const latitudeLines = new THREE.Group()
  for (const latitude of [-55, -25, 0, 25, 55]) {
    const latitudeRadians = latitude * Math.PI / 180
    const ringRadius = Math.cos(latitudeRadians) * (config.radius + 0.012)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.008, 5, 96),
      new THREE.MeshBasicMaterial({ color: '#90a99d', transparent: true, opacity: 0.13 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = Math.sin(latitudeRadians) * (config.radius + 0.012)
    latitudeLines.add(ring)
  }
  scene.add(latitudeLines)

  const createActorBody = (
    friend?: TinyPlanetFriend,
  ): THREE.Group => {
    const group = new THREE.Group()
    const color = friend?.color ?? '#f6f8ff'
    let geometry: THREE.BufferGeometry
    if (friend?.placeholderShape === 'cone') geometry = new THREE.ConeGeometry(0.34, 0.82, 8)
    else if (friend?.placeholderShape === 'box') geometry = new THREE.BoxGeometry(0.58, 0.72, 0.48)
    else if (friend?.placeholderShape === 'octahedron') geometry = new THREE.OctahedronGeometry(0.45, 0)
    else geometry = new THREE.CapsuleGeometry(0.27, 0.48, 5, 10)
    const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      emissive: new THREE.Color(color),
      emissiveIntensity: friend ? 0.08 : 0.02,
    }))
    body.position.y = 0.48
    group.add(body)
    if (friend) {
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 16, 10),
        new THREE.MeshStandardMaterial({ color: friend.colorSoft, roughness: 0.8 }),
      )
      head.position.y = 1.03
      group.add(head, createTextSprite(friend.name, friend.colorSoft))
    } else {
      const directionMarker = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.35, 6),
        new THREE.MeshBasicMaterial({ color: '#50d7ff' }),
      )
      directionMarker.rotation.x = Math.PI / 2
      directionMarker.position.set(0, 0.72, 0.32)
      group.add(directionMarker)
    }
    return group
  }

  const player = createActorBody()
  scene.add(player)
  const remotePlayerVisuals = new Map<string, RemotePlayerVisual>()
  const remoteColors = ['#ffb38c', '#9fb3ff', '#80dfbd', '#e6b6ff']
  const colorForUser = (userId: string): string => {
    const hash = [...userId].reduce((value, character) => value + character.charCodeAt(0), 0)
    return remoteColors[hash % remoteColors.length]
  }
  const createRemotePlayer = (userId: string): {
    group: THREE.Group
    pulse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  } => {
    const group = createActorBody()
    const color = colorForUser(userId)
    const body = group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    body.material = body.material.clone()
    body.material.color.set(color)
    body.material.emissive.set(color)
    body.material.emissiveIntensity = 0.08
    group.add(createTextSprite(userId, color))
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 20, 12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        wireframe: true,
      }),
    )
    pulse.position.y = 0.65
    group.add(pulse)
    return { group, pulse }
  }
  const friendVisuals = new Map<TinyPlanetFriend['id'], FriendVisual>()
  if (options.showFixedFriends !== false) config.friends.forEach((friend) => {
    const group = createActorBody(friend)
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 20, 12),
      new THREE.MeshBasicMaterial({
        color: friend.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        wireframe: true,
      }),
    )
    pulse.position.y = 0.65
    group.add(pulse)
    placeOnSphere(group, friend.surfaceDirection, config.radius + config.actorHeight)
    scene.add(group)
    friendVisuals.set(friend.id, { group, pulse, speaking: false })
  })

  const debugRings = new THREE.Group()
  if (options.showFixedFriends !== false) config.friends.forEach((friend) => {
    debugRings.add(
      createSurfaceRing(
        friend.surfaceDirection,
        config.audio.clearDistance / config.radius,
        config.radius,
        friend.color,
        0.72,
      ),
      createSurfaceRing(
        friend.surfaceDirection,
        config.audio.maxHearingDistance / config.radius,
        config.radius,
        friend.color,
        0.28,
      ),
    )
  })
  debugRings.visible = false
  scene.add(debugRings)

  const targetMarker = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.035, 8, 32),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }),
  )
  targetMarker.visible = false
  scene.add(targetMarker)

  const stars = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: '#d9f1ff', size: 0.045, transparent: true, opacity: 0.6 }),
  )
  const starPositions = new Float32Array(270)
  for (let index = 0; index < starPositions.length; index += 3) {
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize().multiplyScalar(22 + Math.random() * 10)
    starPositions[index] = direction.x
    starPositions[index + 1] = direction.y
    starPositions[index + 2] = direction.z
  }
  stars.geometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  scene.add(stars)

  let playerDirection = normalizeVector(config.playerInitialDirection)
  let targetDirection: Vector3Like | null = null
  let playerForward = tangentToward(
    playerDirection,
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
  )
  let cameraAnchorDirection = { ...playerDirection }
  let cameraForward = { ...playerForward }
  let frameId = 0
  let lastTime = performance.now()
  let running = false
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pressedMovementKeys = new Set<string>()
  let externalHorizontalAxis = 0
  let externalVerticalAxis = 0
  let continuousInputActive = false
  let lastContinuousCommandTime = Number.NEGATIVE_INFINITY
  let cameraDragActive = false
  let cameraDragPointerId: number | null = null
  let cameraDragLastX = 0

  const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement

  const onKeyDown = (event: KeyboardEvent): void => {
    if (options.inputMode !== 'wasd' || isTypingTarget(event.target)) return
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return
    event.preventDefault()
    pressedMovementKeys.add(event.code)
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (options.inputMode !== 'wasd') return
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return
    event.preventDefault()
    pressedMovementKeys.delete(event.code)
  }

  const onWindowBlur = (): void => {
    pressedMovementKeys.clear()
    externalHorizontalAxis = 0
    externalVerticalAxis = 0
  }

  const updateCamera = (deltaSeconds: number): void => {
    const anchorAngle = angleBetweenUnitVectors(cameraAnchorDirection, playerDirection)
    const deadZoneAngle = config.camera.deadZoneDistance / config.radius
    if (anchorAngle > deadZoneAngle) {
      cameraAnchorDirection = rotateSurfaceDirectionToward(
        cameraAnchorDirection,
        playerDirection,
        Math.min(
          anchorAngle - deadZoneAngle,
          deltaSeconds * config.camera.followSpeed / config.radius,
        ),
      )
    }

    const normal = toThreeVector(cameraAnchorDirection)
    cameraForward = tangentToward(
      cameraAnchorDirection,
      cameraForward,
      playerForward,
    )
    const forward = toThreeVector(cameraForward)
    const surface = normal.clone().multiplyScalar(config.radius)
    camera.up.copy(normal)
    camera.position.copy(surface)
      .addScaledVector(normal, 5.4)
      .addScaledVector(forward, -6.8)
    camera.lookAt(surface.clone().addScaledVector(forward, 1.8))
  }

  const syncPlayer = (): void => {
    playerForward = targetDirection
      ? tangentToward(playerDirection, targetDirection, playerForward)
      : tangentToward(playerDirection, playerForward, cameraForward)
    orientActorOnSphere(
      player,
      playerDirection,
      playerForward,
      config.radius + config.playerHeight,
    )
  }

  const resize = (): void => {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const setTarget = (event: PointerEvent): void => {
    if (options.inputMode === 'wasd') return
    const bounds = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(planet, false)[0]
    if (!hit) return
    targetDirection = normalizeVector(hit.point)
    placeOnSphere(targetMarker, targetDirection, config.radius + 0.05)
    targetMarker.visible = true
    options.onMoveTarget?.({ ...targetDirection })
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (options.inputMode === 'click') {
      setTarget(event)
      return
    }
    if (event.button !== 0 && event.button !== 2) return
    event.preventDefault()
    cameraDragActive = true
    cameraDragPointerId = event.pointerId
    cameraDragLastX = event.clientX
    renderer.domElement.setPointerCapture(event.pointerId)
    renderer.domElement.style.cursor = 'grabbing'
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!cameraDragActive || event.pointerId !== cameraDragPointerId) return
    const deltaX = event.clientX - cameraDragLastX
    cameraDragLastX = event.clientX
    if (Math.abs(deltaX) < 0.01) return
    cameraForward = rotateTangentAroundSurfaceNormal(
      cameraForward,
      cameraAnchorDirection,
      -deltaX * 0.004,
    )
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!cameraDragActive || event.pointerId !== cameraDragPointerId) return
    cameraDragActive = false
    cameraDragPointerId = null
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId)
    }
    renderer.domElement.style.cursor = 'grab'
  }

  const onContextMenu = (event: MouseEvent): void => {
    if (options.inputMode !== 'click') event.preventDefault()
  }

  const updateContinuousInput = (time: number): void => {
    if (options.inputMode === 'click') return
    const horizontalAxis = options.inputMode === 'wasd'
      ? (pressedMovementKeys.has('KeyD') ? 1 : 0) -
        (pressedMovementKeys.has('KeyA') ? 1 : 0)
      : externalHorizontalAxis
    const verticalAxis = options.inputMode === 'wasd'
      ? (pressedMovementKeys.has('KeyW') ? 1 : 0) -
        (pressedMovementKeys.has('KeyS') ? 1 : 0)
      : externalVerticalAxis
    const continuousTarget = createContinuousMoveTarget(
      playerDirection,
      cameraForward,
      horizontalAxis,
      verticalAxis,
      0.34,
    )
    if (!continuousTarget) {
      if (continuousInputActive) {
        continuousInputActive = false
        targetDirection = null
        targetMarker.visible = false
        options.onMoveCancel?.()
      }
      return
    }

    continuousInputActive = true
    targetDirection = continuousTarget
    targetMarker.visible = false
    if (time - lastContinuousCommandTime >= 100) {
      lastContinuousCommandTime = time
      options.onMoveTarget?.({ ...continuousTarget })
    }
  }

  const animate = (time: number): void => {
    const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05)
    lastTime = time
    updateContinuousInput(time)
    let moving = false
    if (targetDirection) {
      const next = rotateSurfaceDirectionToward(
        playerDirection,
        targetDirection,
        config.moveSpeed / config.radius * deltaSeconds,
      )
      const reached = new THREE.Vector3(next.x, next.y, next.z)
        .angleTo(toThreeVector(targetDirection)) < 0.001
      playerDirection = next
      moving = !reached
      if (reached) {
        targetDirection = null
        targetMarker.visible = false
      }
      syncPlayer()
    }
    friendVisuals.forEach((visual) => {
      const wave = 1 + Math.sin(time / 170) * 0.12
      visual.pulse.scale.setScalar(visual.speaking ? wave : 0.85)
      visual.pulse.material.opacity = visual.speaking ? 0.42 : 0
    })
    remotePlayerVisuals.forEach((visual) => {
      const remainingAngle = toThreeVector(visual.direction)
        .angleTo(toThreeVector(visual.targetDirection))
      visual.forward = remainingAngle > 0.001
        ? tangentToward(visual.direction, visual.targetDirection, visual.forward)
        : tangentToward(visual.direction, visual.forward, cameraForward)
      visual.direction = rotateSurfaceDirectionToward(
        visual.direction,
        visual.targetDirection,
        Math.min(remainingAngle, deltaSeconds * 2.8),
      )
      orientActorOnSphere(
        visual.group,
        visual.direction,
        visual.forward,
        config.radius + config.playerHeight,
      )
      const wave = 1 + Math.sin(time / 170) * 0.12
      visual.pulse.scale.setScalar(visual.speaking ? wave : 0.85)
      visual.pulse.material.opacity = visual.speaking ? 0.42 : 0
    })
    updateCamera(deltaSeconds)
    onPlayerMove(playerDirection, moving)
    renderer.render(scene, camera)
    frameId = requestAnimationFrame(animate)
  }

  renderer.domElement.style.cursor = options.inputMode === 'click' ? 'crosshair' : 'grab'
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerUp)
  renderer.domElement.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  resize()
  syncPlayer()
  updateCamera(0)
  renderer.render(scene, camera)

  return {
    start() {
      if (running) return
      running = true
      lastTime = performance.now()
      frameId = requestAnimationFrame(animate)
    },
    setSpeaking(friendId, speaking) {
      const visual = friendVisuals.get(friendId)
      if (visual) visual.speaking = speaking
    },
    setDebugVisible(visible) {
      debugRings.visible = visible
    },
    setAuthoritativePlayerDirection(direction, moving, preserveLocalPrediction = false) {
      const authoritativeDirection = normalizeVector(direction)
      if (moving && preserveLocalPrediction) {
        const errorAngle = angleBetweenUnitVectors(playerDirection, authoritativeDirection)
        if (errorAngle > 0.12) {
          playerDirection = authoritativeDirection
          syncPlayer()
        }
        return
      }
      playerDirection = authoritativeDirection
      if (!moving) {
        targetDirection = null
        targetMarker.visible = false
      }
      syncPlayer()
    },
    upsertRemotePlayer(userId, direction) {
      const normalizedDirection = normalizeVector(direction)
      const existing = remotePlayerVisuals.get(userId)
      if (existing) {
        existing.targetDirection = normalizedDirection
        return
      }
      const { group, pulse } = createRemotePlayer(userId)
      placeOnSphere(group, normalizedDirection, config.radius + config.playerHeight)
      scene.add(group)
      remotePlayerVisuals.set(userId, {
        group,
        pulse,
        direction: normalizedDirection,
        targetDirection: normalizedDirection,
        forward: tangentToward(
          normalizedDirection,
          cameraForward,
          playerForward,
        ),
        speaking: false,
      })
    },
    removeRemotePlayer(userId) {
      const visual = remotePlayerVisuals.get(userId)
      if (!visual) return
      scene.remove(visual.group)
      remotePlayerVisuals.delete(userId)
    },
    setRemotePlayerSpeaking(userId, speaking) {
      const visual = remotePlayerVisuals.get(userId)
      if (visual) visual.speaking = speaking
    },
    setContinuousInput(horizontalAxis, verticalAxis) {
      externalHorizontalAxis = Math.max(-1, Math.min(1, horizontalAxis))
      externalVerticalAxis = Math.max(-1, Math.min(1, verticalAxis))
    },
    getPlayerDirection: () => ({ ...playerDirection }),
    destroy() {
      running = false
      cancelAnimationFrame(frameId)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      renderer.dispose()
      container.replaceChildren()
    },
  }
}
