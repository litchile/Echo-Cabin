import playerBackUrl from '../../../assets/art/characters/initial_character/05_back.png'
import playerFrontUrl from '../../../assets/art/characters/initial_character/01_front.png'
import playerFrontThreeQuarterRightUrl from '../../../assets/art/characters/initial_character/02_front_three_quarter_facing_right.png'
import playerProfileLeftUrl from '../../../assets/art/characters/initial_character/03_profile_facing_left.png'
import playerRearThreeQuarterLeftUrl from '../../../assets/art/characters/initial_character/04_rear_three_quarter_facing_left.png'
import type { Point } from '../core/coordinates'
import type { PlayerFacingSprites } from '../scene/playerVisual'

export interface FriendDefinition {
  id: 'lin' | 'momo' | 'kai'
  name: string
  monogram: string
  color: string
  colorSoft: string
  accessory: 'leaf' | 'star' | 'headphones'
  position: Point
  audioUrl: string
  initialDelayMs: number
  silenceMs: number
}

export interface SpatialPrototypeConfig {
  walkablePolygon: Point[]
  player: {
    initialPosition: Point
    speed: number
    acceleration: number
    deceleration: number
    facingSprites: PlayerFacingSprites
  }
  friends: FriendDefinition[]
  audio: {
    clearDistance: number
    maxHearingDistance: number
    nearGain: number
    masterGain: number
    smoothingMs: number
  }
}

const assetBase = `${import.meta.env.BASE_URL}audio/spatial-prototype/`

export const spatialPrototypeConfig: SpatialPrototypeConfig = {
  walkablePolygon: [
    { x: 90, y: 145 },
    { x: 1830, y: 145 },
    { x: 1830, y: 990 },
    { x: 90, y: 990 },
  ],
  player: {
    initialPosition: { x: 180, y: 900 },
    speed: 410,
    acceleration: 1200,
    deceleration: 1450,
    facingSprites: {
      front: playerFrontUrl,
      frontThreeQuarterRight: playerFrontThreeQuarterRightUrl,
      profileLeft: playerProfileLeftUrl,
      rearThreeQuarterLeft: playerRearThreeQuarterLeftUrl,
      back: playerBackUrl,
    },
  },
  friends: [
    {
      id: 'lin',
      name: '阿林',
      monogram: '林',
      color: '#e66b48',
      colorSoft: '#ffd7c7',
      accessory: 'leaf',
      position: { x: 600, y: 330 },
      audioUrl: `${assetBase}friend-a.wav`,
      initialDelayMs: 0,
      silenceMs: 4200,
    },
    {
      id: 'momo',
      name: '沫沫',
      monogram: '沫',
      color: '#5c79c9',
      colorSoft: '#d9e3ff',
      accessory: 'star',
      position: { x: 1320, y: 350 },
      audioUrl: `${assetBase}friend-b.wav`,
      initialDelayMs: 1700,
      silenceMs: 5100,
    },
    {
      id: 'kai',
      name: '小开',
      monogram: '开',
      color: '#2f9b7c',
      colorSoft: '#c9f1e5',
      accessory: 'headphones',
      position: { x: 960, y: 820 },
      audioUrl: `${assetBase}friend-c.wav`,
      initialDelayMs: 3400,
      silenceMs: 6000,
    },
  ],
  audio: {
    clearDistance: 130,
    maxHearingDistance: 440,
    nearGain: 0.75,
    masterGain: 0.34,
    smoothingMs: 600,
  },
}
