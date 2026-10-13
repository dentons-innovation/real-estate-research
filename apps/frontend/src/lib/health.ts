import type { HealthResponse, OpointStatus } from '@re/shared'
import { api } from '../config'

/**
 * Backend capabilities as reported by /healthz (no password needed).
 * Today only one thing matters to the UI: whether Opoint can be plugged into a run.
 */

/** 'unknown' until the backend answers, or when it cannot be reached. */
export type OpointAvailability = OpointStatus | 'unknown'

export async function fetchOpointAvailability(): Promise<OpointAvailability> {
  try {
    const response = await fetch(api.health, { cache: 'no-store' })
    if (!response.ok) return 'unknown'
    const data = (await response.json()) as Partial<HealthResponse>
    return data.opoint === 'available' || data.opoint === 'disabled' || data.opoint === 'not_configured' ? data.opoint : 'unknown'
  } catch {
    return 'unknown'
  }
}
