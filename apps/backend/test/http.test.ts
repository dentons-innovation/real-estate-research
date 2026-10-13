import { afterEach, describe, expect, it } from 'vitest'
import { createMockClients } from '../src/clients/mock/mockClients'
import { loadConfig, opointConfigured, opointStatus } from '../src/config/env'
import { buildApp, type App } from '../src/server'

const PASSWORD = 'test-password'
const AUTH = { authorization: `Bearer ${PASSWORD}` }

let app: App | null = null

async function start(env: Record<string, string> = {}, speed = 0): Promise<App> {
  const config = loadConfig({ MOCK_MODE: 'true', ACCESS_PASSWORD: PASSWORD, LOG_LEVEL: 'silent', ...env }, [])
  app = await buildApp(config, createMockClients(speed))
  await app.server.ready()
  return app
}

afterEach(async () => {
  await app?.server.close()
  app = null
})

async function pollUntilDone(a: App, jobId: string) {
  let lines: string[] = []
  for (let i = 0; i < 200; i++) {
    const res = await a.server.inject({ method: 'GET', url: `/api/research/poll?id=${jobId}&after=${lines.length}`, headers: AUTH })
    const body = res.json() as { lines: string[]; done: boolean; error: string | null }
    lines = [...lines, ...body.lines]
    if (body.done) return { lines, error: body.error }
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('job did not finish')
}

describe('configuration', () => {
  it('refuses to start without keys', () => {
    expect(() => loadConfig({ ACCESS_PASSWORD: 'x' }, [])).toThrow(/TAVILY_API_KEY/)
    expect(() => loadConfig({ MOCK_MODE: 'true' }, [])).toThrow(/ACCESS_PASSWORD/)
  })

  it('starts keyless with --mock', () => {
    const config = loadConfig({}, ['node', 'index.js', '--mock'])
    expect(config.MOCK_MODE).toBe(true)
    expect(config.ALLOW_NO_AUTH).toBe(true)
  })

  it('reports whether Opoint can be plugged in', () => {
    const real = { ACCESS_PASSWORD: 'x', TAVILY_API_KEY: 't', AZURE_OPENAI_ENDPOINT: 'https://e', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'd' }
    expect(opointStatus(loadConfig({ ...real, OPOINT_TOKEN: 'tok' }, []))).toBe('available')
    expect(opointStatus(loadConfig({ ...real, OPOINT_TOKEN: 'tok', OPOINT_ENABLED: 'false' }, []))).toBe('disabled')
    expect(opointStatus(loadConfig({ ...real }, []))).toBe('not_configured')
    // the master switch wins over a present token
    expect(opointConfigured(loadConfig({ ...real, OPOINT_TOKEN: 'tok', OPOINT_ENABLED: '0' }, []))).toBe(false)
  })
})

describe('HTTP API', () => {
  it('serves the health check without a password', async () => {
    const a = await start()
    const res = await a.server.inject({ method: 'GET', url: '/healthz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, mock: true, opoint: 'available' })
  })

  it('runs without Opoint unless asked, and refuses Opoint when it is switched off', async () => {
    const a = await start({ OPOINT_ENABLED: 'false' })
    expect((await a.server.inject({ method: 'GET', url: '/healthz' })).json()).toMatchObject({ opoint: 'disabled' })

    const refused = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { useOpoint: true } })
    expect(refused.statusCode).toBe(400)
    expect(refused.json()).toMatchObject({ code: 'opoint_unavailable' })
    expect((refused.json() as { error: string }).error).toMatch(/ograniczenia tokenów/)

    const started = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { range: '30d' } })
    expect(started.statusCode).toBe(200)
    const { lines, error } = await pollUntilDone(a, (started.json() as { jobId: string }).jobId)
    expect(error).toBeNull()
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(events.some((e) => e.message === 'Opoint wyłączony — research wyłącznie na podstawie Tavily.')).toBe(true)
    expect(events.some((e) => typeof e.message === 'string' && e.message.startsWith('Pobieram artykuły z Opoint'))).toBe(false)
    const last = events[events.length - 1] as { type: string; meta: { opoint_used: boolean } }
    expect(last.type).toBe('result')
    expect(last.meta.opoint_used).toBe(false)
  })

  it('plugs Opoint in only when the run asks for it', async () => {
    const a = await start()
    const plain = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: {} })
    const withOpoint = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { useOpoint: true } })
    const resultOf = async (jobId: string) => {
      const { lines } = await pollUntilDone(a, jobId)
      return JSON.parse(lines[lines.length - 1]) as { meta: { opoint_used: boolean } }
    }
    expect((await resultOf((plain.json() as { jobId: string }).jobId)).meta.opoint_used).toBe(false)
    expect((await resultOf((withOpoint.json() as { jobId: string }).jobId)).meta.opoint_used).toBe(true)
  })

  it('requires the password everywhere else', async () => {
    const a = await start()
    for (const [method, url] of [
      ['POST', '/api/auth/check'],
      ['POST', '/api/research/start'],
      ['POST', '/api/research/abort'],
      ['GET', '/api/research/poll?id=6f1c1a52-3f0e-4c59-9f0b-0d7f3f1f2a11'],
      ['GET', '/api/research/stream?id=6f1c1a52-3f0e-4c59-9f0b-0d7f3f1f2a11'],
      ['GET', '/api/research/audit?id=6f1c1a52-3f0e-4c59-9f0b-0d7f3f1f2a11'],
    ] as const) {
      // one attempt per route: repeated failures lock the address out (tested below)
      const headers = url.includes('poll') || url.includes('abort') ? { authorization: 'Bearer wrong' } : undefined
      expect((await a.server.inject({ method, url, headers })).statusCode, url).toBe(401)
    }
    expect((await a.server.inject({ method: 'POST', url: '/api/auth/check', headers: AUTH })).statusCode).toBe(204)
  })

  it('locks out an address after repeated wrong passwords', async () => {
    const a = await start()
    for (let i = 0; i < 10; i++) await a.server.inject({ method: 'POST', url: '/api/auth/check', headers: { authorization: 'Bearer wrong' } })
    const res = await a.server.inject({ method: 'POST', url: '/api/auth/check', headers: AUTH })
    expect(res.statusCode).toBe(429)
  })

  it('runs a job and serves it through polling with a cursor', async () => {
    const a = await start()
    const started = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { range: '30d', useOpoint: true } })
    expect(started.statusCode).toBe(200)
    const { jobId, window } = started.json() as { jobId: string; window: { days: number } }
    expect(window.days).toBe(30)

    const { lines, error } = await pollUntilDone(a, jobId)
    expect(error).toBeNull()
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(events[0].phase_id).toBe('init')
    const last = events[events.length - 1]
    expect(last.type).toBe('result')
    expect((last.transactions as unknown[]).length).toBe(4)

    // the cursor returns only what is new
    const tail = await a.server.inject({ method: 'GET', url: `/api/research/poll?id=${jobId}&after=${lines.length - 1}`, headers: AUTH })
    expect((tail.json() as { lines: string[] }).lines).toHaveLength(1)

    const audit = await a.server.inject({ method: 'GET', url: `/api/research/audit?id=${jobId}`, headers: AUTH })
    expect(audit.statusCode).toBe(200)
    expect((audit.json() as { deals: unknown[] }).deals).toHaveLength(4)

    // a second run on the same process gives the same table
    const again = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { useOpoint: true } })
    const second = await pollUntilDone(a, (again.json() as { jobId: string }).jobId)
    expect(second.lines[second.lines.length - 1]).toBe(lines[lines.length - 1])
  })

  it('streams a job as server-sent events and resumes from a cursor', async () => {
    const a = await start()
    const started = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { useOpoint: true } })
    const { jobId } = started.json() as { jobId: string }
    const { lines } = await pollUntilDone(a, jobId)

    const res = await a.server.inject({ method: 'GET', url: `/api/research/stream?id=${jobId}&after=0`, headers: AUTH })
    expect(res.headers['content-type']).toContain('text/event-stream')
    const data = res.body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6))
    expect(data).toEqual(lines)
    expect(res.body).toContain(`id: ${lines.length}\n`)

    const resumed = await a.server.inject({ method: 'GET', url: `/api/research/stream?id=${jobId}&after=${lines.length - 2}`, headers: AUTH })
    expect(resumed.body.split('\n').filter((l) => l.startsWith('data: '))).toHaveLength(2)
  })

  it('rejects bad windows and unknown jobs', async () => {
    const a = await start()
    expect((await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: { range: '400d' } })).statusCode).toBe(400)
    expect((await a.server.inject({ method: 'GET', url: '/api/research/poll?id=6f1c1a52-3f0e-4c59-9f0b-0d7f3f1f2a11', headers: AUTH })).statusCode).toBe(404)
    expect((await a.server.inject({ method: 'GET', url: '/api/research/poll?id=nonsense', headers: AUTH })).statusCode).toBe(400)
  })

  it('refuses more concurrent jobs than allowed', async () => {
    const a = await start({ MAX_CONCURRENT_JOBS: '1' }, 0.2)
    const first = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: {} })
    expect(first.statusCode).toBe(200)
    const second = await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: {} })
    expect(second.statusCode).toBe(429)
    expect(second.json()).toMatchObject({ code: 'busy' })

    // aborting frees the slot and ends the job with an error event
    const { jobId } = first.json() as { jobId: string }
    await a.server.inject({ method: 'POST', url: '/api/research/abort', headers: AUTH, payload: { id: jobId } })
    const { lines, error } = await pollUntilDone(a, jobId)
    expect(error).toBe('Research przerwany.')
    expect(JSON.parse(lines[lines.length - 1])).toMatchObject({ type: 'error', code: 'aborted' })
  })

  it('limits how often research can be started', async () => {
    const a = await start({ MAX_CONCURRENT_JOBS: '50' })
    const codes: number[] = []
    for (let i = 0; i < 7; i++) codes.push((await a.server.inject({ method: 'POST', url: '/api/research/start', headers: AUTH, payload: {} })).statusCode)
    expect(codes.slice(0, 6).every((c) => c === 200)).toBe(true)
    expect(codes[6]).toBe(429)
  })
})
