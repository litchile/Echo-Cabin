export interface JoystickAxes {
  horizontal: number
  vertical: number
}

export const calculateJoystickAxes = (
  deltaX: number,
  deltaY: number,
  radius: number,
  deadZone = 0.12,
): JoystickAxes => {
  const safeRadius = Math.max(1, radius)
  const normalizedX = deltaX / safeRadius
  const normalizedY = deltaY / safeRadius
  const magnitude = Math.hypot(normalizedX, normalizedY)
  if (magnitude <= deadZone) return { horizontal: 0, vertical: 0 }

  const clampedMagnitude = Math.min(1, magnitude)
  const scaledMagnitude = Math.min(
    1,
    (clampedMagnitude - deadZone) / Math.max(0.01, 1 - deadZone),
  )
  return {
    horizontal: normalizedX / magnitude * scaledMagnitude,
    vertical: -normalizedY / magnitude * scaledMagnitude,
  }
}

export interface VirtualJoystick {
  destroy(): void
}

export const createVirtualJoystick = (
  root: HTMLElement,
  onInput: (axes: JoystickAxes) => void,
): VirtualJoystick => {
  const knob = root.querySelector<HTMLElement>('[data-joystick-knob]')
  if (!knob) throw new Error('Virtual joystick knob is missing.')

  let pointerId: number | null = null

  const reset = (): void => {
    pointerId = null
    knob.style.transform = 'translate3d(0, 0, 0)'
    root.dataset.active = 'false'
    onInput({ horizontal: 0, vertical: 0 })
  }

  const update = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return
    const bounds = root.getBoundingClientRect()
    const radius = Math.min(bounds.width, bounds.height) * 0.34
    const deltaX = event.clientX - (bounds.left + bounds.width / 2)
    const deltaY = event.clientY - (bounds.top + bounds.height / 2)
    const distance = Math.hypot(deltaX, deltaY)
    const scale = distance > radius ? radius / distance : 1
    const clampedX = deltaX * scale
    const clampedY = deltaY * scale
    knob.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`
    onInput(calculateJoystickAxes(deltaX, deltaY, radius))
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null) return
    event.preventDefault()
    pointerId = event.pointerId
    root.setPointerCapture(event.pointerId)
    root.dataset.active = 'true'
    update(event)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return
    event.preventDefault()
    update(event)
  }

  const onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return
    event.preventDefault()
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId)
    reset()
  }

  const onLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId === pointerId) reset()
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible' && pointerId !== null) reset()
  }

  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('pointermove', onPointerMove)
  root.addEventListener('pointerup', onPointerEnd)
  root.addEventListener('pointercancel', onPointerEnd)
  root.addEventListener('lostpointercapture', onLostPointerCapture)
  window.addEventListener('pointerup', onPointerEnd, true)
  window.addEventListener('pointercancel', onPointerEnd, true)
  window.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    destroy() {
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', onPointerEnd)
      root.removeEventListener('pointercancel', onPointerEnd)
      root.removeEventListener('lostpointercapture', onLostPointerCapture)
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      reset()
    },
  }
}
