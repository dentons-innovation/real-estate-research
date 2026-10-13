import type { ResearchWindow } from '@re/shared'
import { fold } from '../verify/normalize'

const DAY_MS = 24 * 60 * 60 * 1000

const MONTH_STEMS: Array<[string, number]> = [
  ['stycz', 1], ['january', 1], ['jan', 1],
  ['lut', 2], ['february', 2], ['feb', 2],
  ['marc', 3], ['marz', 3], ['march', 3], ['mar', 3],
  ['kwie', 4], ['april', 4], ['apr', 4],
  ['maj', 5], ['may', 5],
  ['czerw', 6], ['june', 6], ['jun', 6],
  ['lip', 7], ['july', 7], ['jul', 7],
  ['sierp', 8], ['august', 8], ['aug', 8],
  ['wrze', 9], ['september', 9], ['sept', 9], ['sep', 9],
  ['pazdz', 10], ['october', 10], ['oct', 10],
  ['listop', 11], ['november', 11], ['nov', 11],
  ['grud', 12], ['december', 12], ['dec', 12],
]

/** Month abbreviations (PL and EN), matched as whole words — "lis" must never come from "lista". */
const MONTH_ABBREVIATIONS: Record<string, number> = {
  sty: 1, jan: 1, lut: 2, feb: 2, mar: 3, kwi: 4, apr: 4, maj: 5, may: 5, cze: 6, jun: 6,
  lip: 7, jul: 7, sie: 8, aug: 8, wrz: 9, sep: 9, sept: 9, paz: 10, oct: 10, lis: 11, nov: 11, gru: 12, dec: 12,
}

function monthFromWord(word: string): number | null {
  const abbreviated = MONTH_ABBREVIATIONS[word]
  if (abbreviated) return abbreviated
  for (const [stem, month] of MONTH_STEMS) if (word.startsWith(stem)) return month
  return null
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  styczen: 1, luty: 2, marzec: 3, kwiecien: 4, maj: 5, czerwiec: 6, lipiec: 7, sierpien: 8, wrzesien: 9, pazdziernik: 10, listopad: 11, grudzien: 12,
}

/**
 * Month embedded in a URL path without a day: /news/2026/october/slug, /2026/10/slug.
 * Returns the LAST day of that month — a conservative lower bound for how old
 * the page can be. Never used as a publication date for the table.
 */
export function monthEndFromUrl(url: string): string | null {
  let path: string
  try {
    path = fold(decodeURIComponent(new URL(url).pathname))
  } catch {
    return null
  }
  const m = /\/(20\d{2})\/(\d{2}|[a-z]+)(?=\/|$)/.exec(path)
  if (!m) return null
  const month = /^\d{2}$/.test(m[2]) ? Number(m[2]) : (MONTH_NAMES[m[2]] ?? MONTH_ABBREVIATIONS[m[2]] ?? 0)
  if (month < 1 || month > 12) return null
  const year = Number(m[1])
  return isoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate())
}

/** Publication date embedded in a URL path: /2026/06/29/slug, /news/2026-06-29-slug. */
export function dateFromUrl(url: string): string | null {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  const m = /\/(20\d{2})[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])(?=[/\-_.]|$)/.exec(path)
  return m ? isoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null
}

export function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d.toISOString().slice(0, 10)
}

/** Strict YYYY-MM-DD (optionally followed by a time part). */
export function parseIsoDate(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(String(value ?? '').trim())
  return m ? isoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null
}

/** Any provider date (ISO, RFC 2822, unix seconds) → YYYY-MM-DD. */
export function toIsoDay(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString().slice(0, 10)
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const iso = parseIsoDate(value)
  if (iso) return iso
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

/**
 * All dates written in a text, in PL/EN formats. A date without a year is
 * returned as "--MM-DD" so the caller can compare day and month only.
 */
export function datesInText(text: string): string[] {
  const t = fold(text)
  const found = new Set<string>()
  const add = (y: number | null, m: number, d: number) => {
    if (y === null) {
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) found.add(`--${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      return
    }
    const iso = isoDate(y, m, d)
    if (iso) found.add(iso)
  }
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) add(Number(m[1]), Number(m[2]), Number(m[3]))
  for (const m of t.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) add(Number(m[3]), Number(m[2]), Number(m[1]))
  // "7 lipca 2026", "7th July 2026", "7 lipca"
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\.? ([a-z]{3,12})\.?(?: (\d{4}))?/g)) {
    const month = monthFromWord(m[2])
    if (month) add(m[3] ? Number(m[3]) : null, month, Number(m[1]))
  }
  // "July 7, 2026", "July 7"
  for (const m of t.matchAll(/\b([a-z]{3,12})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?\b/g)) {
    const month = monthFromWord(m[1])
    if (month) add(m[3] ? Number(m[3]) : null, month, Number(m[2]))
  }
  return [...found]
}

/** True when the ISO date is written in the quote (year optional in the quote). */
export function dateStatedIn(iso: string, quote: string): boolean {
  const dates = datesInText(quote)
  return dates.includes(iso) || dates.includes(`--${iso.slice(5)}`)
}

export class WindowError extends Error {}

/** Resolves the research window from the request. `to` defaults to today (UTC). */
export function resolveWindow(
  input: { range?: string; from?: string; to?: string },
  limits: { defaultDays: number; maxDays: number },
  now: Date = new Date(),
): ResearchWindow {
  const today = now.toISOString().slice(0, 10)
  if (input.from || input.to) {
    const from = parseIsoDate(input.from)
    const to = input.to ? parseIsoDate(input.to) : today
    if (!from || !to) throw new WindowError('Parametry from/to muszą mieć format YYYY-MM-DD')
    if (from > to) throw new WindowError('Parametr from nie może być późniejszy niż to')
    if (to > today) throw new WindowError('Parametr to nie może wskazywać przyszłości')
    const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1
    if (days > limits.maxDays) throw new WindowError(`Maksymalny zakres to ${limits.maxDays} dni`)
    return { from, to, days }
  }
  let days = limits.defaultDays
  if (input.range) {
    const m = /^(\d{1,3})d$/.exec(input.range.trim())
    if (!m) throw new WindowError('Parametr range musi mieć format <liczba>d, np. 30d')
    days = Number(m[1])
    if (days < 1 || days > limits.maxDays) throw new WindowError(`Zakres musi mieścić się w 1..${limits.maxDays} dni`)
  }
  const from = new Date(Date.parse(today) - days * DAY_MS).toISOString().slice(0, 10)
  return { from, to: today, days }
}

export function inWindow(iso: string, window: ResearchWindow): boolean {
  return iso >= window.from && iso <= window.to
}

/** True when the earliest trace of a deal lies more than maxDays before the end of the window. */
export function tooOld(earliest: string, window: ResearchWindow, maxDays: number): boolean {
  return Date.parse(window.to) - Date.parse(earliest) > maxDays * DAY_MS
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS))
}

export function unixSeconds(iso: string, endOfDay = false): number {
  return Math.floor(Date.parse(`${iso}T${endOfDay ? '23:59:59' : '00:00:00'}Z`) / 1000)
}

/** YYYY-MM-DD → D.MM.YYYY, the format the table sorts on. */
export function toPlDate(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return m ? `${Number(m[3])}.${m[2]}.${m[1]}` : ''
}

const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Months touched by the window, newest first — tokens for discovery queries. */
export function monthsOfWindow(window: ResearchWindow): Array<{ pl: string; en: string; year: number }> {
  const out: Array<{ pl: string; en: string; year: number }> = []
  const end = new Date(`${window.to}T00:00:00Z`)
  const start = new Date(`${window.from}T00:00:00Z`)
  const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  while (cursor.getTime() >= Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)) {
    out.push({ pl: MONTHS_PL[cursor.getUTCMonth()], en: MONTHS_EN[cursor.getUTCMonth()], year: cursor.getUTCFullYear() })
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }
  return out
}
