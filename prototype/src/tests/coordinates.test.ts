import { describe, expect, it } from 'vitest'
import {
  fitWorldToViewport,
  pageToWorld,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  worldToPage,
  type Point,
  type Rect,
} from '../core/coordinates'

const expectPointCloseTo = (actual: Point | null, expected: Point): void => {
  expect(actual).not.toBeNull()
  expect(actual?.x).toBeCloseTo(expected.x, 8)
  expect(actual?.y).toBeCloseTo(expected.y, 8)
}

describe('pageToWorld', () => {
  const stage: Rect = { left: 100, top: 50, width: 960, height: 540 }

  it.each([
    ['top-left', { x: 100, y: 50 }, { x: 0, y: 0 }],
    ['top-right', { x: 1060, y: 50 }, { x: WORLD_WIDTH, y: 0 }],
    ['bottom-left', { x: 100, y: 590 }, { x: 0, y: WORLD_HEIGHT }],
    ['bottom-right', { x: 1060, y: 590 }, { x: WORLD_WIDTH, y: WORLD_HEIGHT }],
    ['center', { x: 580, y: 320 }, { x: 960, y: 540 }],
  ])('maps the %s point', (_label, pagePoint, worldPoint) => {
    expectPointCloseTo(pageToWorld(pagePoint, stage), worldPoint)
  })

  it('rejects top and bottom letterbox points', () => {
    expect(pageToWorld({ x: 580, y: 49.9 }, stage)).toBeNull()
    expect(pageToWorld({ x: 580, y: 590.1 }, stage)).toBeNull()
  })

  it('rejects left and right letterbox points', () => {
    expect(pageToWorld({ x: 99.9, y: 320 }, stage)).toBeNull()
    expect(pageToWorld({ x: 1060.1, y: 320 }, stage)).toBeNull()
  })
})

describe('fitWorldToViewport', () => {
  it('creates top and bottom letterbox in a tall viewport', () => {
    const layout = fitWorldToViewport({ left: 0, top: 0, width: 390, height: 844 })

    expect(layout.rect.width).toBeCloseTo(390)
    expect(layout.rect.height).toBeCloseTo(219.375)
    expect(layout.rect.left).toBeCloseTo(0)
    expect(layout.rect.top).toBeCloseTo((844 - 219.375) / 2)
  })

  it('creates left and right letterbox in a wide viewport', () => {
    const layout = fitWorldToViewport({ left: 0, top: 0, width: 1600, height: 700 })

    expect(layout.rect.width).toBeCloseTo(700 * (16 / 9))
    expect(layout.rect.height).toBeCloseTo(700)
    expect(layout.rect.left).toBeCloseTo((1600 - layout.rect.width) / 2)
    expect(layout.rect.top).toBeCloseTo(0)
  })

  it('maps the same relative point consistently across display sizes', () => {
    const layouts = [
      fitWorldToViewport({ left: 0, top: 0, width: 1920, height: 1080 }),
      fitWorldToViewport({ left: 24, top: 40, width: 1280, height: 900 }),
      fitWorldToViewport({ left: 0, top: 0, width: 844, height: 390 }),
    ]

    for (const { rect } of layouts) {
      const pagePoint = {
        x: rect.left + rect.width * 0.25,
        y: rect.top + rect.height * 0.75,
      }
      expectPointCloseTo(pageToWorld(pagePoint, rect), { x: 480, y: 810 })
    }
  })

  it('uses fresh layout values after a simulated resize', () => {
    const before = fitWorldToViewport({ left: 0, top: 0, width: 1200, height: 900 })
    const after = fitWorldToViewport({ left: 0, top: 0, width: 900, height: 1200 })

    expect(before.rect).not.toEqual(after.rect)
    expectPointCloseTo(
      pageToWorld(
        {
          x: after.rect.left + after.rect.width / 2,
          y: after.rect.top + after.rect.height / 2,
        },
        after.rect,
      ),
      { x: 960, y: 540 },
    )
  })
})

describe('worldToPage', () => {
  it('round-trips world coordinates within floating-point tolerance', () => {
    const stage: Rect = { left: 37.5, top: 82.25, width: 1333.25, height: 749.953125 }
    const worldPoint = { x: 1234.567, y: 876.543 }
    const pagePoint = worldToPage(worldPoint, stage)

    expect(pagePoint).not.toBeNull()
    expectPointCloseTo(pagePoint ? pageToWorld(pagePoint, stage) : null, worldPoint)
  })

  it('rejects points outside the virtual world', () => {
    const stage: Rect = { left: 0, top: 0, width: 1920, height: 1080 }
    expect(worldToPage({ x: -1, y: 0 }, stage)).toBeNull()
    expect(worldToPage({ x: 0, y: WORLD_HEIGHT + 1 }, stage)).toBeNull()
  })
})
