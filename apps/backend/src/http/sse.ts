import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Job } from '../jobs/jobStore'

/**
 * Server-Sent Events reader of a job log. Sends every line after the cursor,
 * then follows the log live. A closed connection never stops the job.
 */

const HEARTBEAT_MS = 10_000

export function streamJob(job: Job, after: number, request: FastifyRequest, reply: FastifyReply): void {
  reply.hijack()
  const res = reply.raw
  res.writeHead(200, {
    // headers set by plugins (CORS) are not sent automatically on a hijacked reply
    ...(reply.getHeaders() as Record<string, string | number | string[]>),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // ask reverse proxies not to buffer the stream
    'X-Accel-Buffering': 'no',
  })
  request.raw.socket?.setNoDelay?.(true)
  request.raw.socket?.setTimeout?.(0)

  let cursor = Math.max(0, Math.min(after, job.lines.length))
  let closed = false

  const close = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    job.listeners.delete(flush)
    if (!res.writableEnded) res.end()
  }

  const flush = () => {
    if (closed) return
    while (cursor < job.lines.length) {
      res.write(`id: ${cursor + 1}\ndata: ${job.lines[cursor]}\n\n`)
      cursor += 1
    }
    job.touchedAt = Date.now()
    if (job.done) close()
  }

  const heartbeat = setInterval(() => {
    if (closed) return
    res.write(': hb\n\n')
    job.touchedAt = Date.now()
  }, HEARTBEAT_MS)

  request.raw.on('close', close)
  res.on('error', close)

  // an opening comment makes proxies and the browser see bytes immediately
  res.write(': open\n\n')
  job.listeners.add(flush)
  flush()
}
