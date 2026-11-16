import { splitSources, type ColumnDef, type Transaction } from '../data/transactions'
import type { Lang } from './i18n'

/** Table column widths are in pixels, Excel's in characters. */
const PX_PER_CHAR = 6
const MIN_WIDTH_CHARS = 14
const MAX_WIDTH_CHARS = 70

/**
 * Downloads the rows as an .xlsx workbook: the column labels (in the given
 * language) as a bold, frozen header row; every value written as text, so
 * Excel never reinterprets a date or an amount.
 */
export async function downloadXlsx(filename: string, rows: Transaction[], columns: ColumnDef[], lang: Lang): Promise<void> {
  // loaded on the first export only — keeps the library out of the initial bundle
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  const header = columns.map((c) => ({
    value: c.label[lang],
    type: String,
    fontWeight: 'bold' as const,
    backgroundColor: '#f1ebf6',
    alignVertical: 'top' as const,
    wrap: true,
  }))
  const body = rows.map((row) =>
    columns.map((c) => {
      const raw = String(row[c.key] ?? '')
      // one source per line reads better than a long "; "-separated string
      const value = c.kind === 'links' ? splitSources(raw).join('\n') : raw
      return { value, type: String, alignVertical: 'top' as const, wrap: true }
    }),
  )

  await writeXlsxFile([header, ...body], {
    sheet: lang === 'pl' ? 'Transakcje' : 'Transactions',
    stickyRowsCount: 1,
    columns: columns.map((c) => ({ width: Math.min(MAX_WIDTH_CHARS, Math.max(MIN_WIDTH_CHARS, Math.round(c.minWidth / PX_PER_CHAR))) })),
  }).toFile(filename)
}
