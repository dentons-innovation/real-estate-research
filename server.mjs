/**
 * Production server for Railway: serves the built frontend (dist/) and relays
 * the n8n SSE stream through short-lived polling requests.
 *
 * Why: corporate proxies (e.g. at law firms) silently buffer long-lived
 * streamed POST responses, so the browser never sees a single byte of the SSE
 * stream even though the n8n domain itself is reachable. The relay keeps the
 * long connection server-side (Railway ↔ n8n) and the browser only makes
 * short same-origin requests, which every proxy passes through.
 *
 * Endpoints (same origin as the app):
 *   POST /api/research/start   {range}        → {jobId}
 *   GET  /api/research/poll?id=...&after=N    → {lines, done, error}
 *   POST /api/research/abort   {id}           → {ok}
 *
 * The server does NOT parse the stream — it accumulates raw text lines and
 * the existing client-side parser (researchStream.ts) interprets them, so the
 * protocol logic lives in exactly one place.
 *
 * Zero dependencies; requires Node >= 18 (global fetch).
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT ?? 4173)
const UPSTREAM_URL =
  process.env.N8N_SSE_WEBHOOK_URL ?? 'https://pathof.app.n8n.cloud/webhook/research-sse'

/** Evict finished/stale jobs after 10 minutes without a poll. */
const JOB_IDLE_MS = 10 * 60 * 1000

/** @type {Map<string, {lines: string[], done: boolean, error: string|null, controller: AbortController, touchedAt: number}>} */
const jobs = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.touchedAt > JOB_IDLE_MS) {
      job.controller.abort()
      jobs.delete(id)
    }
  }
}, 60_000).unref()

/** Opens the long-lived stream to n8n and accumulates its lines. */
async function runJob(job, range) {
  try {
    const response = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range }),
      signal: job.controller.signal,
    })
    if (!response.ok) {
      job.error = `upstream HTTP ${response.status} ${response.statusText} (${UPSTREAM_URL})`
      return
    }
    if (!response.body) {
      job.error = `upstream returned no stream (${UPSTREAM_URL})`
      return
    }
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        job.lines.push(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) job.lines.push(buffer)
  } catch (err) {
    if (!job.controller.signal.aborted) {
      job.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    }
  } finally {
    job.done = true
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 64 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(req, res, urlPath) {
  let filePath = path.normalize(path.join(DIST, decodeURIComponent(urlPath)))
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback — the app is a single page
    filePath = path.join(DIST, 'index.html')
  }
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // hashed assets are immutable; index.html must revalidate
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  try {
    if (req.method === 'POST' && url.pathname === '/api/research/start') {
      let range = '30d'
      try {
        const parsed = JSON.parse((await readBody(req)) || '{}')
        if (typeof parsed.range === 'string') range = parsed.range
      } catch {
        /* keep default range */
      }
      const id = crypto.randomUUID()
      const job = { lines: [], done: false, error: null, controller: new AbortController(), touchedAt: Date.now() }
      jobs.set(id, job)
      void runJob(job, range)
      sendJson(res, 200, { jobId: id })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/research/poll') {
      const job = jobs.get(url.searchParams.get('id') ?? '')
      if (!job) {
        sendJson(res, 404, { error: 'unknown job' })
        return
      }
      job.touchedAt = Date.now()
      const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0)
      sendJson(res, 200, { lines: job.lines.slice(after), done: job.done, error: job.error })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/research/abort') {
      try {
        const parsed = JSON.parse((await readBody(req)) || '{}')
        const job = jobs.get(typeof parsed.id === 'string' ? parsed.id : '')
        if (job) {
          job.controller.abort()
          jobs.delete(parsed.id)
        }
      } catch {
        /* ignore malformed abort */
      }
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname)
      return
    }

    res.writeHead(404)
    res.end()
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`serving dist/ + n8n relay on :${PORT} → ${UPSTREAM_URL}`)
})
