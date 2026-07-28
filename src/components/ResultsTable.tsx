import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import {
  COLUMNS,
  dateSortKey,
  splitSources,
  valueSortKey,
  type ColumnDef,
  type Transaction,
} from '../data/transactions'
import { downloadCsv, toCsv } from '../lib/csv'
import { useI18n } from '../lib/i18n'

interface SortState {
  key: keyof Transaction
  dir: 'asc' | 'desc'
}

const STATUS_STYLES: Record<string, string> = {
  signed: 'border-den-gold/50 bg-den-gold/15 text-[#8a6200]',
  completed: 'border-den-teal/50 bg-den-teal/10 text-[#006e67]',
  secured: 'border-den-purple/40 bg-den-purple/10 text-den-purple',
}

/** The n8n backend sends these fields in English; the PL view translates them for display only. */
const STATUS_LABELS_PL: Record<string, string> = {
  signed: 'podpisana',
  completed: 'zamknięta',
  secured: 'zabezpieczona',
}

const SECTOR_LABELS_PL: Record<string, string> = {
  office: 'biurowy',
  'mixed-use': 'wielofunkcyjny',
  retail: 'handlowy',
  industrial: 'przemysłowy',
  logistics: 'logistyczny',
  residential: 'mieszkaniowy',
  hotel: 'hotelowy',
  warehouse: 'magazynowy',
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function sortKeyFor(column: ColumnDef, row: Transaction, lang: string): string | number {
  // String() guards against malformed rows where a field is not a string
  const raw = String(row[column.key] ?? '')
  if (column.kind === 'date') return dateSortKey(raw)
  if (column.kind === 'value') return valueSortKey(raw)
  return raw.toLocaleLowerCase(lang)
}

function CellContent({ column, row }: { column: ColumnDef; row: Transaction }) {
  const { lang, t } = useI18n()
  // String() guards against malformed rows where a field is not a string
  const value = String(row[column.key] ?? '')
  const placeholder = <span className="text-[13px] text-den-ink/35 italic">{t.notDisclosed}</span>

  if (value.trim() === '' || value === 'not disclosed') {
    return placeholder
  }

  switch (column.kind) {
    case 'date':
      return <span className="text-[13px] font-semibold break-words [overflow-wrap:anywhere] text-den-xdark tabular-nums">{value}</span>
    case 'value':
      return <span className="text-[13px] font-semibold break-words [overflow-wrap:anywhere] text-den-xdark">{value}</span>
    case 'status': {
      const status = value.toLowerCase()
      return (
        <span
          className={`inline-block max-w-full rounded-full border px-2.5 py-1 text-[11px] leading-snug font-semibold break-words [overflow-wrap:anywhere] whitespace-normal capitalize ${
            STATUS_STYLES[status] ?? 'border-den-grey bg-den-grey/20 text-den-ink/60'
          }`}
        >
          {lang === 'pl' ? (STATUS_LABELS_PL[status] ?? value) : value}
        </span>
      )
    }
    case 'sector':
      return (
        <span className="inline-block max-w-full rounded-full border border-den-light/40 bg-den-light/10 px-2.5 py-1 text-[11px] leading-snug font-medium break-words [overflow-wrap:anywhere] whitespace-normal text-den-dark capitalize">
          {lang === 'pl' ? (SECTOR_LABELS_PL[value.toLowerCase()] ?? value) : value}
        </span>
      )
    case 'links': {
      const urls = splitSources(value)
      if (urls.length === 0) return placeholder
      return (
        <span className="flex flex-col gap-1.5">
          {urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={url}
              className="group/link inline-flex items-center gap-1.5 text-[13px] font-medium break-words [overflow-wrap:anywhere] text-den-teal hover:text-[#007a72] hover:underline"
            >
              <svg className="h-3 w-3 shrink-0 opacity-60 group-hover/link:opacity-100" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v6A1.5 1.5 0 0 0 2.5 11h6A1.5 1.5 0 0 0 10 9.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M7 1h4v4M11 1 5.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {hostLabel(url)}
            </a>
          ))}
        </span>
      )
    }
    default:
      return <span className="text-[13px] leading-relaxed break-words [overflow-wrap:anywhere] text-den-ink/80">{value}</span>
  }
}

export default function ResultsTable({ rows }: { rows: Transaction[] }) {
  const { lang, t } = useI18n()
  const [sort, setSort] = useState<SortState>({ key: 'dataOgloszenia', dir: 'desc' })
  const rootRef = useRef<HTMLDivElement>(null)

  const sortedRows = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key)
    if (!column) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const ka = sortKeyFor(column, a, lang)
      const kb = sortKeyFor(column, b, lang)
      if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * factor
      return String(ka).localeCompare(String(kb), lang) * factor
    })
  }, [rows, sort, lang])

  const handleSort = (key: keyof Transaction) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`dentons-research-${stamp}.csv`, toCsv(sortedRows, COLUMNS, lang))
  }

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-results-toolbar]', { opacity: 0, y: 14, duration: 0.55, ease: 'power3.out', clearProps: 'all' })
      gsap.from('[data-results-card]', { opacity: 0, y: 20, duration: 0.65, delay: 0.08, ease: 'power3.out', clearProps: 'all' })
      gsap.from('tbody tr', { opacity: 0, duration: 0.5, delay: 0.3, ease: 'power2.out', stagger: 0.09 })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6 lg:px-10 lg:pb-8">
      {/* toolbar */}
      <div data-results-toolbar className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-den-gold/85 uppercase">{t.resultsEyebrow}</p>
          <h2 className="mt-1.5 text-2xl font-light tracking-tight text-white">
            {t.resultsTitle} <span className="text-white/45">·</span>{' '}
            <span className="font-normal text-den-light">{t.transactionCount(rows.length)}</span>
          </h2>
          <p className="mt-1 text-[13px] text-white/45">
            {t.resultsRange} · {t.resultsMarket}
          </p>
        </div>

        <button
          onClick={handleExport}
          className="group flex items-center gap-2.5 rounded-xl bg-gradient-to-b from-[#f9cd60] to-den-gold px-5 py-3 text-[14px] font-bold text-den-ink shadow-glow-gold transition-all hover:brightness-105 active:scale-[0.97]"
        >
          <svg className="h-4.5 w-4.5 transition-transform group-hover:translate-y-0.5" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M9 2v9m0 0 3.5-3.5M9 11 5.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.5 12.5v1.75A1.75 1.75 0 0 0 4.25 16h9.5a1.75 1.75 0 0 0 1.75-1.75V12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {t.exportCsv}
        </button>
      </div>

      {/* table card */}
      <div
        data-results-card
        className="data-scroll min-h-0 shrink overflow-auto rounded-2xl border border-white/15 bg-den-paper shadow-[0_24px_70px_rgba(0,0,0,0.45)] max-lg:max-h-[70vh]"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {COLUMNS.map((column, colIndex) => {
                const active = sort.key === column.key
                return (
                  <th
                    key={column.key}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={{ minWidth: column.minWidth }}
                    className={`sticky top-0 border-b-2 border-den-purple/25 bg-[#f1ebf6] p-0 ${
                      colIndex === 0 ? 'left-0 z-30 border-r border-r-[#e2d8eb]' : 'z-20'
                    }`}
                  >
                    <button
                      onClick={() => handleSort(column.key)}
                      className="flex w-full items-center gap-1.5 px-4 py-3.5 text-[11.5px] font-bold tracking-wide text-den-xdark uppercase transition-colors hover:bg-den-purple/10 hover:text-den-purple"
                    >
                      <span className="whitespace-nowrap">{column.label[lang]}</span>
                      <svg
                        className={`h-3 w-3 shrink-0 transition-all ${
                          active ? `text-den-purple ${sort.dir === 'desc' ? 'rotate-180' : ''}` : 'text-den-xdark/25'
                        }`}
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M6 2.5v7M6 2.5 3 5.5M6 2.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => {
              const zebra = rowIndex % 2 === 1 ? 'bg-[#f6f2f9]' : 'bg-white'
              return (
                <tr key={`${rowIndex}-${row.dealAsset}`} className="group">
                  {COLUMNS.map((column, colIndex) => (
                    <td
                      key={column.key}
                      className={`border-b border-[#ece5f2] px-4 py-3.5 align-top transition-colors group-hover:bg-[#efe6f6] ${zebra} ${
                        colIndex === 0 ? 'sticky left-0 z-10 border-r border-r-[#e2d8eb]' : ''
                      }`}
                    >
                      {/* width clamp lives on a block wrapper — max-width on a <td> is not reliable in auto table layout */}
                      <div className={column.key === 'opisTransakcji' ? 'max-w-[420px]' : 'max-w-[300px]'}>
                        <CellContent column={column} row={row} />
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 shrink-0 text-right font-mono text-[10px] tracking-[0.14em] text-white/30">
        {t.tableHint}
      </p>
    </div>
  )
}
