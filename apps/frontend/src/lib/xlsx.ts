import { splitSources, type ColumnDef, type Transaction } from '../data/transactions'
import type { Lang } from './i18n'

/** Table column widths are in pixels, Excel's in characters. */
const PX_PER_CHAR = 6
const MIN_WIDTH_CHARS = 14
const MAX_WIDTH_CHARS = 70
const DATE_WIDTH_CHARS = 16
const LINK_WIDTH_CHARS = 60

/** Excel refuses a HYPERLINK() whose address is longer than this; such a URL is written as plain text. */
const MAX_HYPERLINK_CHARS = 255

const SOURCE_LABEL: Record<Lang, string> = { pl: 'Źródło', en: 'Source' }

const TEXT = { type: String, alignVertical: 'top' as const, wrap: true }

/** "16.11.2026" → a real Excel date (shown as DD.MM.YYYY, sortable); anything else stays text. */
function dateCell(value: string) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim())
  if (!m) return { ...TEXT, value }
  const date = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(m[1])) return { ...TEXT, value }
  return { value: date, type: Date, format: 'dd.mm.yyyy', alignVertical: 'top' as const, align: 'left' as const }
}

/** A clickable link. A cell holds one hyperlink, so every source gets a cell of its own. */
function linkCell(url: string) {
  if (url.length > MAX_HYPERLINK_CHARS) return { ...TEXT, value: url }
  const escaped = url.replace(/"/g, '""')
  return {
    value: `HYPERLINK("${escaped}","${escaped}")`,
    type: 'Formula' as const,
    textColor: '#0563C1',
    textDecoration: { underline: true as const },
    alignVertical: 'top' as const,
    wrap: true,
  }
}

/**
 * Downloads the rows as an .xlsx workbook: the column labels (in the given
 * language) as a bold, frozen header row; dates as real dates in DD.MM.YYYY;
 * every source as a clickable link in its own column; everything else as
 * text, so Excel never reinterprets an amount.
 */
export async function downloadXlsx(filename: string, rows: Transaction[], columns: ColumnDef[], lang: Lang): Promise<void> {
  // loaded on the first export only — keeps the library out of the initial bundle
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  const dataColumns = columns.filter((c) => c.kind !== 'links')
  const linkColumns = columns.filter((c) => c.kind === 'links')
  const sourcesOf = (row: Transaction) => linkColumns.flatMap((c) => splitSources(String(row[c.key] ?? '')))
  const sourceCount = Math.max(1, ...rows.map((row) => sourcesOf(row).length))

  const headerCell = (value: string) => ({ value, type: String, fontWeight: 'bold' as const, backgroundColor: '#f1ebf6', alignVertical: 'top' as const, wrap: true })
  const header = [
    ...dataColumns.map((c) => headerCell(c.label[lang])),
    ...Array.from({ length: sourceCount }, (_, i) => headerCell(sourceCount === 1 ? SOURCE_LABEL[lang] : `${SOURCE_LABEL[lang]} ${i + 1}`)),
  ]

  const body = rows.map((row) => {
    const sources = sourcesOf(row)
    return [
      ...dataColumns.map((c) => {
        const value = String(row[c.key] ?? '')
        return c.kind === 'date' ? dateCell(value) : { ...TEXT, value }
      }),
      ...Array.from({ length: sourceCount }, (_, i) => (sources[i] ? linkCell(sources[i]) : null)),
    ]
  })

  await writeXlsxFile([header, ...body], {
    sheet: lang === 'pl' ? 'Transakcje' : 'Transactions',
    stickyRowsCount: 1,
    columns: [
      ...dataColumns.map((c) => ({
        width: c.kind === 'date' ? DATE_WIDTH_CHARS : Math.min(MAX_WIDTH_CHARS, Math.max(MIN_WIDTH_CHARS, Math.round(c.minWidth / PX_PER_CHAR))),
      })),
      ...Array.from({ length: sourceCount }, () => ({ width: LINK_WIDTH_CHARS })),
    ],
  }).toFile(filename)
}
