import type { Localized } from '../lib/i18n'

export interface Transaction {
  dataOgloszenia: string
  dealAsset: string
  rodzajTransakcji: string
  opisTransakcji: string
  buyer: string
  seller: string
  otherParties: string
  dealValue: string
  buyerAdvisor: string
  sellerAdvisor: string
  otherAdvisors: string
  status: string
  sektor: string
  zrodla: string
}

export type ColumnKind = 'date' | 'value' | 'links' | 'status' | 'sector' | 'text'

export interface ColumnDef {
  key: keyof Transaction
  /** Displayed table header (PL/EN). */
  label: Localized
  /** Raw key the n8n workflow sends this field under (unchanged, so the backend needs no edits). */
  apiKey: string
  kind: ColumnKind
  minWidth: number
}

export const COLUMNS: ColumnDef[] = [
  { key: 'dataOgloszenia', label: { pl: 'Data ogłoszenia', en: 'Announcement date' }, apiKey: 'Data ogłoszenia', kind: 'date', minWidth: 128 },
  { key: 'dealAsset', label: { pl: 'Transakcja / aktywo', en: 'Deal / asset' }, apiKey: 'Deal/asset', kind: 'text', minWidth: 220 },
  { key: 'rodzajTransakcji', label: { pl: 'Rodzaj transakcji', en: 'Transaction type' }, apiKey: 'Rodzaj transakcji', kind: 'text', minWidth: 200 },
  { key: 'opisTransakcji', label: { pl: 'Opis transakcji', en: 'Transaction description' }, apiKey: 'Opis transakcji', kind: 'text', minWidth: 380 },
  { key: 'buyer', label: { pl: 'Kupujący / inwestor', en: 'Buyer / investor' }, apiKey: 'Buyer / inwestor', kind: 'text', minWidth: 160 },
  { key: 'seller', label: { pl: 'Sprzedający', en: 'Seller / vendor' }, apiKey: 'Seller / vendor', kind: 'text', minWidth: 160 },
  { key: 'otherParties', label: { pl: 'Pozostałe strony', en: 'Other parties' }, apiKey: 'Other parties involved', kind: 'text', minWidth: 220 },
  { key: 'dealValue', label: { pl: 'Wartość transakcji', en: 'Deal value' }, apiKey: 'Deal value', kind: 'value', minWidth: 140 },
  { key: 'buyerAdvisor', label: { pl: 'Doradca prawny kupującego', en: "Buyer's legal advisor" }, apiKey: 'Buyer legal advisor', kind: 'text', minWidth: 170 },
  { key: 'sellerAdvisor', label: { pl: 'Doradca prawny sprzedającego', en: "Seller's legal advisor" }, apiKey: 'Seller legal advisor', kind: 'text', minWidth: 170 },
  { key: 'otherAdvisors', label: { pl: 'Pozostali doradcy prawni', en: 'Other legal advisors' }, apiKey: 'Other legal advisors involved', kind: 'text', minWidth: 220 },
  { key: 'status', label: { pl: 'Status transakcji', en: 'Transaction status' }, apiKey: 'Status transakcji', kind: 'status', minWidth: 150 },
  { key: 'sektor', label: { pl: 'Sektor', en: 'Sector' }, apiKey: 'Sektor', kind: 'sector', minWidth: 130 },
  { key: 'zrodla', label: { pl: 'Źródła informacji', en: 'Sources' }, apiKey: 'Źródła informacji', kind: 'links', minWidth: 260 },
]

/** Parses "7.07.2026" (D.MM.YYYY) into a sortable timestamp. */
export function dateSortKey(value: string): number {
  const [d, m, y] = value.split('.').map(Number)
  if (!d || !m || !y) return Number.NEGATIVE_INFINITY
  return new Date(y, m - 1, d).getTime()
}

/** Parses "EUR 300 million" / "€36.4 million" into a sortable number; unknown → -Infinity. */
export function valueSortKey(value: string): number {
  const match = value.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/)
  if (!match) return Number.NEGATIVE_INFINITY
  let amount = parseFloat(match[1])
  if (/million|mln/i.test(value)) amount *= 1_000_000
  if (/billion|mld/i.test(value)) amount *= 1_000_000_000
  return amount
}

/** Placeholder junk the research model sometimes emits instead of real data. */
const EMPTY_MARKERS = new Set(['', '[]', '{}', 'null', 'undefined', 'none', 'n/a', 'na', '-', '–', '—', '...'])

/** Hard cap so a runaway backend string can never blow the table layout up. */
const MAX_CELL_LENGTH = 600

/**
 * Coerces one raw backend field into a display-safe cell string:
 * numbers/booleans/arrays are stringified, whitespace is collapsed, placeholder
 * junk ("[]", "null", "-", …) and blanks become "not disclosed", and the length
 * is capped at MAX_CELL_LENGTH.
 */
function normalizeCell(value: unknown): string {
  let text: string
  if (typeof value === 'string') text = value
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value)
  else if (Array.isArray(value)) {
    text = value.filter((v) => typeof v === 'string' || typeof v === 'number').join('; ')
  } else return 'not disclosed'
  text = text.replace(/\s+/g, ' ').trim()
  if (EMPTY_MARKERS.has(text.toLowerCase())) return 'not disclosed'
  if (text.length > MAX_CELL_LENGTH) text = text.slice(0, MAX_CELL_LENGTH - 1).trimEnd() + '…'
  return text
}

/**
 * Maps raw backend records (keyed by the n8n workflow's original field names,
 * e.g. "Data ogłoszenia", "Deal/asset" — see COLUMNS[].apiKey) onto the frontend
 * Transaction model. Missing/blank/junk fields fall back to "not disclosed".
 */
export function mapApiTransactions(raw: unknown[]): Transaction[] {
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const row = {} as Record<keyof Transaction, string>
      for (const column of COLUMNS) {
        row[column.key] = normalizeCell(item[column.apiKey])
      }
      return row as unknown as Transaction
    })
}

export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** Splits the sources field into individual http(s) URLs; junk entries are dropped. */
export function splitSources(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(isHttpUrl)
}
