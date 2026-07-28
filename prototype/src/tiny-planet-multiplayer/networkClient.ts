export interface SurfaceDirection {
  x: number
  y: number
  z: number
}

export interface NetworkPlayerSnapshot {
  userId: string
  direction: SurfaceDirection
  moving: boolean
  lastProcessedClientSequence: number
}

export interface NetworkEncounterSnapshot {
  encounterId: string
  userIds: [string, string]
  status: 'candidate' | 'qualified'
}

export interface NetworkResponseSnapshot {
  responseId: string
  encounterId: string
  fromUserId: string
  toUserId: string
  status: 'pending' | 'accepted'
  resonanceAdded: boolean
}

export interface NetworkRelationshipSnapshot {
  userIds: [string, string]
  resonance: number
}

export interface RoomSnapshot {
  type: 'room.snapshot'
  serverTimeMs: number
  sequence: number
  players: NetworkPlayerSnapshot[]
  encounters: NetworkEncounterSnapshot[]
  responses: NetworkResponseSnapshot[]
  relationships: NetworkRelationshipSnapshot[]
}

type ServerMessage =
  | RoomSnapshot
  | { type: 'room.joined'; userId: string }
  | { type: 'player.joined'; userId: string }
  | { type: 'player.left'; userId: string }
  | { type: 'command.rejected'; commandType: string; reason: string }

export type NetworkStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface PlanetRoomClientOptions {
  backendOrigin: string
  planetId: string
  userId: string
  onSnapshot: (snapshot: RoomSnapshot) => void
  onStatus: (status: NetworkStatus, detail?: string) => void
}

const isServerMessage = (value: unknown): value is ServerMessage => {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { type?: unknown }).type === 'string'
}

export class PlanetRoomClient {
  private socket: WebSocket | null = null
  private clientSequence = 0
  private closed = false
  private sessionToken: string | null = null

  constructor(private readonly options: PlanetRoomClientOptions) {}

  async connect(): Promise<void> {
    this.options.onStatus('connecting')
    try {
      const sessionResponse = await fetch(`${this.options.backendOrigin}/v1/dev/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.options.userId }),
      })
      if (!sessionResponse.ok) {
        throw new Error(`开发会话创建失败（${sessionResponse.status}）`)
      }
      const session = await sessionResponse.json() as { token?: unknown }
      if (typeof session.token !== 'string') throw new Error('开发会话格式无效')
      this.sessionToken = session.token

      const websocketOrigin = this.options.backendOrigin.replace(/^http/, 'ws')
      const url = new URL(
        `/v1/planets/${encodeURIComponent(this.options.planetId)}/connect`,
        websocketOrigin,
      )
      url.searchParams.set('session', session.token)
      await this.openSocket(url)
    } catch (error: unknown) {
      if (this.closed) return
      const detail = error instanceof Error ? error.message : '连接失败'
      this.options.onStatus('error', detail)
      throw error
    }
  }

  sendMoveTarget(direction: SurfaceDirection): number | null {
    if (this.socket?.readyState !== WebSocket.OPEN) return null
    this.clientSequence += 1
    this.socket.send(JSON.stringify({
      type: 'move.target',
      clientSequence: this.clientSequence,
      targetDirection: direction,
    }))
    return this.clientSequence
  }

  sendMoveCancel(): number | null {
    if (this.socket?.readyState !== WebSocket.OPEN) return null
    this.clientSequence += 1
    this.socket.send(JSON.stringify({
      type: 'move.cancel',
      clientSequence: this.clientSequence,
    }))
    return this.clientSequence
  }

  createResponse(encounterId: string, idempotencyKey: string): Promise<void> {
    return this.post(
      `/v1/planets/${encodeURIComponent(this.options.planetId)}/encounters/${encodeURIComponent(encounterId)}/responses`,
      idempotencyKey,
    )
  }

  acceptResponse(responseId: string, idempotencyKey: string): Promise<void> {
    return this.post(
      `/v1/planets/${encodeURIComponent(this.options.planetId)}/responses/${encodeURIComponent(responseId)}/accept`,
      idempotencyKey,
    )
  }

  close(): void {
    this.closed = true
    this.socket?.close(1000, 'page_closed')
    this.socket = null
    this.sessionToken = null
  }

  private async post(path: string, idempotencyKey: string): Promise<void> {
    if (!this.sessionToken) throw new Error('尚未连接星球')
    const response = await fetch(`${this.options.backendOrigin}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
        'Idempotency-Key': idempotencyKey,
      },
    })
    if (response.ok) return
    const body = await response.json().catch(() => null) as { error?: unknown } | null
    throw new Error(typeof body?.error === 'string' ? body.error : `回应操作失败（${response.status}）`)
  }

  private openSocket(url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.addEventListener('open', () => {
        this.options.onStatus('connected')
        resolve()
      }, { once: true })
      socket.addEventListener('message', (event) => {
        let message: unknown
        try {
          message = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (!isServerMessage(message)) return
        if (message.type === 'room.snapshot') this.options.onSnapshot(message)
        if (message.type === 'command.rejected') {
          this.options.onStatus('error', `操作被拒绝：${message.reason}`)
        }
      })
      socket.addEventListener('close', () => {
        if (!this.closed) this.options.onStatus('disconnected')
      })
      socket.addEventListener('error', () => {
        if (socket.readyState !== WebSocket.OPEN) reject(new Error('WebSocket 连接失败'))
        if (!this.closed) this.options.onStatus('error', 'WebSocket 连接异常')
      })
    })
  }
}
