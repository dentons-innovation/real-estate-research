import { API_PATHS } from '@re/shared'

/**
 * Backend address. Empty by default: the app calls its own origin (`/api/...`)
 * and the frontend server proxies those calls to the backend — Caddy in
 * production, the Vite dev server locally. A single origin is what corporate
 * proxies tolerate best.
 *
 * Set VITE_API_BASE_URL (baked in at BUILD time) only to call a backend on
 * another origin directly; that origin must then be listed in the backend's
 * CORS_ALLOWED_ORIGINS.
 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const api = {
  health: `${API_BASE_URL}${API_PATHS.health}`,
  authCheck: `${API_BASE_URL}${API_PATHS.authCheck}`,
  start: `${API_BASE_URL}${API_PATHS.start}`,
  abort: `${API_BASE_URL}${API_PATHS.abort}`,
  stream: (jobId: string, after: number) => `${API_BASE_URL}${API_PATHS.stream}?id=${encodeURIComponent(jobId)}&after=${after}`,
  poll: (jobId: string, after: number) => `${API_BASE_URL}${API_PATHS.poll}?id=${encodeURIComponent(jobId)}&after=${after}`,
}

/** Backend address as shown in the log console. */
export const API_LABEL: string = `${API_BASE_URL || window.location.origin}${API_PATHS.start}`
