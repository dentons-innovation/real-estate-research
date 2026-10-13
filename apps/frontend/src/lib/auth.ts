import { api } from '../config'

/**
 * Shared access password. Kept in localStorage so the team enters it once per
 * browser; sent with every backend call as a Bearer token.
 */

const PASSWORD_KEY = 'dentons-re-access'

export function getPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setPassword(password: string): void {
  try {
    localStorage.setItem(PASSWORD_KEY, password)
  } catch {
    /* private mode — the password lives for this page only */
  }
}

export function clearPassword(): void {
  try {
    localStorage.removeItem(PASSWORD_KEY)
  } catch {
    /* nothing to clear */
  }
}

export function authHeaders(password: string = getPassword()): Record<string, string> {
  return password ? { Authorization: `Bearer ${password}` } : {}
}

export type AuthCheck = 'ok' | 'unauthorized' | 'locked' | 'unreachable'

/** Asks the backend whether the password is accepted. */
export async function checkPassword(password: string): Promise<AuthCheck> {
  try {
    const response = await fetch(api.authCheck, { method: 'POST', headers: authHeaders(password), cache: 'no-store' })
    if (response.ok) return 'ok'
    if (response.status === 401) return 'unauthorized'
    if (response.status === 429) return 'locked'
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}
