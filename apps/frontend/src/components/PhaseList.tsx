import type { ReactElement } from 'react'
import { PHASES, type MissionState, type PhaseIcon } from '../lib/phases'
import { translateResearchLabels, useI18n, type Lang, type UIStrings } from '../lib/i18n'

/* small 16×16 glyphs, stroke = currentColor — consistent with the mono-industrial UI style */
const ICON_PATHS: Record<PhaseIcon, ReactElement> = {
  plug: (
    <>
      <path d="M5.5 1.5v3M10.5 1.5v3" />
      <path d="M4 4.5h8V7a4 4 0 0 1-8 0z" />
      <path d="M8 11v3.5" />
    </>
  ),
  launch: (
    <>
      <path d="M8 14V2.5" />
      <path d="M4 6.5 8 2.5l4 4" />
      <path d="M4.5 11.5h7" opacity="0.45" />
    </>
  ),
  radar: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 8V3" />
      <path d="m8 8 3.4 2" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  merge: (
    <>
      <path d="M2.5 4.5h3L11 11.5h2.5" />
      <path d="M2.5 11.5h3l1.7-2.1" />
      <path d="m11.5 9.5 2 2-2 2" />
    </>
  ),
  drill: (
    <>
      <path d="M8 1.5V8" />
      <path d="M5.5 5.5 8 8l2.5-2.5" />
      <path d="M2.5 11h11M4 13.5h8" opacity="0.6" />
    </>
  ),
  table: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <path d="M2.5 6.5h11M6.5 6.5V13" />
    </>
  ),
  check: <path d="M2.5 8.5 6.5 12.5 13.5 4" />,
}

function PhaseGlyph({ icon }: { icon: PhaseIcon }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[icon]}
    </svg>
  )
}

/** Caption of the active phase built from real backend data. */
function activeCaption(mission: MissionState, lang: Lang, t: UIStrings): string {
  const { meta } = mission
  const id = PHASES[mission.idx].id
  if (!meta) return ''
  if (id.startsWith('research_') && id !== 'research_launch') {
    if (!meta.doneLabels) return t.captionTasksRunning
    const labels = lang === 'en' ? translateResearchLabels(meta.doneLabels) : meta.doneLabels
    return `${t.captionCompleted}: ${labels}`
  }
  if (id === 'dedup_gaps') {
    if (meta.deepenTotal !== undefined && meta.dealsTotal !== undefined) {
      return t.captionGaps(meta.deepenTotal, meta.dealsTotal)
    }
    if (meta.dealsTotal !== undefined) return t.captionUnique(meta.dealsTotal)
    return ''
  }
  if (id.startsWith('deepening') && meta.dealIndex !== undefined && meta.dealTotal !== undefined) {
    return `${meta.dealIndex}/${meta.dealTotal}: ${meta.deal ?? ''}`
  }
  return ''
}

interface PhaseListProps {
  mission: MissionState
  cancelled: boolean
  failed: boolean
}

export default function PhaseList({ mission, cancelled, failed }: PhaseListProps) {
  const { lang, t } = useI18n()
  const caption = activeCaption(mission, lang, t)
  const danger = cancelled || failed
  return (
    <ol className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6" aria-label={t.phaseListAria}>
      {PHASES.map((p, i) => {
        const active = i === mission.idx
        const done = i < mission.idx || (active && mission.progress >= 1 && i === PHASES.length - 1)
        const tone = done
          ? 'border-den-teal/40 bg-den-teal/5 text-den-teal/90'
          : active
            ? danger
              ? 'border-den-red/50 bg-den-red/10 text-red-300'
              : 'border-den-gold/60 bg-den-gold/10 text-den-gold'
            : 'border-white/10 bg-white/[0.03] text-white/30'
        return (
          <li
            key={p.id}
            title={p.listLabel[lang]}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-500 ${tone}`}
          >
            <PhaseGlyph icon={p.icon} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5 font-mono text-[9.5px] tracking-[0.1em] uppercase">
                <span className="opacity-60">{p.num}</span>
                <span className="truncate">{p.label[lang]}</span>
                {done && (
                  <svg className="ml-auto h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M1.5 5.5 4 8l4.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {active && !done && (
                  <span
                    className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${
                      danger ? 'bg-den-red' : 'animate-pulse bg-den-gold motion-reduce:animate-none'
                    }`}
                  />
                )}
              </span>
              {active && caption && (
                <span className="block truncate font-mono text-[9px] tracking-[0.04em] text-white/45 normal-case">
                  {caption}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
