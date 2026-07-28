export interface SurfaceDirection {
  x: number
  y: number
  z: number
}

export interface PlayerSnapshot {
  userId: string
  direction: SurfaceDirection
  moving: boolean
  lastProcessedClientSequence: number
}

export interface EncounterSnapshot {
  encounterId: string
  userIds: [string, string]
  status: 'candidate' | 'qualified'
}

export interface ResponseOfferSnapshot {
  responseId: string
  encounterId: string
  fromUserId: string
  toUserId: string
  status: 'pending' | 'accepted'
  resonanceAdded: boolean
}

export interface RelationshipSnapshot {
  userIds: [string, string]
  resonance: number
}

export interface RoomSnapshot {
  type: 'room.snapshot'
  serverTimeMs: number
  sequence: number
  players: PlayerSnapshot[]
  encounters: EncounterSnapshot[]
  responses: ResponseOfferSnapshot[]
  relationships: RelationshipSnapshot[]
}

export type ClientMessage =
  | {
      type: 'move.target'
      clientSequence: number
      targetDirection: SurfaceDirection
    }
  | {
      type: 'move.cancel'
      clientSequence: number
    }
  | {
      type: 'presence.ping'
      clientTimeMs?: number
    }

export type ServerMessage =
  | RoomSnapshot
  | { type: 'room.joined'; userId: string }
  | { type: 'player.joined'; userId: string }
  | { type: 'player.left'; userId: string }
  | { type: 'command.rejected'; commandType: string; reason: string }
