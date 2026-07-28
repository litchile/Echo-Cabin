import playerBackUrl from '../../../assets/art/characters/initial_character/05_back.png'
import playerFrontUrl from '../../../assets/art/characters/initial_character/01_front.png'
import playerFrontThreeQuarterRightUrl from '../../../assets/art/characters/initial_character/02_front_three_quarter_facing_right.png'
import playerProfileLeftUrl from '../../../assets/art/characters/initial_character/03_profile_facing_left.png'
import playerRearThreeQuarterLeftUrl from '../../../assets/art/characters/initial_character/04_rear_three_quarter_facing_left.png'
import roomSceneUrl from '../../../assets/room/layers_1920x1080/00_final_room_reference.jpg'
import type { CharacterAvatarPreset, SpawnPoint } from '../characters/characterTypes'
import type { Point } from '../core/coordinates'
import type { PlacementGrid } from '../scene/placementGrid'
import type { WallNavigationConfig } from '../scene/navigationTarget'
import type { PlayerFacingSprites, PlayerMotionFeedbackConfig } from '../scene/playerVisual'

export interface PrototypeConfig {
  scene: {
    imageUrl: string
    walkablePolygon: Point[]
    walkableRearBoundary: Point[]
    itemPlacementPolygon: Point[]
    itemPlacementGrid: PlacementGrid
    wallNavigation: WallNavigationConfig
  }
  player: {
    facingSprites: PlayerFacingSprites
    initialPosition: Point
    movementSpeed: number
    acceleration: number
    deceleration: number
    visualWidth: number
    visualHeight: number
    motionFeedback: PlayerMotionFeedbackConfig
  }
  characters: {
    capacity: number
    avatars: CharacterAvatarPreset[]
    spawnPoints: SpawnPoint[]
  }
  audio: {
    selfGain: number
    otherCharacterMaxGain: number
    clearDistance: number
    maxHearingDistance: number
    smoothingMs: number
    characterBusGain: number
    masterGain: number
    theoreticalPeakCeiling: number
    playbackIntervalMs: number
  }
}

const walkableRearBoundary: Point[] = [
  { x: 45, y: 940 },
  { x: 330, y: 800 },
  { x: 1590, y: 800 },
  { x: 1875, y: 940 },
]

export const prototypeConfig: PrototypeConfig = {
  scene: {
    imageUrl: roomSceneUrl,
    // The player's foot anchor stays inside this perspective floor polygon.
    walkablePolygon: [
      ...walkableRearBoundary,
      { x: 1875, y: 1035 },
      { x: 45, y: 1035 },
    ],
    // This is the single authoritative rear edge of the walkable floor.
    walkableRearBoundary,
    // This is a permitted placement region, not a fixed item or collision zone.
    // A placed item's occupied area will be generated from its actual position.
    itemPlacementPolygon: [
      { x: 390, y: 840 },
      { x: 1530, y: 840 },
      { x: 1750, y: 970 },
      { x: 1700, y: 1010 },
      { x: 220, y: 1010 },
      { x: 170, y: 970 },
    ],
    // Logical-only placement grid. It must never be rendered in the scene.
    itemPlacementGrid: {
      cellSize: 60,
      origin: { x: 0, y: 0 },
    },
    wallNavigation: {
      enabled: true,
      floorTopY: 800,
      // Measured from the current 1920 × 1080 scene debug reference.
      topY: 570,
      safetyOffset: 60,
      nearestSearchRadius: 180,
      nearestSearchStep: 20,
      debugVisible: true,
    },
  },
  player: {
    facingSprites: {
      front: playerFrontUrl,
      frontThreeQuarterRight: playerFrontThreeQuarterRightUrl,
      profileLeft: playerProfileLeftUrl,
      rearThreeQuarterLeft: playerRearThreeQuarterLeftUrl,
      back: playerBackUrl,
    },
    initialPosition: { x: 960, y: 930 },
    movementSpeed: 360,
    acceleration: 980,
    deceleration: 1180,
    visualWidth: 170,
    visualHeight: 352,
    motionFeedback: {
      enabled: true,
      directionHoldMs: 140,
      // Keep pure side-facing narrow so the shallow room floor still uses diagonals.
      horizontalFacingHalfAngleDegrees: 14,
      verticalFacingHalfAngleDegrees: 26,
      bobAmplitudePercent: 2.2,
      bobCycleMs: 360,
      shadowMovingScale: 0.86,
    },
  },
  characters: {
    capacity: 4,
    avatars: [
      { id: 'default', label: '小屋旅伴', imageUrl: playerFrontUrl },
    ],
    spawnPoints: [
      { id: 'center', position: { x: 960, y: 840 } },
      { id: 'left', position: { x: 600, y: 900 } },
      { id: 'right', position: { x: 1320, y: 900 } },
      { id: 'front', position: { x: 960, y: 1010 } },
    ],
  },
  audio: {
    selfGain: 0.20,
    otherCharacterMaxGain: 0.45,
    clearDistance: 80,
    maxHearingDistance: 420,
    smoothingMs: 320,
    characterBusGain: 0.45,
    masterGain: 1,
    theoreticalPeakCeiling: 0.5,
    playbackIntervalMs: 3000,
  },
}
