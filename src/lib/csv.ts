import type { ColumnDef, Transaction } from '../data/transactions'
import type { Lang } from './i18n'

const UTF8_BOM = '﻿'

function escapeCsvField(value: string): string {
  if (/[",\r\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Serializes rows to RFC 4180 CSV using the column labels (in the given language) as the header row. */
export function toCsv(rows: Transaction[], columns: ColumnDef[], lang: Lang): string {
  const header = columns.map((c) => escapeCsvField(c.label[lang])).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(','))
  return [header, ...lines].join('\r\n')
}

/** Triggers a browser download of the CSV with a UTF-8 BOM so Excel reads Polish diacritics. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
