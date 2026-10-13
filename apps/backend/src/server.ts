import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { API_PATHS, type HealthResponse, type PollResponse, type StartResponse } from '@re/shared'
import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { LlmClient } from './clients/llm'
import type { OpointClient } from './clients/opoint'
import type { TavilyClient } from './clients/tavily'
import { buildDomainLists } from './config/domains'
import { opointStatus, type AppConfig } from './config/env'
import { resolveWindow, WindowError } from './deals/dates'
import { createAuthGuard } from './http/auth'
import { streamJob } from './http/sse'
import { JobLimitError, JobStore } from './jobs/jobStore'
import { runResearch } from './pipeline/orchestrator'

export interface Clients {
  /** Null when Opoint is not configured. */
  opoint: OpointClient | null
  tavily: TavilyClient
  llm: LlmClient
}

export interface App {
  server: FastifyInstance
  jobs: JobStore
}

const startBody = z.object({
  range: z.string().max(10).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  useOpoint: z.boolean().optional(),
})

/** User-facing reason why Opoint cannot be plugged into a run. */
const OPOINT_UNAVAILABLE: Record<Exclude<ReturnType<typeof opointStatus>, 'available'>, string> = {
  disabled: 'Opoint jest na razie niedostępny z powodu ograniczenia tokenów — uruchom research bez Opointa.',
  not_configured: 'Opoint nie jest skonfigurowany na tym serwerze — uruchom research bez Opointa.',
}

const cursorQuery = z.object({
  id: z.string().uuid(),
  after: z.coerce.number().int().min(0).optional().default(0),
})

const idBody = z.object({ id: z.string().uuid() })

export async function buildApp(config: AppConfig, clients: Clients): Promise<App> {
  const server = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ['req.headers.authorization'] },
    // behind Caddy / the Railway edge: the client IP is in X-Forwarded-For
    trustProxy: true,
    bodyLimit: 16 * 1024,
  })

  const jobs = new JobStore({
    maxConcurrent: config.MAX_CONCURRENT_JOBS,
    dailyBudget: config.DAILY_JOB_BUDGET,
    timeoutMs: config.JOB_TIMEOUT_MS,
  })
  server.addHook('onClose', async () => jobs.close())

  const lists = buildDomainLists(config.EXTRA_TRADE_DOMAINS, config.EXTRA_LAW_DOMAINS)
  const auth = createAuthGuard(config.ACCESS_PASSWORD)

  await server.register(cors, {
    // exact allow-list; same-origin calls through the frontend proxy carry no Origin check
    origin: config.CORS_ALLOWED_ORIGINS.length > 0 ? config.CORS_ALLOWED_ORIGINS : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Last-Event-ID'],
    maxAge: 600,
  })
  await server.register(rateLimit, { global: false })

  const limited = (max: number, timeWindow: string) => ({ config: { rateLimit: { max, timeWindow } } })

  // the client may be missing even when the config says "available" (tests inject their own clients)
  const opoint = (): HealthResponse['opoint'] => {
    const status = opointStatus(config)
    return status === 'available' && !clients.opoint ? 'not_configured' : status
  }

  server.get(API_PATHS.health, async (): Promise<HealthResponse> => ({
    ok: true,
    mock: config.MOCK_MODE,
    opoint: opoint(),
    active_jobs: jobs.activeCount,
  }))

  server.post(API_PATHS.authCheck, { ...limited(30, '15 minutes'), preHandler: auth.preHandler }, async (_request, reply) => {
    await reply.code(204).send()
  })

  server.post(API_PATHS.start, { ...limited(6, '1 hour'), preHandler: auth.preHandler }, async (request, reply) => {
    const body = startBody.safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe parametry żądania.', code: 'bad_request' })
    // Opoint is opt-in per run; asking for it while it is switched off is a hard error, not a silent fallback
    const useOpoint = body.data.useOpoint === true
    const opointNow = opoint()
    if (useOpoint && opointNow !== 'available') {
      return reply.code(400).send({ error: OPOINT_UNAVAILABLE[opointNow], code: 'opoint_unavailable' })
    }
    try {
      const window = resolveWindow(body.data, { defaultDays: config.DEFAULT_RANGE_DAYS, maxDays: config.MAX_RANGE_DAYS })
      const job = jobs.start(window, (j, emit) =>
        runResearch({
          window,
          lists,
          opoint: useOpoint ? clients.opoint : null,
          tavily: clients.tavily,
          llm: clients.llm,
          emit,
          signal: j.controller.signal,
          audit: [],
          settings: {
            maxDiscoveryQueries: config.TAVILY_MAX_DISCOVERY_QUERIES,
            maxArticlesForExtraction: config.MAX_ARTICLES_FOR_EXTRACTION,
            deepenLimit: config.DEEPEN_LIMIT,
            maxQueriesPerDeal: config.MAX_QUERIES_PER_DEAL,
            maxNewSourcesPerDeal: config.MAX_NEW_SOURCES_PER_DEAL,
            deepenConcurrency: config.DEEPEN_CONCURRENCY,
            strictWindow: config.STRICT_WINDOW,
            maxDealAgeDays: config.MAX_DEAL_AGE_DAYS,
          },
        }),
      )
      request.log.info({ jobId: job.id, window, useOpoint }, 'research started')
      const response: StartResponse = { jobId: job.id, window }
      return response
    } catch (err) {
      if (err instanceof WindowError) return reply.code(400).send({ error: err.message, code: 'bad_window' })
      if (err instanceof JobLimitError) return reply.code(429).send({ error: err.message, code: err.code })
      throw err
    }
  })

  server.get(API_PATHS.stream, { ...limited(300, '1 minute'), preHandler: auth.preHandler }, async (request, reply) => {
    const query = cursorQuery.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'Nieprawidłowe parametry żądania.', code: 'bad_request' })
    const job = jobs.get(query.data.id)
    if (!job) return reply.code(404).send({ error: 'Nie znaleziono researchu o podanym identyfikatorze.', code: 'not_found' })
    streamJob(job, query.data.after, request, reply)
    return reply
  })

  server.get(API_PATHS.poll, { ...limited(300, '1 minute'), preHandler: auth.preHandler }, async (request, reply) => {
    const query = cursorQuery.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'Nieprawidłowe parametry żądania.', code: 'bad_request' })
    const job = jobs.get(query.data.id)
    if (!job) return reply.code(404).send({ error: 'Nie znaleziono researchu o podanym identyfikatorze.', code: 'not_found' })
    const response: PollResponse = { lines: job.lines.slice(query.data.after), done: job.done, error: job.error }
    reply.header('Cache-Control', 'no-store')
    return response
  })

  server.post(API_PATHS.abort, { ...limited(60, '1 minute'), preHandler: auth.preHandler }, async (request, reply) => {
    const body = idBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe parametry żądania.', code: 'bad_request' })
    return { ok: jobs.abort(body.data.id) }
  })

  server.get(API_PATHS.audit, { ...limited(60, '1 minute'), preHandler: auth.preHandler }, async (request, reply) => {
    const query = cursorQuery.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'Nieprawidłowe parametry żądania.', code: 'bad_request' })
    const job = jobs.get(query.data.id)
    if (!job) return reply.code(404).send({ error: 'Nie znaleziono researchu o podanym identyfikatorze.', code: 'not_found' })
    if (!job.audit) return reply.code(409).send({ error: 'Research jeszcze trwa albo zakończył się błędem.', code: 'not_ready' })
    return { window: job.window, ...job.audit }
  })

  return { server, jobs }
}
