import type { FriendDefinition, SpatialPrototypeConfig } from '../spatial-prototype/config'
import { surfaceCoordinateToUnitVector, type Vector3Like } from './sphereMath'

export interface TinyPlanetFriend extends FriendDefinition {
  surfaceDirection: Vector3Like
  placeholderShape: 'cone' | 'box' | 'octahedron'
}

export interface TinyPlanetConfig {
  radius: number
  playerHeight: number
  actorHeight: number
  moveSpeed: number
  camera: {
    deadZoneDistance: number
    followSpeed: number
  }
  playerInitialDirection: Vector3Like
  friends: TinyPlanetFriend[]
  audio: SpatialPrototypeConfig['audio']
}

const audioBase = `${import.meta.env.BASE_URL}audio/spatial-prototype/`

export const tinyPlanetConfig: TinyPlanetConfig = {
  radius: 10,
  playerHeight: 0.38,
  actorHeight: 0.34,
  moveSpeed: 2.4,
  camera: {
    deadZoneDistance: 1.3,
    followSpeed: 3.2,
  },
  playerInitialDirection: surfaceCoordinateToUnitVector({
    latitudeDeg: -18,
    longitudeDeg: 155,
  }),
  friends: [
    {
      id: 'lin',
      name: '阿林',
      monogram: '林',
      color: '#ff8c66',
      colorSoft: '#ffd7c7',
      accessory: 'leaf',
      position: { x: -38, y: 18 },
      surfaceDirection: surfaceCoordinateToUnitVector({ latitudeDeg: 15, longitudeDeg: -29 }),
      placeholderShape: 'cone',
      audioUrl: `${audioBase}friend-a.wav`,
      initialDelayMs: 0,
      silenceMs: 4200,
    },
    {
      id: 'momo',
      name: '沫沫',
      monogram: '沫',
      color: '#809cff',
      colorSoft: '#d9e3ff',
      accessory: 'star',
      position: { x: 5, y: 12 },
      surfaceDirection: surfaceCoordinateToUnitVector({ latitudeDeg: 11, longitudeDeg: 4 }),
      placeholderShape: 'box',
      audioUrl: `${audioBase}friend-b.wav`,
      initialDelayMs: 1700,
      silenceMs: 5100,
    },
    {
      id: 'kai',
      name: '小开',
      monogram: '开',
      color: '#55d5aa',
      colorSoft: '#c9f1e5',
      accessory: 'headphones',
      position: { x: 27, y: -9 },
      surfaceDirection: surfaceCoordinateToUnitVector({ latitudeDeg: -8, longitudeDeg: 22 }),
      placeholderShape: 'octahedron',
      audioUrl: `${audioBase}friend-c.wav`,
      initialDelayMs: 3400,
      silenceMs: 6000,
    },
  ],
  audio: {
    clearDistance: 2.2,
    maxHearingDistance: 6.6,
    nearGain: 0.75,
    masterGain: 0.34,
    smoothingMs: 700,
  },
}
