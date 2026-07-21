import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { PHASES, PHASE_INDEX, phaseGroupColor, type PhaseId } from '../lib/phases'
import type { ResearchEventMeta } from '../lib/researchStream'

export interface LogEntry {
  time: string
  phase: string
  message: string
  /** Kanoniczne phase_id (już zmapowane na fazę frontendu) — steruje nagłówkami sekcji i kolorem tagu. */
  phaseId?: string
  meta?: ResearchEventMeta
  /** 'error' → wpis renderowany na czerwono (pełny komunikat błędu backendu). */
  kind?: 'error'
}

const GROUP_TEXT: Record<'gold' | 'teal' | 'light', string> = {
  gold: 'text-den-gold',
  teal: 'text-den-teal',
  light: 'text-den-light',
}

function tagColor(entry: LogEntry): string {
  const idx = entry.phaseId !== undefined ? PHASE_INDEX[entry.phaseId] : undefined
  if (idx !== undefined) return GROUP_TEXT[phaseGroupColor(PHASES[idx].id as PhaseId)]
  if (/pogłębi/i.test(entry.phase)) return 'text-den-teal'
  if (/research|discovery/i.test(entry.phase)) return 'text-den-gold'
  return 'text-white/40'
}

/** Treść wpisu z podświetloną nazwą deala (gdy backend ją przysłał). */
function MessageText({ entry }: { entry: LogEntry }) {
  if (entry.kind === 'error') return <span className="text-red-300/90">{entry.message}</span>
  const deal = entry.meta?.deal
  if (deal && entry.message.includes(deal)) {
    const at = entry.message.indexOf(deal)
    return (
      <span className="text-white/70">
        {entry.message.slice(0, at)}
        <span className="text-den-gold">{deal}</span>
        {entry.message.slice(at + deal.length)}
      </span>
    )
  }
  return <span className="text-white/70">{entry.message}</span>
}

interface BackendLogProps {
  entries: LogEntry[]
  /** true dopóki research trwa — pulsująca kropka statusu + kursor. */
  running: boolean
  cancelled: boolean
  /** Research zakończony błędem — czerwony status, szczegóły w czerwonych wpisach. */
  failed: boolean
}

export default function BackendLog({ entries, running, cancelled, failed }: BackendLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Auto-scroll tylko, gdy user jest przy dole — czytanie scrollbacku nie jest wyrywane. */
  const nearBottomRef = useRef(true)

  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    const last = box.querySelector('[data-log-line]:last-of-type')
    if (last) gsap.fromTo(last, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' })
    if (nearBottomRef.current) box.scrollTop = box.scrollHeight
  }, [entries.length])

  const handleScroll = () => {
    const box = scrollRef.current
    if (!box) return
    nearBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
  }

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* header: live status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] text-white/40 uppercase">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              failed || cancelled ? 'bg-den-red' : running ? 'animate-pulse bg-den-teal' : 'bg-den-teal'
            }`}
          />
          {failed ? 'Błąd backendu' : cancelled ? 'Rozłączono' : 'Live status · backend'}
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.18em] text-white/25 uppercase">
          konsola misji · n8n stream
        </span>
      </div>

      {/* the real backend log — the only flexible child, soaks up all space */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Log backendu"
        className="data-scroll min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/45 px-3.5 py-2.5 font-mono text-[11px] leading-[1.7]"
      >
        {entries.map((entry, i) => {
          const prevId = i > 0 ? entries[i - 1].phaseId : undefined
          const def =
            entry.phaseId !== undefined && PHASE_INDEX[entry.phaseId] !== undefined
              ? PHASES[PHASE_INDEX[entry.phaseId]]
              : undefined
          const newSection = def !== undefined && entry.phaseId !== prevId
          return (
            <div key={i}>
              {newSection && (
                <div data-log-line className="my-1.5 flex items-center gap-2" aria-hidden="true">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-den-gold/40" />
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.22em] text-den-gold/80 uppercase">
                    {def.num} · {def.listLabel}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-den-gold/40" />
                </div>
              )}
              <div data-log-line className="flex gap-2 whitespace-pre-wrap">
                <span className="shrink-0 text-white/30">[{entry.time}]</span>
                {entry.phase && (
                  <span className={`shrink-0 ${entry.kind === 'error' ? 'font-semibold text-den-red' : tagColor(entry)}`}>
                    {entry.phase}
                  </span>
                )}
                <MessageText entry={entry} />
              </div>
            </div>
          )
        })}
        {!cancelled && running && (
          <span className="mt-0.5 inline-block h-3 w-1.5 animate-pulse bg-den-teal/70 align-middle" />
        )}
      </div>
    </div>
  )
}
