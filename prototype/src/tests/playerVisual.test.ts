import { describe, expect, it } from 'vitest'
import {
  classifyFacing,
  createFacingController,
  getFacingPresentation,
  type PlayerFacingSprites,
} from '../scene/playerVisual'

const sprites: PlayerFacingSprites = {
  front: 'front.png',
  frontThreeQuarterRight: 'front-right.png',
  profileLeft: 'left.png',
  rearThreeQuarterLeft: 'back-left.png',
  back: 'back.png',
}

describe('player visual direction feedback', () => {
  it('classifies principal and diagonal movement directions', () => {
    expect(classifyFacing({ x: 0, y: 1 })).toBe('front')
    expect(classifyFacing({ x: 1, y: 0 })).toBe('right')
    expect(classifyFacing({ x: -1, y: 0 })).toBe('left')
    expect(classifyFacing({ x: 0, y: -1 })).toBe('back')
    expect(classifyFacing({ x: 1, y: -1 })).toBe('back-right')
  })

  it('gives diagonal directions a wider range than pure horizontal movement', () => {
    expect(classifyFacing({ x: 5, y: 1 })).toBe('right')
    expect(classifyFacing({ x: 4, y: 1 })).toBe('front-right')
    expect(classifyFacing({ x: -4, y: 1 })).toBe('front-left')
    expect(classifyFacing({ x: 4, y: -1 })).toBe('back-right')
    expect(classifyFacing({ x: -4, y: -1 })).toBe('back-left')
  })

  it('keeps the angle boundaries configurable', () => {
    expect(
      classifyFacing(
        { x: 4, y: 1 },
        { horizontalHalfAngleDegrees: 20, verticalHalfAngleDegrees: 30 },
      ),
    ).toBe('right')
  })

  it('delays direction changes to avoid flicker under rapid retargeting', () => {
    const controller = createFacingController('front', 140)

    expect(controller.update({ x: 1, y: 0 }, 0)).toBe('front')
    expect(controller.update({ x: -1, y: 0 }, 60)).toBe('front')
    expect(controller.update({ x: 1, y: 0 }, 120)).toBe('front')
    expect(controller.update({ x: 1, y: 0 }, 261)).toBe('right')
  })

  it('mirrors existing sprites for missing opposite directions', () => {
    expect(getFacingPresentation('left', sprites)).toEqual({
      imageUrl: 'left.png',
      mirrored: false,
    })
    expect(getFacingPresentation('right', sprites)).toEqual({
      imageUrl: 'left.png',
      mirrored: true,
    })
    expect(getFacingPresentation('front-left', sprites)).toEqual({
      imageUrl: 'front-right.png',
      mirrored: true,
    })
  })
})
