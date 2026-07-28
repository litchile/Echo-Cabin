const HTTP_ORIGIN = process.env.ECHO_BACKEND_HTTP ?? 'http://127.0.0.1:8787'
const WS_ORIGIN = HTTP_ORIGIN.replace(/^http/, 'ws')
const [userId = 'dev-c', rawX = '0', rawY = '1', rawZ = '0', rawHoldMs = '15000'] =
  process.argv.slice(2)
const targetDirection = {
  x: Number(rawX),
  y: Number(rawY),
  z: Number(rawZ),
}
const holdMs = Number(rawHoldMs)

if (!['dev-a', 'dev-b', 'dev-c', 'dev-d'].includes(userId) ||
  !Object.values(targetDirection).every(Number.isFinite) ||
  !Number.isFinite(holdMs) || holdMs < 1000) {
  throw new Error('Usage: npm run dev-player -- <dev-user> <x> <y> <z> [hold-ms]')
}

const response = await fetch(`${HTTP_ORIGIN}/v1/dev/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId }),
})
if (!response.ok) throw new Error(`Session request failed: ${response.status}`)
const session = await response.json()
const url = `${WS_ORIGIN}/v1/planets/dev-planet/connect?session=${encodeURIComponent(session.token)}`
const socket = new WebSocket(url)

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', () => reject(new Error('WebSocket connection failed')), {
    once: true,
  })
})

socket.send(JSON.stringify({
  type: 'move.target',
  clientSequence: 1,
  targetDirection,
}))
console.log(JSON.stringify({ userId, targetDirection, holdMs, status: 'moving' }))

await new Promise((resolve) => setTimeout(resolve, holdMs))
socket.close(1000, 'simulation_complete')
console.log(JSON.stringify({ userId, status: 'complete' }))
