import {
  createDevelopmentSession,
  isDevelopmentUser,
  verifyDevelopmentSession,
} from './auth'
export { PlanetRoom } from './planetRoom'

interface Env {
  ENVIRONMENT: string
  DEV_SESSION_SECRET: string
  PLANET_ROOMS: DurableObjectNamespace
}

const PLANET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const LOCAL_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

const developmentCorsHeaders = (request: Request, env: Env): Headers => {
  const headers = new Headers()
  if (env.ENVIRONMENT === 'production') return headers
  const origin = request.headers.get('Origin')
  if (origin && LOCAL_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
    headers.set('Vary', 'Origin')
  }
  return headers
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS' &&
      (url.pathname === '/v1/dev/sessions' || url.pathname.startsWith('/v1/planets/'))) {
      return new Response(null, {
        status: 204,
        headers: developmentCorsHeaders(request, env),
      })
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'echo-cabin-multiplayer-backend' })
    }

    if (request.method === 'POST' && url.pathname === '/v1/dev/sessions') {
      if (env.ENVIRONMENT === 'production') {
        return Response.json({ error: 'not_found' }, { status: 404 })
      }
      let body: { userId?: unknown }
      try {
        body = await request.json() as { userId?: unknown }
      } catch {
        return Response.json({ error: 'invalid_json' }, { status: 400 })
      }
      if (!isDevelopmentUser(body.userId)) {
        return Response.json({ error: 'invalid_development_user' }, { status: 400 })
      }
      const session = await createDevelopmentSession(
        body.userId,
        env.DEV_SESSION_SECRET,
      )
      return Response.json(
        { userId: body.userId, ...session },
        { headers: developmentCorsHeaders(request, env) },
      )
    }

    const connectMatch = url.pathname.match(/^\/v1\/planets\/([^/]+)\/connect$/)
    const createResponseMatch = url.pathname.match(
      /^\/v1\/planets\/([^/]+)\/encounters\/[^/]+\/responses$/,
    )
    const acceptResponseMatch = url.pathname.match(
      /^\/v1\/planets\/([^/]+)\/responses\/[^/]+\/accept$/,
    )
    const writeMatch = createResponseMatch ?? acceptResponseMatch
    const match = connectMatch ?? writeMatch
    const validMethod = connectMatch ? request.method === 'GET' : request.method === 'POST'
    if (!match || !validMethod) {
      return Response.json({ error: 'not_found' }, { status: 404 })
    }

    const planetId = match[1]
    if (!PLANET_ID_PATTERN.test(planetId)) {
      return Response.json({ error: 'invalid_planet_id' }, { status: 400 })
    }

    if (env.ENVIRONMENT === 'production') {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
    const authorization = request.headers.get('Authorization')
    const sessionToken = connectMatch
      ? url.searchParams.get('session')
      : authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
    const userId = await verifyDevelopmentSession(
      sessionToken,
      env.DEV_SESSION_SECRET,
    )
    if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

    const headers = new Headers(request.headers)
    headers.set('X-Echo-Verified-User', userId)
    const room = env.PLANET_ROOMS.get(env.PLANET_ROOMS.idFromName(planetId))
    const response = await room.fetch(new Request(request, { headers }))
    if (connectMatch) return response
    const responseHeaders = new Headers(response.headers)
    developmentCorsHeaders(request, env).forEach((value, key) => {
      responseHeaders.set(key, value)
    })
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  },
}
