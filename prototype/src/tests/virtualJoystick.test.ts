import { describe, expect, it } from 'vitest'
import { calculateJoystickAxes } from '../tiny-planet-multiplayer/virtualJoystick'

describe('virtual joystick axes', () => {
  it('ignores movement inside the center dead zone', () => {
    expect(calculateJoystickAxes(3, -2, 50)).toEqual({
      horizontal: 0,
      vertical: 0,
    })
  })

  it('maps an upward drag to camera-relative forward movement', () => {
    const axes = calculateJoystickAxes(0, -50, 50)
    expect(axes.horizontal).toBeCloseTo(0)
    expect(axes.vertical).toBeCloseTo(1)
  })

  it('clamps diagonal drags to unit length', () => {
    const axes = calculateJoystickAxes(100, -100, 50)
    expect(Math.hypot(axes.horizontal, axes.vertical)).toBeCloseTo(1)
    expect(axes.horizontal).toBeGreaterThan(0)
    expect(axes.vertical).toBeGreaterThan(0)
  })
})
