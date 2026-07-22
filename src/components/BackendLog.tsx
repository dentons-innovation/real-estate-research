import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { PHASES, PHASE_INDEX, phaseGroupColor, type PhaseId } from '../lib/phases'
import { translateBackendText, translatePhaseTag, useI18n, type Lang } from '../lib/i18n'
import type { ResearchEventMeta } from '../lib/researchStream'

export interface LogEntry {
  time: string
  phase: string
  message: string
  /** Canonical phase_id (already mapped to a frontend phase) — drives section headers and tag colour. */
  phaseId?: string
  meta?: ResearchEventMeta
  /** 'error' → entry rendered in red (full backend error message). */
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

/** Entry text (translated at render time) with the deal name highlighted. */
function MessageText({ entry, lang }: { entry: LogEntry; lang: Lang }) {
  const text = translateBackendText(entry.message, lang)
  if (entry.kind === 'error') return <span className="text-red-300/90">{text}</span>
  const deal = entry.meta?.deal
  if (deal && text.includes(deal)) {
    const at = text.indexOf(deal)
    return (
      <span className="text-white/70">
        {text.slice(0, at)}
        <span className="text-den-gold">{deal}</span>
        {text.slice(at + deal.length)}
      </span>
    )
  }
  return <span className="text-white/70">{text}</span>
}

interface BackendLogProps {
  entries: LogEntry[]
  /** true while the research is running — pulsing status dot + cursor. */
  running: boolean
  cancelled: boolean
  /** Research ended with an error — red status, details in red entries. */
  failed: boolean
}

export default function BackendLog({ entries, running, cancelled, failed }: BackendLogProps) {
  const { lang, t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Auto-scroll only when the user is near the bottom — reading scrollback is never yanked away. */
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
          {failed ? t.logStatusError : cancelled ? t.logStatusDisconnected : t.logStatusLive}
        </span>
      </div>

      {/* the real backend log — the only flexible child, soaks up all space */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label={t.logAria}
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
                    {def.num} · {def.listLabel[lang]}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-den-gold/40" />
                </div>
              )}
              <div data-log-line className="flex gap-2 whitespace-pre-wrap">
                <span className="shrink-0 text-white/30">[{entry.time}]</span>
                {entry.phase && (
                  <span className={`shrink-0 ${entry.kind === 'error' ? 'font-semibold text-den-red' : tagColor(entry)}`}>
                    {translatePhaseTag(entry.phase, lang)}
                  </span>
                )}
                <MessageText entry={entry} lang={lang} />
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
