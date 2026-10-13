import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Shared-password access. The password travels as `Authorization: Bearer …`.
 * Failed attempts are counted per IP, so no endpoint can be used to guess it.
 */

const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 15 * 60_000

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()

export interface AuthGuard {
  preHandler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  enabled: boolean
}

export function createAuthGuard(password: string): AuthGuard {
  if (!password) {
    return { enabled: false, preHandler: async () => {} }
  }
  const expected = digest(password)
  const failures = new Map<string, { count: number; resetAt: number }>()

  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of failures) if (entry.resetAt <= now) failures.delete(ip)
  }, 60_000)
  sweeper.unref()

  return {
    enabled: true,
    preHandler: async (request, reply) => {
      const now = Date.now()
      const entry = failures.get(request.ip)
      if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
        reply.header('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
        await reply.code(429).send({ error: 'Zbyt wiele nieudanych prób logowania — spróbuj ponownie później.', code: 'auth_locked' })
        return
      }
      const header = request.headers.authorization ?? ''
      const token = /^Bearer\s+(.+)$/i.exec(header)?.[1] ?? ''
      if (token && timingSafeEqual(digest(token), expected)) return

      const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + FAILURE_WINDOW_MS }
      current.count += 1
      failures.set(request.ip, current)
      await reply.code(401).send({ error: 'Nieprawidłowe hasło dostępu.', code: 'unauthorized' })
    },
  }
}
