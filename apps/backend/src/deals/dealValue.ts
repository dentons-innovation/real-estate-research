import { fold } from '../verify/normalize'

export type Currency = 'EUR' | 'PLN' | 'USD' | 'GBP'

export interface ParsedValue {
  amount: number
  currency: Currency
}

const CURRENCY_PATTERNS: Array<[Currency, RegExp]> = [
  ['EUR', /€|\beur\b|\beuro\b|\beuros\b/],
  ['PLN', /\bpln\b|\bzl\b|\bzlot(?:y|ych|e)\b/],
  ['USD', /\$|\busd\b|\bdolar(?:ow|y)?\b|\bdollars?\b/],
  ['GBP', /£|\bgbp\b|\bfunt(?:ow|y)?\b|\bpounds?\b/],
]

export function currencyOf(text: string): Currency | null {
  const folded = fold(text)
  for (const [currency, re] of CURRENCY_PATTERNS) if (re.test(folded)) return currency
  return null
}

/**
 * Number tokens of a text in canonical form: "36,4" → "36.4", "1 200" → "1200",
 * "1.200.000" → "1200000". Used to check a value against its quote.
 */
export function numbersOf(text: string): string[] {
  const folded = fold(text).replace(/(\d)[  ](?=\d{3}(?:\D|$))/g, '$1')
  const raw = folded.match(/\d+(?:[.,]\d+)*/g) ?? []
  return raw.map(canonicalNumber)
}

function canonicalNumber(token: string): string {
  const parts = token.split(/[.,]/)
  if (parts.length === 1) return String(Number(token))
  const last = parts[parts.length - 1]
  // groups of exactly 3 digits after every separator = thousands separators
  const thousands = parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3
  if (thousands && (parts.length > 2 || last.length === 3)) return String(Number(parts.join('')))
  return String(Number(`${parts.slice(0, -1).join('')}.${last}`))
}

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/\b(?:mld|miliard\w*|billion|bn)\b/, 1_000_000_000],
  [/\b(?:mln|milion\w*|million|m)\b/, 1_000_000],
  [/\b(?:tys|tysiec\w*|tysiac\w*|thousand|k)\b/, 1_000],
]

/** Parses "EUR 300 million", "1,2 mld zł", "€36.4m". Null when ambiguous. */
export function parseDealValue(text: string): ParsedValue | null {
  const currency = currencyOf(text)
  if (!currency) return null
  const numbers = numbersOf(text)
  if (numbers.length !== 1) return null
  const base = Number(numbers[0])
  if (!Number.isFinite(base) || base <= 0) return null
  const folded = fold(text).replace(/(\d)(m|bn|k|mln|mld)\b/g, '$1 $2')
  let multiplier = 1
  for (const [re, factor] of MULTIPLIERS) {
    if (re.test(folded)) {
      multiplier = factor
      break
    }
  }
  return { amount: base * multiplier, currency }
}

/** "EUR 300 million" — the format the frontend sorts on (valueSortKey). */
export function formatDealValue(value: ParsedValue): string {
  const { amount, currency } = value
  const trim = (n: number) => String(Number(n.toFixed(2)))
  if (amount >= 1_000_000_000) return `${currency} ${trim(amount / 1_000_000_000)} billion`
  if (amount >= 1_000_000) return `${currency} ${trim(amount / 1_000_000)} million`
  return `${currency} ${Math.round(amount).toLocaleString('en-US')}`
}

/** True when both values are known, comparable and differ by more than `tolerance`. */
export function valuesConflict(a: string, b: string, tolerance = 0.1): boolean {
  const pa = parseDealValue(a)
  const pb = parseDealValue(b)
  if (!pa || !pb || pa.currency !== pb.currency) return false
  return Math.abs(pa.amount - pb.amount) / Math.max(pa.amount, pb.amount) > tolerance
}

export function valuesEqual(a: string, b: string, tolerance = 0.02): boolean {
  const pa = parseDealValue(a)
  const pb = parseDealValue(b)
  if (!pa || !pb || pa.currency !== pb.currency) return false
  return Math.abs(pa.amount - pb.amount) / Math.max(pa.amount, pb.amount) <= tolerance
}
