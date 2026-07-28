import { describe, expect, it } from 'vitest'
import {
  createDevelopmentSession,
  verifyDevelopmentSession,
} from '../src/auth'

describe('development sessions', () => {
  it('round-trips a valid short-lived session', async () => {
    const session = await createDevelopmentSession('dev-a', 'test-secret', 1000)
    await expect(verifyDevelopmentSession(session.token, 'test-secret', 2000))
      .resolves.toBe('dev-a')
  })

  it('rejects tampering, a wrong secret, and an expired session', async () => {
    const session = await createDevelopmentSession('dev-a', 'test-secret', 1000)
    await expect(verifyDevelopmentSession(`${session.token}x`, 'test-secret', 2000))
      .resolves.toBeNull()
    await expect(verifyDevelopmentSession(session.token, 'wrong-secret', 2000))
      .resolves.toBeNull()
    await expect(verifyDevelopmentSession(session.token, 'test-secret', session.expiresAtMs))
      .resolves.toBeNull()
  })
})
