/**
 * The final table record — the contract between the backend and the frontend
 * table (COLUMNS[].apiKey). Keys are historical (mixed PL/EN) and must not change.
 */
export const TRANSACTION_KEYS = [
  'Data ogłoszenia',
  'Deal/asset',
  'Rodzaj transakcji',
  'Opis transakcji',
  'Buyer / inwestor',
  'Seller / vendor',
  'Other parties involved',
  'Deal value',
  'Buyer legal advisor',
  'Seller legal advisor',
  'Other legal advisors involved',
  'Status transakcji',
  'Sektor',
  'Źródła informacji',
] as const

export type TransactionKey = (typeof TRANSACTION_KEYS)[number]

/** Every value is a string; a missing fact is an empty string, never a guess. */
export type TransactionRecord = Record<TransactionKey, string>

export const TRANSACTION_TYPES = ['sale', 'acquisition', 'financing', 'JV'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const DEAL_STATUSES = ['completed', 'signed', 'announced'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const SECTORS = [
  'office',
  'retail',
  'logistics-industrial',
  'residential',
  'land',
  'hotel',
  'not identified',
] as const
export type Sector = (typeof SECTORS)[number]
