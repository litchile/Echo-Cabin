const HTTP_ORIGIN = process.env.ECHO_BACKEND_HTTP ?? 'http://127.0.0.1:8787'
const WS_ORIGIN = HTTP_ORIGIN.replace(/^http/, 'ws')

const issueSession = async (userId) => {
  const response = await fetch(`${HTTP_ORIGIN}/v1/dev/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!response.ok) throw new Error(`Session request failed: ${response.status}`)
  return response.json()
}

const connect = async (userId) => {
  const session = await issueSession(userId)
  const url = `${WS_ORIGIN}/v1/planets/dev-planet/connect?session=${encodeURIComponent(session.token)}`
  const socket = new WebSocket(url)
  const queue = []
  const waiters = []

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiterIndex = waiters.findIndex(({ predicate }) => predicate(message))
    if (waiterIndex >= 0) {
      const [{ resolve, timer }] = waiters.splice(waiterIndex, 1)
      clearTimeout(timer)
      resolve(message)
    } else {
      queue.push(message)
    }
  })

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error(`${userId} failed to connect`)), {
      once: true,
    })
  })

  const next = (predicate, timeoutMs = 3000) => {
    const queuedIndex = queue.findIndex(predicate)
    if (queuedIndex >= 0) return Promise.resolve(queue.splice(queuedIndex, 1)[0])
    return new Promise((resolve, reject) => {
      const entry = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = waiters.indexOf(entry)
          if (index >= 0) waiters.splice(index, 1)
          reject(new Error(`${userId} timed out waiting for a server message`))
        }, timeoutMs),
      }
      waiters.push(entry)
    })
  }

  return { socket, next }
}

const first = await connect('dev-a')
const second = await connect('dev-b')

await second.next((message) =>
  message.type === 'room.snapshot' && message.players.some((player) => player.userId === 'dev-a'),
)

first.socket.send(JSON.stringify({
  type: 'move.target',
  clientSequence: 1,
  targetDirection: { x: 1, y: 0, z: 0 },
}))

const movedSnapshot = await second.next((message) => {
  if (message.type !== 'room.snapshot') return false
  const player = message.players.find((candidate) => candidate.userId === 'dev-a')
  return Boolean(player && player.direction.x > 0.001)
})

const remotePlayer = movedSnapshot.players.find((player) => player.userId === 'dev-a')
console.log(JSON.stringify({
  ok: true,
  observedPlayers: movedSnapshot.players.map((player) => player.userId).sort(),
  remoteMovementObserved: remotePlayer.direction.x > 0.001,
  snapshotSequence: movedSnapshot.sequence,
}))

first.socket.close()
second.socket.close()
