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
  /** Displayed table header — Polish. */
  label: string
  /** Raw key the n8n workflow sends this field under (unchanged, so the backend needs no edits). */
  apiKey: string
  kind: ColumnKind
  minWidth: number
}

export const COLUMNS: ColumnDef[] = [
  { key: 'dataOgloszenia', label: 'Data ogłoszenia', apiKey: 'Data ogłoszenia', kind: 'date', minWidth: 128 },
  { key: 'dealAsset', label: 'Transakcja / aktywo', apiKey: 'Deal/asset', kind: 'text', minWidth: 220 },
  { key: 'rodzajTransakcji', label: 'Rodzaj transakcji', apiKey: 'Rodzaj transakcji', kind: 'text', minWidth: 200 },
  { key: 'opisTransakcji', label: 'Opis transakcji', apiKey: 'Opis transakcji', kind: 'text', minWidth: 380 },
  { key: 'buyer', label: 'Kupujący / inwestor', apiKey: 'Buyer / inwestor', kind: 'text', minWidth: 160 },
  { key: 'seller', label: 'Sprzedający', apiKey: 'Seller / vendor', kind: 'text', minWidth: 160 },
  { key: 'otherParties', label: 'Pozostałe strony', apiKey: 'Other parties involved', kind: 'text', minWidth: 220 },
  { key: 'dealValue', label: 'Wartość transakcji', apiKey: 'Deal value', kind: 'value', minWidth: 140 },
  { key: 'buyerAdvisor', label: 'Doradca prawny kupującego', apiKey: 'Buyer legal advisor', kind: 'text', minWidth: 170 },
  { key: 'sellerAdvisor', label: 'Doradca prawny sprzedającego', apiKey: 'Seller legal advisor', kind: 'text', minWidth: 170 },
  { key: 'otherAdvisors', label: 'Pozostali doradcy prawni', apiKey: 'Other legal advisors involved', kind: 'text', minWidth: 220 },
  { key: 'status', label: 'Status transakcji', apiKey: 'Status transakcji', kind: 'status', minWidth: 150 },
  { key: 'sektor', label: 'Sektor', apiKey: 'Sektor', kind: 'sector', minWidth: 130 },
  { key: 'zrodla', label: 'Źródła informacji', apiKey: 'Źródła informacji', kind: 'links', minWidth: 260 },
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

/**
 * Maps raw backend records (keyed by the n8n workflow's original field names,
 * e.g. "Data ogłoszenia", "Deal/asset" — see COLUMNS[].apiKey) onto the frontend
 * Transaction model. Missing/blank fields fall back to "not disclosed".
 */
export function mapApiTransactions(raw: unknown[]): Transaction[] {
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const row = {} as Record<keyof Transaction, string>
      for (const column of COLUMNS) {
        const value = item[column.apiKey]
        row[column.key] = typeof value === 'string' && value.trim() !== '' ? value : 'not disclosed'
      }
      return row as unknown as Transaction
    })
}

export function splitSources(value: string): string[] {
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}
