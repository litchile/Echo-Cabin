import type { ClientMessage, ServerMessage } from './protocol'
import { RoomEngine } from './roomEngine'

interface SocketAttachment {
  userId: string
  connectionId: string
}

const TICK_MS = 50
const SNAPSHOT_MS = 100
const PERSIST_MS = 1000
const ROOM_STATE_KEY = 'room-state-v1'

export class PlanetRoom implements DurableObject {
  private readonly engine = new RoomEngine({
    sphereRadius: 10,
    movementSpeed: 2.4,
    arrivalDistance: 0.08,
  })
  private tickTimer: ReturnType<typeof setTimeout> | null = null
  private lastTickMs = Date.now()
  private lastSnapshotMs = 0
  private lastPersistMs = 0

  constructor(private readonly state: DurableObjectState) {
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get(ROOM_STATE_KEY)
      this.engine.restorePersistentState(saved)
    })
  }

  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get('X-Echo-Verified-User')
    if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return this.handleHttpWrite(request, userId)
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    const connectionId = crypto.randomUUID()
    const attachment: SocketAttachment = { userId, connectionId }
    server.serializeAttachment(attachment)
    this.state.acceptWebSocket(server, [userId])

    this.engine.connect(userId, connectionId, Date.now())
    this.send(server, { type: 'room.joined', userId })
    this.broadcast({ type: 'player.joined', userId }, server)
    this.broadcastSnapshot()
    this.persistSoon()
    this.ensureTicking()

    return new Response(null, { status: 101, webSocket: client })
  }

  private async handleHttpWrite(request: Request, userId: string): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 })
    }
    const url = new URL(request.url)
    const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''
    const createMatch = url.pathname.match(/\/encounters\/([^/]+)\/responses$/)
    if (createMatch) {
      const result = this.engine.createResponse(
        userId,
        decodeURIComponent(createMatch[1]),
        idempotencyKey,
      )
      if ('reason' in result) return this.domainError(result.reason)
      this.persistSoon()
      this.broadcastSnapshot()
      return Response.json({
        response: {
          responseId: result.response.responseId,
          encounterId: result.response.encounterId,
          fromUserId: result.response.fromUserId,
          toUserId: result.response.toUserId,
          status: result.response.status,
          resonanceAdded: result.response.resonanceAdded,
        },
      })
    }

    const acceptMatch = url.pathname.match(/\/responses\/([^/]+)\/accept$/)
    if (acceptMatch) {
      const result = this.engine.acceptResponse(
        userId,
        decodeURIComponent(acceptMatch[1]),
        idempotencyKey,
        Date.now(),
      )
      if ('reason' in result) return this.domainError(result.reason)
      this.persistSoon()
      this.broadcastSnapshot()
      return Response.json({
        response: {
          responseId: result.response.responseId,
          encounterId: result.response.encounterId,
          fromUserId: result.response.fromUserId,
          toUserId: result.response.toUserId,
          status: result.response.status,
          resonanceAdded: result.response.resonanceAdded,
        },
        relationship: {
          userIds: result.relationship.userIds,
          resonance: result.relationship.resonance,
        },
      })
    }
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  private domainError(reason: string): Response {
    const status = reason === 'not_response_recipient' || reason === 'not_encounter_member'
      ? 403
      : reason.endsWith('_not_found') ? 404 : 409
    return Response.json({ error: reason }, { status })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    if (!attachment || typeof message !== 'string') return

    let command: ClientMessage
    try {
      command = JSON.parse(message) as ClientMessage
    } catch {
      this.reject(socket, 'unknown', 'invalid_json')
      return
    }

    switch (command.type) {
      case 'move.target': {
        const reason = this.engine.setMoveTarget(
          attachment.userId,
          attachment.connectionId,
          command.clientSequence,
          command.targetDirection,
          Date.now(),
        )
        if (reason) this.reject(socket, command.type, reason)
        break
      }
      case 'move.cancel': {
        const reason = this.engine.cancelMove(
          attachment.userId,
          attachment.connectionId,
          command.clientSequence,
          Date.now(),
        )
        if (reason) this.reject(socket, command.type, reason)
        break
      }
      case 'presence.ping':
        this.engine.markActivity(attachment.userId, attachment.connectionId, Date.now())
        break
      default:
        this.reject(socket, 'unknown', 'unknown_command')
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.removeSocket(socket)
  }

  webSocketError(socket: WebSocket): void {
    this.removeSocket(socket)
  }

  private removeSocket(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    if (!attachment) return
    if (this.engine.disconnect(attachment.userId, attachment.connectionId)) {
      this.broadcast({ type: 'player.left', userId: attachment.userId }, socket)
      this.broadcastSnapshot()
      this.persistSoon()
    }
  }

  private ensureTicking(): void {
    if (this.tickTimer !== null) return
    this.lastTickMs = Date.now()
    const tick = (): void => {
      const now = Date.now()
      const deltaSeconds = Math.min((now - this.lastTickMs) / 1000, 0.25)
      this.lastTickMs = now
      this.engine.tick(deltaSeconds, now)

      if (now - this.lastSnapshotMs >= SNAPSHOT_MS) {
        this.lastSnapshotMs = now
        this.broadcastSnapshot()
      }

      if (now - this.lastPersistMs >= PERSIST_MS) {
        this.lastPersistMs = now
        this.persistSoon()
      }

      if (this.state.getWebSockets().length === 0) {
        this.tickTimer = null
        return
      }
      this.tickTimer = setTimeout(tick, TICK_MS)
    }
    this.tickTimer = setTimeout(tick, TICK_MS)
  }

  private broadcastSnapshot(): void {
    const now = Date.now()
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (attachment) this.send(socket, this.engine.createSnapshot(now, attachment.userId))
    }
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const payload = JSON.stringify(message)
    for (const socket of this.state.getWebSockets()) {
      if (socket !== except) socket.send(payload)
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message))
  }

  private reject(socket: WebSocket, commandType: string, reason: string): void {
    this.send(socket, { type: 'command.rejected', commandType, reason })
  }

  private persistSoon(): void {
    this.state.waitUntil(
      this.state.storage.put(ROOM_STATE_KEY, this.engine.exportPersistentState()),
    )
  }
}
