const DEVELOPMENT_USERS = new Set(['dev-a', 'dev-b', 'dev-c', 'dev-d'])
const SESSION_LIFETIME_MS = 5 * 60 * 1000

interface DevelopmentSessionPayload {
  userId: string
  expiresAtMs: number
  nonce: string
}

const textEncoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const fromBase64Url = (value: string): Uint8Array | null => {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

const importSigningKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )

export const isDevelopmentUser = (value: unknown): value is string =>
  typeof value === 'string' && DEVELOPMENT_USERS.has(value)

export const createDevelopmentSession = async (
  userId: string,
  secret: string,
  nowMs = Date.now(),
): Promise<{ token: string; expiresAtMs: number }> => {
  if (!isDevelopmentUser(userId)) throw new Error('Invalid development user')
  const payload: DevelopmentSessionPayload = {
    userId,
    expiresAtMs: nowMs + SESSION_LIFETIME_MS,
    nonce: crypto.randomUUID(),
  }
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)))
  const key = await importSigningKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(encodedPayload))
  return {
    token: `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAtMs: payload.expiresAtMs,
  }
}

export const verifyDevelopmentSession = async (
  token: string | null,
  secret: string,
  nowMs = Date.now(),
): Promise<string | null> => {
  if (!token || !secret) return null
  const [encodedPayload, encodedSignature, extra] = token.split('.')
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null

  const signature = fromBase64Url(encodedSignature)
  const payloadBytes = fromBase64Url(encodedPayload)
  if (!signature || !payloadBytes) return null

  const key = await importSigningKey(secret)
  const signatureBuffer = signature.slice().buffer as ArrayBuffer
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBuffer,
    textEncoder.encode(encodedPayload),
  )
  if (!valid) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as
      Partial<DevelopmentSessionPayload>
    if (!isDevelopmentUser(payload.userId)) return null
    const expiresAtMs = payload.expiresAtMs
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs === undefined || expiresAtMs <= nowMs) {
      return null
    }
    if (typeof payload.nonce !== 'string' || payload.nonce.length < 1) return null
    return payload.userId
  } catch {
    return null
  }
}
