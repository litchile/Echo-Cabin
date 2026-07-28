const HTTP_ORIGIN = process.env.ECHO_BACKEND_HTTP ?? 'http://127.0.0.1:8787'
const WS_ORIGIN = HTTP_ORIGIN.replace(/^http/, 'ws')
const users = ['dev-c', 'dev-d']

const connect = async (userId) => {
  const response = await fetch(`${HTTP_ORIGIN}/v1/dev/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!response.ok) throw new Error(`Session request failed for ${userId}: ${response.status}`)
  const session = await response.json()
  const url = `${WS_ORIGIN}/v1/planets/dev-planet/connect?session=${encodeURIComponent(session.token)}`
  const socket = new WebSocket(url)
  const firstSnapshot = new Promise((resolve) => {
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.type !== 'room.snapshot') return
      socket.removeEventListener('message', onMessage)
      resolve(message)
    }
    socket.addEventListener('message', onMessage)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error(`WebSocket failed for ${userId}`)), {
      once: true,
    })
  })
  return { socket, firstSnapshot, sessionToken: session.token }
}

const connections = []
for (const userId of users) connections.push(await connect(userId))
const snapshots = await Promise.all(connections.map(({ firstSnapshot }) => firstSnapshot))
const latestPlayers = snapshots.at(-1).players
const directions = users.map((userId) =>
  latestPlayers.find((player) => player.userId === userId).direction)
const midpointRaw = directions.reduce((sum, direction) => ({
  x: sum.x + direction.x,
  y: sum.y + direction.y,
  z: sum.z + direction.z,
}), { x: 0, y: 0, z: 0 })
const midpointLength = Math.hypot(midpointRaw.x, midpointRaw.y, midpointRaw.z)
const targetDirection = midpointLength > 0.001
  ? {
      x: midpointRaw.x / midpointLength,
      y: midpointRaw.y / midpointLength,
      z: midpointRaw.z / midpointLength,
    }
  : { x: 0, y: 1, z: 0 }
for (const { socket } of connections) {
  socket.send(JSON.stringify({
    type: 'move.target',
    clientSequence: 1,
    targetDirection,
  }))
}

const sockets = connections.map(({ socket }) => socket)
try {
  const qualified = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Encounter did not qualify within 35s')), 35_000)
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.type !== 'room.snapshot') return
      const encounter = message.encounters?.find((entry) =>
        entry.status === 'qualified' && users.every((userId) => entry.userIds.includes(userId)))
      if (!encounter) return
      clearTimeout(timeout)
      resolve(encounter)
    }
    sockets[0].addEventListener('message', onMessage)
  })
  const createResponse = await fetch(
    `${HTTP_ORIGIN}/v1/planets/dev-planet/encounters/${encodeURIComponent(qualified.encounterId)}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connections[0].sessionToken}`,
        'Idempotency-Key': `smoke-create:${qualified.encounterId}`,
      },
    },
  )
  if (!createResponse.ok) throw new Error(`Response creation failed: ${createResponse.status}`)
  const created = await createResponse.json()
  const acceptResponse = await fetch(
    `${HTTP_ORIGIN}/v1/planets/dev-planet/responses/${encodeURIComponent(created.response.responseId)}/accept`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connections[1].sessionToken}`,
        'Idempotency-Key': `smoke-accept:${created.response.responseId}`,
      },
    },
  )
  if (!acceptResponse.ok) throw new Error(`Response acceptance failed: ${acceptResponse.status}`)
  const accepted = await acceptResponse.json()
  console.log(JSON.stringify({
    status: 'accepted',
    encounter: qualified,
    response: accepted.response,
    relationship: accepted.relationship,
  }))
} finally {
  for (const socket of sockets) socket.close(1000, 'encounter_smoke_complete')
}
